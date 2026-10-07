import assert from "node:assert/strict";
import test from "node:test";
import { createWalletRecoveryHandler } from "../app/admin/wallets/recovery-handler";

const endpoint = "https://carmelita.example.test/api/admin/wallets/recovery";
const owner = "did:privy:owner123";
const email = "verified@example.test";
const inspectInput = { operation: "inspect", privyDid: owner };
const prepareInput = { operation: "prepare", privyDid: owner, expectedEmail: email, confirmed: true };

function request(body: unknown = inspectInput, headers: Record<string, string> = {}, method = "POST") {
  return new Request(endpoint, {
    method,
    headers: { Origin: new URL(endpoint).origin, "Content-Type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

function privateResponse(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Pragma"), "no-cache");
}

function guardedHandler(overrides: Partial<Parameters<typeof createWalletRecoveryHandler>[0]> = {}) {
  return createWalletRecoveryHandler({
    admin: async () => ({ role: "admin" }),
    inspect: async () => { assert.fail("inspection must not run"); },
    prepare: async () => { assert.fail("preparation must not run"); },
    ...overrides,
  });
}

test("recovery rejects an unauthenticated administrator before parsing input or probing an owner", async () => {
  const incoming = request();
  incoming.headers.delete("origin");
  incoming.json = async () => { assert.fail("unauthenticated body must not be read"); };
  const response = await guardedHandler({ admin: async () => null })(incoming);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "admin_auth_required" });
  privateResponse(response);
});

test("recovery rejects missing, malformed and foreign origins before parsing or inspecting", async () => {
  for (const origin of [null, "null", "malformed", "https://elsewhere.example.test", "http://carmelita.example.test", "https://carmelita.example.test:444", "https://carmelita.example.test/unexpected", "https://user:password@carmelita.example.test"]) {
    const incoming = request();
    if (origin === null) incoming.headers.delete("origin");
    else incoming.headers.set("origin", origin);
    incoming.json = async () => { assert.fail("invalid origin must not read input"); };
    const response = await guardedHandler()(incoming);
    assert.equal(response.status, 403, String(origin));
    assert.deepEqual(await response.json(), { error: "invalid_origin" });
    privateResponse(response);
  }
});

test("recovery requires POST, JSON and strict operation-specific input", async () => {
  const wrongMethod = await guardedHandler()(request(undefined, {}, "GET"));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "POST");
  privateResponse(wrongMethod);
  const wrongType = await guardedHandler()(request(inspectInput, { "Content-Type": "text/plain" }));
  assert.equal(wrongType.status, 400);
  privateResponse(wrongType);
  const malformed = new Request(endpoint, { method: "POST", headers: { Origin: new URL(endpoint).origin, "Content-Type": "application/json" }, body: "{" });
  assert.equal((await guardedHandler()(malformed)).status, 400);
  for (const body of [
    null,
    { ...inspectInput, privyDid: "did:privy:" },
    { ...inspectInput, privyDid: "did:privy:owner-123" },
    { ...inspectInput, privyDid: " did:privy:owner123" },
    { ...inspectInput, privyDid: "did:privy:" + "x".repeat(119) },
    { ...inspectInput, email },
    { ...inspectInput, operation: "fund" },
    { ...prepareInput, confirmed: false },
    { ...prepareInput, confirmed: undefined },
    { ...prepareInput, expectedEmail: "not-an-email" },
    { ...prepareInput, expectedEmail: undefined },
    { ...prepareInput, providerWalletId: "attacker-controlled" },
  ]) {
    const response = await guardedHandler()(request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { error: "invalid_request" });
    privateResponse(response);
  }
});

test("authenticated POST inspection forwards the exact owner and never prepares or persists", async () => {
  const calls: string[] = [];
  const result = { privyDid: owner, verifiedEmail: email, registeredWallets: 0 };
  const handler = guardedHandler({
    admin: async () => { calls.push("admin"); return { role: "admin" }; },
    inspect: async did => { calls.push("inspect"); assert.equal(did, owner); return result; },
  });
  const response = await handler(request(inspectInput, { "Content-Type": "application/json; charset=utf-8" }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["admin", "inspect"]);
  assert.deepEqual(await response.json(), result);
  privateResponse(response);
});

test("confirmed preparation forwards only the exact inspected identity and comparison email", async () => {
  const calls: string[] = [];
  const result = { privyDid: owner, registered: true, fundsMoved: false };
  const handler = guardedHandler({
    admin: async () => { calls.push("admin"); return { role: "admin" }; },
    prepare: async (did, expectedEmail) => {
      calls.push("prepare");
      assert.equal(did, owner);
      assert.equal(expectedEmail, email);
      return result;
    },
  });
  const response = await handler(request(prepareInput));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["admin", "prepare"]);
  assert.deepEqual(await response.json(), result);
  privateResponse(response);
});

test("known identity, partial preparation and persistence failures return safe explicit errors", async () => {
  const expected = new Map([
    ["registered_user_not_found", 404], ["registered_user_inactive", 409],
    ["privy_identity_mismatch", 409], ["verified_email_required", 409],
    ["recovery_inspection_changed", 409], ["wallet_identity_conflict", 409],
    ["oauth_wallet_preparation_incomplete", 503], ["wallet_persistence_unavailable", 503],
    ["privy_not_configured", 503], ["provider_identity_unavailable", 503],
  ]);
  for (const [code, status] of expected) {
    const response = await guardedHandler({ prepare: async () => { throw new Error(code); } })(request(prepareInput));
    assert.equal(response.status, status, code);
    assert.deepEqual(await response.json(), { error: code });
    privateResponse(response);
  }
});

test("unexpected errors and provider details are never returned, including administrator failures", async () => {
  const raw = "private provider credential: secret and user identity";
  for (const [dependency, body] of [
    ["admin", inspectInput], ["inspect", inspectInput], ["prepare", prepareInput],
  ] as const) {
    const response = await guardedHandler({ [dependency]: async () => { throw new Error(raw); } })(request(body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "recovery_failed" });
    privateResponse(response);
  }
  for (const error of [raw, new Error("wallet_identity_conflict: " + raw), { message: "wallet_identity_conflict" }]) {
    const response = await guardedHandler({ prepare: async () => { throw error; } })(request(prepareInput));
    assert.deepEqual(await response.json(), { error: "recovery_failed" });
  }
});
