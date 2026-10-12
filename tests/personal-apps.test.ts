import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { BAZAAR_CLIENT_SCOPES, createBazaarProvisioner, registeredBazaarDefinition } from "../app/apps/bazaar-profile";
import { approveRegisteredApp, suspendRegisteredApp } from "../app/apps/registry";
import { createAppService } from "../app/apps/service";
import { createSqlAppStore } from "../app/apps/store";
import type { BazaarEnrollmentIntent, BazaarEnrollmentReceipt, BazaarGrant, BazaarProvisioner } from "../app/apps/types";

type LocalDatabase = { exec(sql: string): Promise<unknown>; query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; close(): Promise<void> };
type LocalDatabaseConstructor = new () => LocalDatabase;
let Database: LocalDatabaseConstructor | undefined;
try {
  Database = createRequire(resolve(process.cwd(), "work/personal-apps-qa/runtime/package.json"))("@electric-sql/pglite").PGlite as LocalDatabaseConstructor;
} catch { /* Optional isolated test runtime. No application dependency or production connection. */ }
if (process.env.CARMELITA_SQL_TESTS_REQUIRED === "true" && !Database) throw new Error("The required isolated PGlite runtime is missing");
const own = "did:privy:test-owner-a", other = "did:privy:test-owner-b";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secrets = { encrypt: (value: string) => `synthetic:${Buffer.from(value).toString("base64url")}`,
  decrypt: (value: string) => Buffer.from(value.slice("synthetic:".length), "base64url").toString() };
function remote() {
  const owners = new Map<string, { receipt: BazaarEnrollmentReceipt; intent: BazaarEnrollmentIntent; hashes: Map<string, string> }>();
  let calls = 0, loseEnrollment = false, revokeFailure = false;
  let enrollmentWait: Promise<void> | null = null, releaseEnrollment: (() => void) | null = null;
  let enrollmentStarted: (() => void) | null = null;
  const identity = (credential: string) => {
    for (const value of owners.values()) for (const grant of value.receipt.grants) {
      if (!grant.revoked && value.hashes.get(grant.clientId) === hash(credential)) return { ...value.receipt, grant };
    }
    throw new Error("app_bazaar_not_authorized");
  };
  const provider: BazaarProvisioner = {
    async enroll(intent) {
      calls++;
      enrollmentStarted?.(); if (enrollmentWait) await enrollmentWait;
      let value = owners.get(intent.creationId);
      if (value) assert.deepEqual(value.intent, intent, "Recovery repeats the same intention and credentials");
      else {
        const receipt = { ownerId: `owner-${randomUUID()}`, workspaceId: randomUUID(), agentId: randomUUID(), generation: 1,
          grants: (["carmelita-web", "carmelita-chatgpt"] as const).map(clientId => ({ clientId, grantId: randomUUID(), revision: 1, scopes: [...BAZAAR_CLIENT_SCOPES[clientId]], revoked: false })) };
        value = { receipt, intent, hashes: new Map([["carmelita-web", hash(intent.webCredential)], ["carmelita-chatgpt", hash(intent.readCredential)]]) };
        owners.set(intent.creationId, value);
      }
      if (loseEnrollment) { loseEnrollment = false; throw new Error("app_bazaar_unavailable"); }
      return structuredClone(value.receipt);
    },
    async lookup({ creationId, recoveryCredential }) {
      const value = owners.get(creationId); return value?.intent.recoveryCredential === recoveryCredential ? structuredClone(value.receipt) : null;
    },
    async status({ workspaceId, recoveryCredential }) {
      const value = [...owners.values()].find(record => record.receipt.workspaceId === workspaceId && record.intent.recoveryCredential === recoveryCredential);
      assert.ok(value); return structuredClone(value.receipt);
    },
    async identity({ credential, channel }) {
      const result = identity(credential); assert.equal(result.grant.clientId, channel === "web" ? "carmelita-web" : "carmelita-chatgpt");
      return structuredClone(result);
    },
    async revoke(input) {
      if (revokeFailure) throw new Error("app_bazaar_unavailable");
      const value = [...owners.values()].find(record => record.receipt.workspaceId === input.workspaceId); assert.ok(value);
      assert.equal(value.intent.recoveryCredential, input.recoveryCredential);
      const grant = value.receipt.grants.find(grant => grant.clientId === input.clientId)!;
      assert.equal(grant.revision, input.expectedRevision); grant.revision++; grant.revoked = true; return structuredClone(grant);
    },
    async rotate(input) {
      const value = [...owners.values()].find(record => record.receipt.workspaceId === input.workspaceId); assert.ok(value);
      assert.equal(value.intent.recoveryCredential, input.recoveryCredential);
      const grant = value.receipt.grants.find(grant => grant.clientId === input.clientId)!;
      assert.equal(grant.revision, input.expectedRevision); grant.revision++; grant.revoked = false;
      value.hashes.set(input.clientId, input.accessHash); return structuredClone(grant);
    },
  };
  return { provider, owners, get calls() { return calls; }, loseNextEnrollment() { loseEnrollment = true; }, setRevokeFailure(value: boolean) { revokeFailure = value; },
    pauseEnrollment() { enrollmentWait = new Promise<void>(resolve => { releaseEnrollment = resolve; });
      return new Promise<void>(resolve => { enrollmentStarted = resolve; }); },
    resumeEnrollment() { releaseEnrollment?.(); enrollmentWait = null; },
  };
}
async function fixture() {
  assert.ok(Database); const db = new Database();
  await db.exec("CREATE TABLE agent_users(id text PRIMARY KEY); CREATE TABLE integration_recommendations(id text PRIMARY KEY);");
  await db.query("INSERT INTO agent_users(id) VALUES($1),($2)", [own, other]);
  const migration = await readFile(new URL("../drizzle/0022_personal_apps.sql", import.meta.url), "utf8");
  await db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const store = createSqlAppStore(async (query, parameters) => (await db.query(query, parameters)).rows);
  const provider = remote(); let time = Date.parse("2026-10-12T12:00:00Z");
  const service = createAppService({ store, provisioner: provider.provider, codec: secrets, now: () => time });
  const approve = () => approveRegisteredApp({ appId: "bazaar", reviewer: "synthetic-admin", evidence: "local-controlled-fixture", expectedVersion: "1" }, store);
  return { db, store, provider, service, approve, expire: () => { time += 601_000; } };
}
const isolated = { skip: !Database ? "Isolated PGlite runtime not installed; never substitute a production DB." : false };
test("SQL: an expected approval revision prevents stale decisions and concurrent reviewers from overwriting each other", isolated, async () => {
  const f = await fixture(); try {
    const review = { appId: "bazaar", reviewer: "synthetic-admin", evidence: "controlled-review-reference", expectedVersion: "1", expectedApprovalRevision: 0 };
    const initial = await approveRegisteredApp(review, f.store); assert.equal(initial.approvalRevision, 1);
    await assert.rejects(approveRegisteredApp(review, f.store), /app_review_conflict/);
    const decisions = await Promise.allSettled([approveRegisteredApp({ ...review, expectedApprovalRevision: 1 }, f.store), suspendRegisteredApp({ ...review, expectedApprovalRevision: 1 }, f.store)]);
    assert.equal(decisions.filter(value => value.status === "fulfilled").length, 1);
    assert.equal((await f.store.definition("bazaar"))?.approvalRevision, 2);
    await assert.rejects(suspendRegisteredApp({ ...review, expectedApprovalRevision: 1 }, f.store), /app_review_conflict/);
    assert.equal(f.provider.calls, 0); assert.equal(f.provider.owners.size, 0);
    assert.deepEqual((await f.service.listOwnApps(own)).apps, []);
  } finally { await f.db.close(); }
});
test("reviewed adapter definitions default to awaiting review and public profiles have no dynamic targets", async () => {
  assert.equal(registeredBazaarDefinition().approval, "awaiting_review");
  let count = 0;
  const provider = createBazaarProvisioner({ enabled: () => false, fetcher: async () => { count++; throw new Error("must not fetch"); } });
  await assert.rejects(provider.enroll({ creationId: randomUUID(), recoveryCredential: "a".repeat(43), webCredential: "b".repeat(43), readCredential: "c".repeat(43), generation: 1 }), /app_bazaar_disabled/);
  assert.equal(count, 0);
});
test("SQL: approval, ownership, channel-bound confirmation, cancellation and expiration precede provisioning", isolated, async () => {
  const f = await fixture(); try {
    assert.equal((await f.service.listAvailableApps()).apps[0].approval, "awaiting_review");
    await assert.rejects(f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web"), /app_not_approved/);
    await f.approve();
    const prepared = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: "first-preparation" }, "chatgpt");
    const duplicate = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: "first-preparation" }, "chatgpt");
    assert.deepEqual(prepared, duplicate);
    await assert.rejects(f.service.confirmAppChange(other, { changeId: prepared.change.id, confirmationToken: prepared.confirmationToken }, "chatgpt"), /app_change_not_found/);
    await assert.rejects(f.service.confirmAppChange(own, { changeId: prepared.change.id, confirmationToken: prepared.confirmationToken }, "web"), /app_change_not_found/);
    await assert.rejects(f.service.confirmAppChange(own, { changeId: prepared.change.id, confirmationToken: `appc_${"x".repeat(43)}` }, "chatgpt"), /app_confirmation_invalid/);
    await f.service.cancelAppChange(own, { changeId: prepared.change.id }, "chatgpt");
    await assert.rejects(f.service.confirmAppChange(own, { changeId: prepared.change.id, confirmationToken: prepared.confirmationToken }, "chatgpt"), /app_change_cancelled/);
    const expiring = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web"); f.expire();
    await assert.rejects(f.service.confirmAppChange(own, { changeId: expiring.change.id, confirmationToken: expiring.confirmationToken }, "web"), /app_change_expired/);
    assert.equal(f.provider.calls, 0);
  } finally { await f.db.close(); }
});
test("SQL: concurrent confirmations create one private enrollment; two accounts get distinct identities and credentials", isolated, async () => {
  const f = await fixture(); try {
    await f.approve(); const p = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "chatgpt");
    const replies = await Promise.all(Array.from({ length: 5 }, () => f.service.confirmAppChange(own, { changeId: p.change.id, confirmationToken: p.confirmationToken }, "chatgpt")));
    assert.ok(replies.some(reply => reply.app?.status === "active")); assert.equal(f.provider.owners.size, 1); assert.equal(f.provider.calls, 1);
    const p2 = await f.service.prepareAppChange(other, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    await f.service.confirmAppChange(other, { changeId: p2.change.id, confirmationToken: p2.confirmationToken }, "web");
    const [a, b, web] = await Promise.all([f.service.readOwnBazaarCredential(own, "chatgpt"), f.service.readOwnBazaarCredential(other, "chatgpt"), f.service.readOwnBazaarCredential(own, "web")]);
    assert.notEqual(a.ownerId, b.ownerId); assert.notEqual(a.credential, b.credential); assert.notEqual(a.credential, web.credential);
    assert.ok(!a.scopes.some(scope => scope.startsWith("payments:") || scope === "orders:create"));
    const publicState = JSON.stringify(await f.service.listOwnApps(own));
    assert.ok(!publicState.includes(a.credential)); assert.ok(!publicState.includes(a.ownerId)); assert.ok(!publicState.includes("synthetic-admin"));
    await suspendRegisteredApp({ appId: "bazaar", reviewer: "synthetic-admin", evidence: "suspend-fixture", expectedVersion: "1" }, f.store);
    await assert.rejects(f.service.readOwnBazaarCredential(own, "chatgpt"), /app_not_approved/);
  } finally { await f.db.close(); }
});
test("SQL: response loss recovers same enrollment; removal blocks before revocation and re-add retains owner", isolated, async () => {
  const f = await fixture(); try {
    await f.approve(); const p = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    f.provider.loseNextEnrollment(); const first = await f.service.confirmAppChange(own, { changeId: p.change.id, confirmationToken: p.confirmationToken }, "web");
    assert.equal(first.app?.status, "preparing"); assert.equal(first.app?.error, "app_bazaar_unavailable");
    const retry = await f.service.retryAppConnection(own, "bazaar");
    assert.equal(retry.app?.status, "active"); assert.equal(f.provider.owners.size, 1);
    const original = await f.service.readOwnBazaarCredential(own, "chatgpt");
    const r = await f.service.prepareAppChange(own, { appId: "bazaar", action: "remove", idempotencyKey: randomUUID() }, "chatgpt");
    f.provider.setRevokeFailure(true); const removed = await f.service.confirmAppChange(own, { changeId: r.change.id, confirmationToken: r.confirmationToken }, "chatgpt");
    assert.equal(removed.app?.status, "removed"); assert.equal(removed.app?.remoteStatus, "revocation_pending");
    await assert.rejects(f.service.readOwnBazaarCredential(own, "chatgpt"), /app_installation_required/);
    f.provider.setRevokeFailure(false); assert.equal((await f.service.retryAppConnection(own, "bazaar")).app?.remoteStatus, "revoked");
    await assert.rejects(f.service.retryAppConnection(own, "bazaar"), /app_retry_not_needed/);
    const again = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    assert.equal((await f.service.confirmAppChange(own, { changeId: again.change.id, confirmationToken: again.confirmationToken }, "web")).app?.status, "active");
    const current = await f.service.readOwnBazaarCredential(own, "chatgpt"); assert.equal(current.ownerId, original.ownerId);
    assert.notEqual(current.credential, original.credential); assert.equal(f.provider.owners.size, 1);
  } finally { await f.db.close(); }
});
test("consumer response rejects financial authority for ChatGPT", async () => {
  const grant: BazaarGrant = { clientId: "carmelita-chatgpt", grantId: randomUUID(), revision: 1, revoked: false, scopes: ["catalog:read", "orders:read", "deliveries:read", "payments:submit"] };
  const provider = createBazaarProvisioner({ enabled: () => true, fetcher: async () => Response.json({ version: 1, identity: { ownerId: "synthetic-owner", workspaceId: randomUUID(), agentId: randomUUID(), generation: 1 }, grant }) });
  await assert.rejects(provider.identity({ credential: "a".repeat(43), channel: "chatgpt" }), /app_bazaar_scope_invalid/);
});
test("SQL: removal during an unacknowledged enrollment cannot activate the app or falsely certify remote revocation", isolated, async () => {
  const f = await fixture(); try {
    await f.approve(); const p = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    const started = f.provider.pauseEnrollment();
    const installing = f.service.confirmAppChange(own, { changeId: p.change.id, confirmationToken: p.confirmationToken }, "web");
    await started;
    const r = await f.service.prepareAppChange(own, { appId: "bazaar", action: "remove", idempotencyKey: randomUUID() }, "chatgpt");
    const removed = await f.service.confirmAppChange(own, { changeId: r.change.id, confirmationToken: r.confirmationToken }, "chatgpt");
    assert.equal(removed.app?.status, "removed"); assert.equal(removed.app?.remoteStatus, "revocation_pending");
    f.provider.resumeEnrollment(); assert.equal((await installing).app?.status, "removed");
    await assert.rejects(f.service.readOwnBazaarCredential(own, "chatgpt"), /app_installation_required/);
    assert.equal((await f.service.confirmAppChange(own, { changeId: r.change.id, confirmationToken: r.confirmationToken }, "chatgpt")).app?.remoteStatus, "revoked");
    assert.ok([...f.provider.owners.values()][0].receipt.grants.every(grant => grant.revoked));
  } finally { await f.db.close(); }
});
test("SQL: changed approval invalidates pending confirmation; proposal review columns and one pending purchase constraint are enforced", isolated, async () => {
  const f = await fixture(); try {
    await f.approve(); const p = await f.service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    const definition = await f.store.definition("bazaar"); assert.ok(definition);
    await f.store.saveDefinition({ ...definition, definitionHash: "f".repeat(64), approvalRevision: definition.approvalRevision + 1 }, definition.approvalRevision);
    await assert.rejects(f.service.confirmAppChange(own, { changeId: p.change.id, confirmationToken: p.confirmationToken }, "web"), /app_not_approved/);
    assert.equal(f.provider.calls, 0);
    const proposal = await f.db.query("INSERT INTO integration_recommendations(id) VALUES('synthetic-proposal') RETURNING review_version,review_reason,review_actor,reviewed_at,review_request_id");
    assert.deepEqual(proposal.rows[0], { review_version: 0, review_reason: null, review_actor: null, reviewed_at: null, review_request_id: null });
    const insert = () => f.db.query("INSERT INTO agent_app_operations(id,user_id,app_id,remote_operation_id,idempotency_key) VALUES($1,$2,'bazaar',$3,$4)", [randomUUID(), own, randomUUID(), randomUUID()]);
    const concurrent = await Promise.allSettled([insert(), insert()]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    await f.db.query("UPDATE agent_app_operations SET phase='uncertain' WHERE user_id=$1", [own]);
    await assert.rejects(insert());
    await f.db.query("UPDATE agent_app_operations SET phase='completed' WHERE user_id=$1", [own]);
    await insert();
  } finally { await f.db.close(); }
});
test("consumer network deadline covers ignored abort and stalled bodies; stream cancellation and body limits are enforced", async () => {
  const base = { enabled: () => true, timeoutMs: 20 };
  const ignoredAbort = createBazaarProvisioner({ ...base, fetcher: async () => new Promise<Response>(() => {}) });
  const started = Date.now();
  await assert.rejects(ignoredAbort.identity({ credential: "a".repeat(43), channel: "chatgpt" }), /app_bazaar_timeout/);
  assert.ok(Date.now() - started < 1000);
  let cancelled = false;
  const stalled = createBazaarProvisioner({ ...base, fetcher: async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"version":')); }, cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }) });
  await assert.rejects(stalled.identity({ credential: "a".repeat(43), channel: "chatgpt" }), /app_bazaar_timeout/);
  assert.equal(cancelled, true);
  const oversized = createBazaarProvisioner({ enabled: () => true, fetcher: async () => new Response("x".repeat(32_769), { headers: { "content-type": "application/json" } }) });
  await assert.rejects(oversized.identity({ credential: "a".repeat(43), channel: "chatgpt" }), /app_bazaar_response_invalid/);
  const length = createBazaarProvisioner({ enabled: () => true, fetcher: async () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "32769" } }) });
  await assert.rejects(length.identity({ credential: "a".repeat(43), channel: "chatgpt" }), /app_bazaar_response_invalid/);
});
test("consumer enrollment binds its creation receipt and sends only credential hashes to a fixed endpoint", async () => {
  const creationId = randomUUID(), recoveryCredential = "a".repeat(43), webCredential = "b".repeat(43), readCredential = "c".repeat(43);
  const provider = createBazaarProvisioner({ enabled: () => true, fetcher: async (url, init) => {
    assert.equal(String(url), "https://bazaar.browns.studio/api/consumer/enroll"); assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${recoveryCredential}`);
    assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "omit");
    assert.deepEqual(JSON.parse(String(init?.body)), { version: 1, creationId, webAccessHash: hash(webCredential), readAccessHash: hash(readCredential) });
    return Response.json({ version: 1, identity: { ownerId: "synthetic-owner", workspaceId: randomUUID(), agentId: randomUUID(), generation: 1, creationId: randomUUID() }, grants: [] });
  } });
  await assert.rejects(provider.enroll({ creationId, recoveryCredential, webCredential, readCredential, generation: 1 }), /app_bazaar_owner_mismatch/);
  const pending = createBazaarProvisioner({ enabled: () => true, fetcher: async () => Response.json({ version: 1, enrollment: "pending", identity: { ownerId: "synthetic-owner", workspaceId: randomUUID(), agentId: randomUUID(), generation: 1, creationId }, grants: [] }) });
  assert.equal((await pending.lookup({ recoveryCredential, creationId }))?.grants.length, 0);
});
