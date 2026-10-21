import test from "node:test";
import assert from "node:assert/strict";
import { preparationAdminHandler } from "../app/admin/wallets/preparation-api";
function fixture(method: string | null = "privy", exists = true, enabled = true) {
  let retries = 0; let reads = 0;
  const handle = preparationAdminHandler({ identity: async () => method ? { method } : null, enabled: () => enabled, catalog: () => "catalog",
    exists: async () => exists, status: async () => { reads++; return []; }, retry: async (id, catalog) => { assert.equal(id, "did:privy:owner"); assert.equal(catalog, "catalog"); retries++; return 0; } });
  return { handle, counts: () => ({ retries, reads }) };
}
function post(body: unknown, origin = "https://app.test") { return new Request("https://app.test/api/admin/wallet-preparation", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) }); }
test("admin preparation rejects absent and legacy admin identities without reads or retries", async () => {
  for (const method of [null, "password", "chatgpt"]) {
    const check = fixture(method);
    assert.equal((await check.handle(post({ userId: "did:privy:owner" }))).status, 401);
    assert.deepEqual(check.counts(), { retries: 0, reads: 0 });
  }
});
test("admin preparation requires enabled feature, existing user and same origin", async () => {
  const disabled = fixture("privy", true, false);
  assert.equal((await disabled.handle(post({ userId: "did:privy:owner" }))).status, 404);
  assert.deepEqual(disabled.counts(), { retries: 0, reads: 0 });
  const check = fixture();
  assert.equal((await check.handle(post({ userId: "did:privy:owner" }, "https://other.test"))).status, 403);
  assert.equal((await check.handle(post({ userId: "did:privy:owner" }, ""))).status, 403);
  for (const body of [{}, { userId: "anything" }, { userId: "did:privy:owner", catalog: "attacker" }, { userId: "did:privy:owner", action: "enqueue" }]) assert.equal((await check.handle(post(body))).status, 400);
  assert.deepEqual(check.counts(), { retries: 0, reads: 0 });
  const missing = fixture("privy", false);
  assert.equal((await missing.handle(post({ userId: "did:privy:absent" }))).status, 404);
  assert.deepEqual(missing.counts(), { retries: 0, reads: 0 });
});
test("admin GET is read-only; POST only retries existing transient work", async () => {
  const check = fixture();
  const read = await check.handle(new Request("https://app.test/api/admin/wallet-preparation?userId=did:privy:owner"));
  assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
  assert.deepEqual(check.counts(), { retries: 0, reads: 1 });
  const response = await check.handle(post({ userId: "did:privy:owner" }));
  assert.deepEqual(await response.json(), { jobs: [], retried: 0 });
  assert.deepEqual(check.counts(), { retries: 1, reads: 2 });
});
test("admin preparation database error is sanitized", async () => {
  const handle = preparationAdminHandler({ identity: async () => ({ method: "privy" }), enabled: () => true, catalog: () => "catalog", exists: async () => { throw new Error("private-database-secret"); }, status: async () => [], retry: async () => 0 });
  const response = await handle(post({ userId: "did:privy:owner" }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-database-secret/);
});
