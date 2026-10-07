import assert from "node:assert/strict";
import test from "node:test";
import { connectionConfiguration, MCP_URL } from "../app/connect-chatgpt/connection-config";
import { connectionReadinessResponse } from "../app/connect-chatgpt/readiness";

test("Preview never silently offers production or a credential-bearing URL", () => {
  for (const origin of [undefined, "https://carmelita.browns.studio", "https://user:secret@qa.example", "https://qa.example/?token=secret", "http://qa.example", "https://qa.example/path", "https://qa.example/#secret"]) {
    assert.equal(connectionConfiguration({ VERCEL_ENV: "preview", CARMELITA_PUBLIC_ORIGIN: origin }).mcpUrl, null);
  }
  assert.equal(connectionConfiguration({ VERCEL_ENV: "preview", CARMELITA_PUBLIC_ORIGIN: "https://qa.example" }).mcpUrl, "https://qa.example/api/mcp/agent");
  assert.equal(connectionConfiguration({ VERCEL_ENV: "production", CARMELITA_PUBLIC_ORIGIN: "https://qa.example" }).mcpUrl, MCP_URL);
});

test("missing or invalid credentials never read identity or wallets", async () => {
  const dependencies = { verify: async () => { throw new Error("private token details"); }, identity: async () => { assert.fail("identity read without authorization"); }, wallets: async () => { assert.fail("wallet read without authorization"); } };
  for (const authorization of ["", "Basic other", "Bearer invalid"]) {
    const response = await connectionReadinessResponse(new Request("https://qa.example/api/agent/connection-readiness", { headers: { authorization } }), dependencies);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "authentication_required" });
  }
});

test("owner selectors cannot change the authenticated owner and responses expose no identity data", async () => {
  const seen: string[] = [];
  const response = await connectionReadinessResponse(new Request("https://qa.example/api/agent/connection-readiness?userId=other", { headers: { authorization: "Bearer own-token", "x-owner-id": "other" } }), {
    verify: async () => ({ user_id: "owner-a" }),
    identity: async id => { seen.push(id); return { email: "private@example.com" }; },
    wallets: async id => { seen.push(id); return [{ status: "active" }, { status: "pending" }]; },
  });
  assert.deepEqual(seen, ["owner-a", "owner-a"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { emailReady: true, registeredWallets: 1 });
});

test("another owner with no email or wallets receives their own incomplete state", async () => {
  const response = await connectionReadinessResponse(new Request("https://qa.example", { headers: { authorization: "Bearer b" } }), {
    verify: async () => ({ user_id: "owner-b" }), identity: async id => { assert.equal(id, "owner-b"); return { email: null }; }, wallets: async () => [],
  });
  assert.deepEqual(await response.json(), { emailReady: false, registeredWallets: 0 });
});

test("provider failures and stalled providers never announce readiness or expose secrets", async () => {
  for (const identity of [async () => { throw new Error("secret private-provider-url"); }, () => new Promise<{ email: string | null }>(() => {})]) {
    const response = await connectionReadinessResponse(new Request("https://qa.example", { headers: { authorization: "Bearer own" } }), { verify: async () => ({ user_id: "owner" }), identity, wallets: async () => [] }, 15);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "readiness_unavailable" });
  }
});
