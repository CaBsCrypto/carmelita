import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { BAZAAR_APP_ORIGIN, BAZAAR_CLIENT_SCOPES, createBazaarProvisioner } from "../app/apps/bazaar-profile";
import { approveRegisteredApp } from "../app/apps/registry";
import { createAppService } from "../app/apps/service";
import { createSqlAppStore } from "../app/apps/store";

type LocalDatabase = { exec(sql: string): Promise<unknown>; query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; close(): Promise<void> };
type HttpFixture = { fetcher: typeof fetch; requests: number; data: Map<string, string>; dispose(): void; failNextEnrollmentCommit(): void };
type FixtureModule = { createConsumerHttpFixture(options: { origin: string }): HttpFixture };
const checkout = process.env.CARMELITA_BAZAAR_CHECKOUT;
const required = process.env.CARMELITA_BAZAAR_CONFORMANCE_REQUIRED === "true";
if (required && !checkout) throw new Error("The native Bazaar checkout is required for this conformance run");
const own = "did:privy:conformance-owner-a", other = "did:privy:conformance-owner-b";
const token = () => randomBytes(32).toString("base64url");
const codec = { encrypt: (value: string) => `fixture:${Buffer.from(value).toString("base64url")}`,
  decrypt: (value: string) => Buffer.from(value.slice("fixture:".length), "base64url").toString() };

test("local native Bazaar HTTP and Carmelita PostgreSQL contract conform for private enrollment and grant management", {
  skip: !checkout ? "Cross-repository conformance requires an explicit checkout; use scripts/test-personal-apps-contract.mjs." : false,
}, async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Conformance fixture forbids all actual network access"); };
  let fixture: HttpFixture | undefined, db: LocalDatabase | undefined;
  try {
    const fixturePath = resolve(checkout!, "scripts/fixtures/consumer-http-fixture.mjs");
    const loaded = await import(pathToFileURL(fixturePath).href) as FixtureModule;
    fixture = loaded.createConsumerHttpFixture({ origin: BAZAAR_APP_ORIGIN });
    const Runtime = createRequire(resolve(process.cwd(), "work/personal-apps-qa/runtime/package.json"))("@electric-sql/pglite").PGlite as new () => LocalDatabase;
    db = new Runtime();
    await db.exec("CREATE TABLE agent_users(id text PRIMARY KEY); CREATE TABLE integration_recommendations(id text PRIMARY KEY);");
    await db.query("INSERT INTO agent_users(id) VALUES($1),($2)", [own, other]);
    const migration = await readFile(new URL("../drizzle/0022_personal_apps.sql", import.meta.url), "utf8");
    await db.exec(migration.replaceAll("--> statement-breakpoint", ""));
    const database = db;
    const store = createSqlAppStore(async (sql, parameters) => (await database.query(sql, parameters)).rows);
    const nativeFetch = fixture.fetcher.bind(fixture);
    let loseEnrollmentReply = false;
    const fetcher: typeof fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      if (loseEnrollmentReply && String(input).endsWith("/api/consumer/enroll") && response.ok) {
        loseEnrollmentReply = false; throw new Error("Synthetic loss after native enrollment committed");
      }
      return response;
    };
    const provisioner = createBazaarProvisioner({ enabled: () => true, fetcher });
    const service = createAppService({ store, provisioner, codec });
    await approveRegisteredApp({ appId: "bazaar", expectedVersion: "1", reviewer: "synthetic-local-reviewer", evidence: "native-consumer-conformance-fixture" }, store);
    const first = await service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "chatgpt");
    const joined = await Promise.all(Array.from({ length: 3 }, () => service.confirmAppChange(own, { changeId: first.change.id, confirmationToken: first.confirmationToken }, "chatgpt")));
    assert.ok(joined.some(reply => reply.app?.status === "active"), "Native receipt and grants must activate the personal installation");
    const a = await service.readOwnBazaarCredential(own, "chatgpt"), web = await service.readOwnBazaarCredential(own, "web");
    assert.equal(a.ownerId, web.ownerId); assert.notEqual(a.credential, web.credential);
    assert.ok(!a.scopes.some(scope => scope.startsWith("payments:") || scope === "orders:create"));
    assert.deepEqual(a.scopes, [...BAZAAR_CLIENT_SCOPES["carmelita-chatgpt"]]);
    assert.deepEqual(web.scopes, [...BAZAAR_CLIENT_SCOPES["carmelita-web"]]);
    assert.equal((await service.listOwnApps(other)).apps.length, 0);
    const second = await service.prepareAppChange(other, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    loseEnrollmentReply = true;
    const lost = await service.confirmAppChange(other, { changeId: second.change.id, confirmationToken: second.confirmationToken }, "web");
    assert.equal(lost.app?.status, "preparing");
    assert.equal((await service.retryAppConnection(other, "bazaar")).app?.status, "active");
    const b = await service.readOwnBazaarCredential(other, "chatgpt");
    assert.notEqual(a.ownerId, b.ownerId); assert.notEqual(a.workspaceId, b.workspaceId); assert.notEqual(a.credential, b.credential);
    const before = (await store.enrollment(own, "bazaar"))!;
    const removed = await service.prepareAppChange(own, { appId: "bazaar", action: "remove", idempotencyKey: randomUUID() }, "chatgpt");
    const removal = await service.confirmAppChange(own, { changeId: removed.change.id, confirmationToken: removed.confirmationToken }, "chatgpt");
    assert.equal(removal.app?.status, "removed"); assert.equal(removal.app?.remoteStatus, "revoked");
    await assert.rejects(provisioner.identity({ credential: a.credential, channel: "chatgpt" }), /app_bazaar_not_authorized/);
    await assert.rejects(provisioner.identity({ credential: web.credential, channel: "web" }), /app_bazaar_not_authorized/);
    const revoked = await provisioner.lookup({ creationId: before.creationId, recoveryCredential: codec.decrypt(before.recoveryCredentialEncrypted) });
    assert.ok(revoked?.grants.every(grant => grant.revoked));
    const again = await service.prepareAppChange(own, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    assert.equal((await service.confirmAppChange(own, { changeId: again.change.id, confirmationToken: again.confirmationToken }, "web")).app?.status, "active");
    const current = await service.readOwnBazaarCredential(own, "chatgpt"), after = (await store.enrollment(own, "bazaar"))!;
    assert.equal(after.creationId, before.creationId); assert.equal(current.ownerId, a.ownerId); assert.equal(current.workspaceId, a.workspaceId);
    assert.notEqual(current.credential, a.credential); assert.ok(current.grantRevision > a.grantRevision);
    assert.equal((await service.readOwnBazaarCredential(other, "chatgpt")).ownerId, b.ownerId);
    const publicState = JSON.stringify(await service.listOwnApps(own));
    assert.ok(!publicState.includes(current.credential)); assert.ok(!publicState.includes(current.ownerId));
    assert.ok(!publicState.includes("synthetic-local-reviewer"));

    // Exercise the real partial-enrollment recovery receipt, not a fabricated response.
    const creationId = randomUUID(), recovery = token(), webPartial = token(), readPartial = token();
    const partialIntent = { creationId, recoveryCredential: recovery, webCredential: webPartial, readCredential: readPartial, generation: 1 };
    fixture.failNextEnrollmentCommit();
    await assert.rejects(provisioner.enroll(partialIntent), /app_bazaar_unavailable/);
    const pending = await provisioner.lookup({ creationId, recoveryCredential: recovery });
    assert.ok(pending); assert.equal(pending.grants.length, 0);
    assert.equal((await provisioner.status({ recoveryCredential: recovery, workspaceId: pending.workspaceId })).grants.length, 0);
    await assert.rejects(provisioner.enroll({ ...partialIntent, readCredential: token() }), /app_bazaar_unavailable/);
    const recovered = await provisioner.enroll(partialIntent);
    assert.equal(recovered.ownerId, pending.ownerId); assert.equal(recovered.workspaceId, pending.workspaceId); assert.equal(recovered.grants.length, 2);
    assert.ok(fixture.requests > 10);
    const persisted = [...fixture.data.values()].join("\n");
    assert.ok(!persisted.includes(recovery)); assert.ok(!persisted.includes(webPartial)); assert.ok(!persisted.includes(readPartial));

    // Real PostgreSQL serializes generation changes even with distinct pending
    // native nonces. A stale approval hash cannot begin external provisioning.
    const racingOwner = "did:privy:conformance-race";
    await db.query("INSERT INTO agent_users(id) VALUES($1)", [racingOwner]);
    const obsolete = await service.prepareAppChange(racingOwner, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "chatgpt");
    const definition = await store.definition("bazaar"); assert.ok(definition);
    await store.saveDefinition({ ...definition, definitionHash: "d".repeat(64), approvalRevision: definition.approvalRevision + 1 }, definition.approvalRevision);
    const requestsBeforeRejection = fixture.requests;
    await assert.rejects(service.confirmAppChange(racingOwner, { changeId: obsolete.change.id, confirmationToken: obsolete.confirmationToken }, "chatgpt"), /app_not_approved/);
    assert.equal(fixture.requests, requestsBeforeRejection);
    await approveRegisteredApp({ appId: "bazaar", expectedVersion: "1", reviewer: "synthetic-local-reviewer", evidence: "restored-fixed-profile-for-local-race" }, store);
    const preparedOne = await service.prepareAppChange(racingOwner, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "chatgpt");
    const preparedTwo = await service.prepareAppChange(racingOwner, { appId: "bazaar", action: "add", idempotencyKey: randomUUID() }, "web");
    const outcomes = await Promise.allSettled([
      service.confirmAppChange(racingOwner, { changeId: preparedOne.change.id, confirmationToken: preparedOne.confirmationToken }, "chatgpt"),
      service.confirmAppChange(racingOwner, { changeId: preparedTwo.change.id, confirmationToken: preparedTwo.confirmationToken }, "web"),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
    assert.equal((await store.installation(racingOwner, "bazaar"))?.generation, 1);
    assert.equal((await store.installation(racingOwner, "bazaar"))?.status, "active");
    await assert.rejects(service.confirmAppChange(racingOwner, { changeId: obsolete.change.id, confirmationToken: obsolete.confirmationToken }, "chatgpt"), /app_change_conflict/);
  } finally {
    if (db) await db.close(); fixture?.dispose(); globalThis.fetch = previousFetch;
  }
});
