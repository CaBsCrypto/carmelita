import assert from "node:assert/strict";
import { mock, test, after } from "node:test";
import { createRequire, registerHooks } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createSqlAppStore } from "../app/apps/store";
import { approveRegisteredApp, suspendRegisteredApp, publicAppDefinition, readRegisteredApp } from "../app/apps/registry";

const isolatedRequire = createRequire(resolve(process.cwd(), "work/personal-apps-qa/runtime/package.json"));
const Runtime = isolatedRequire("@electric-sql/pglite").PGlite;
registerHooks({ resolve(specifier, context, next) { return specifier === "@electric-sql/pglite" ? { url: pathToFileURL(isolatedRequire.resolve(specifier)).href, shortCircuit: true } : next(specifier, context); } });
const { drizzle } = await import("drizzle-orm/pglite");
const database = new Runtime();
let authenticated = true, writes = 0, reads = 0, network = 0;
mock.method(globalThis, "fetch", async () => { network++; throw new Error("Network forbidden in isolated tests"); });
await database.exec("CREATE TABLE agent_users(id text PRIMARY KEY); CREATE TABLE integration_recommendations(id text PRIMARY KEY);");
await database.query("INSERT INTO agent_users(id) VALUES($1),($2),($3)", ["did:privy:retention-a", "did:privy:retention-b", "did:privy:retention-c"]);
await database.exec((await readFile(new URL("../drizzle/0022_personal_apps.sql", import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
const store = createSqlAppStore(async (sql, parameters) => (await database.query(sql, parameters)).rows);
mock.module(new URL("../app/admin/auth.ts", import.meta.url).href, { namedExports: { getAdminIdentity: async () => authenticated ? { username: "synthetic-reviewer", method: "password" } : null } });
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, { namedExports: { verifyPrivyAccessToken: async () => { throw new Error("Privy forbidden in isolated admin tests"); } } });
mock.module(new URL("../db/index.ts", import.meta.url).href, { namedExports: { getDb: () => drizzle(database), getDatabaseUrl: () => { throw new Error("External database forbidden"); }, hasDatabase: () => true } });
mock.module(new URL("../app/apps/registry.ts", import.meta.url).href, { namedExports: {
  publicAppDefinition,
  approveRegisteredApp: async (input: Parameters<typeof approveRegisteredApp>[0]) => { writes++; return approveRegisteredApp(input, store); },
  suspendRegisteredApp: async (input: Parameters<typeof suspendRegisteredApp>[0]) => { writes++; return suspendRegisteredApp(input, store); },
} });
mock.module(new URL("../app/apps/service.ts", import.meta.url).href, { namedExports: { listAvailableApps: async () => { reads++; return { apps: [publicAppDefinition(await readRegisteredApp("bazaar", store))] }; } } });
const admin = await import("../app/api/admin/apps/route");
const maintenance = await import("../app/api/admin/apps/maintenance/route");
const { bazaarOperationStore, pruneExpiredBazaarInputs } = await import("../app/bazaar/consumer-store");
const base = "https://preview.example.test";
const review = { appId: "bazaar", action: "approve", expectedVersion: "1", expectedApprovalRevision: 0, evidence: "synthetic-private-review-reference" };
const request = (body: unknown, path = "/api/admin/apps", origin = base) => new Request(base + path, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function response(response: Response, status: number, error?: string) { assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store"); const value = await response.json(); if (error) assert.deepEqual(value, { error }); return value; }
after(async () => { await database.close(); });

test("admin app and retention APIs deny unauthenticated and foreign-origin requests before storage", async () => {
  authenticated = false;
  await response(await admin.GET(), 401, "apps_admin_required"); await response(await admin.POST(request(review)), 401, "apps_admin_required");
  await response(await maintenance.POST(request({ operation: "prune-expired-inputs" }, "/api/admin/apps/maintenance")), 401, "apps_admin_required");
  authenticated = true;
  await response(await admin.POST(request(review, "/api/admin/apps", "https://outside.example.test")), 403, "apps_invalid_origin");
  await response(await maintenance.POST(request({ operation: "prune-expired-inputs" }, "/api/admin/apps/maintenance", "https://outside.example.test")), 403, "apps_invalid_origin");
  assert.equal(writes + reads, 0);
});
test("the admin API requires the observed approval revision and never accepts caller-selected reviewer identity", async () => {
  const { expectedApprovalRevision: _revision, ...missing } = review; void _revision;
  for (const value of [missing, { ...review, expectedApprovalRevision: -1 }, { ...review, reviewer: "spoofed" }, { ...review, appId: "unreviewed-url" }]) await response(await admin.POST(request(value)), 400, "apps_invalid_input");
  assert.equal(writes, 0);
  const saved = await response(await admin.POST(request(review)), 200); assert.equal(saved.app.approvalRevision, 1); assert.equal(saved.app.approval, "approved");
  assert.equal("evidence" in saved.app, false); assert.doesNotMatch(JSON.stringify(saved), /synthetic-reviewer|synthetic-private-review-reference/);
  await response(await admin.POST(request(review)), 409, "app_review_conflict");
  const listed = await response(await admin.GET(), 200); assert.equal(listed.apps[0].approvalRevision, 1); assert.equal("evidence" in listed.apps[0], false);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM personal_app_installations")).rows[0].count, 0);
});
test("explicit seven-day maintenance redacts only expired Bazaar inputs across owners and fences stale writes", async () => {
  const now = Date.now(), week = 7 * 24 * 60 * 60_000;
  const state = { intent: { operationId: "retention-a", serviceId: "synthetic-service", cardHash: "a".repeat(64), payer: "synthetic-payer", paymentProtocol: "x402-stellar-exact-v2", input: { private: "Synthetic private draft" } }, terms: { serviceId: "synthetic-service", cardHash: "a".repeat(64), inputHash: "b".repeat(64), payer: "synthetic-payer", amountAtomic: "1", destination: "synthetic-recipient", network: "stellar:testnet", asset: "synthetic-usdc" }, intentHash: "c".repeat(64), remoteIntentHash: "d".repeat(64), authorization: { private: "Synthetic signature material" }, challenge: { private: "Synthetic challenge" } };
  for (const [id, owner, appId, created] of [["retention-a", "did:privy:retention-a", "bazaar", now - week - 1], ["retention-b", "did:privy:retention-b", "bazaar", now - week - 1], ["retention-c", "did:privy:retention-c", "bazaar", now - week + 10_000], ["retention-other", "did:privy:retention-a", "other-app", now - week - 1]] as const) {
    await database.query("INSERT INTO agent_app_operations(id,user_id,app_id,remote_operation_id,idempotency_key,phase,state,created_at) VALUES($1,$2,$3,$1,$1,'paid',$4::jsonb,$5)", [id, owner, appId, JSON.stringify(state), new Date(created).toISOString()]);
  }
  const original = await bazaarOperationStore.find("did:privy:retention-a", "retention-a");
  assert.deepEqual(await pruneExpiredBazaarInputs(now), { prunedOperations: 2 });
  const redacted = await bazaarOperationStore.find("did:privy:retention-a", "retention-a");
  assert.deepEqual(redacted.state.intent.input, {}); assert.equal(redacted.state.contentExpired, true); assert.equal(redacted.state.authorization, undefined); assert.equal(redacted.state.challenge, undefined);
  assert.deepEqual(redacted.state.terms, original.state.terms); assert.equal(redacted.state.remoteIntentHash, original.state.remoteIntentHash); assert.equal(redacted.version, original.version + 1);
  await assert.rejects(bazaarOperationStore.update(original, "paid", original.state), /operation_conflict/);
  await assert.rejects(bazaarOperationStore.find("did:privy:retention-b", "retention-a"), /not_found/);
  await assert.rejects(bazaarOperationStore.find("did:privy:retention-a", "retention-other"), /not_found/);
  const rows = (await database.query("SELECT id,state,version FROM agent_app_operations ORDER BY id")).rows;
  assert.ok(rows.filter((value: { id: string }) => value.id === "retention-c" || value.id === "retention-other").every((value: { state: typeof state; version: number }) => value.state.intent.input.private === "Synthetic private draft" && value.version === 0));
  assert.deepEqual(await pruneExpiredBazaarInputs(now), { prunedOperations: 0 });
  assert.equal(network, 0);
});
