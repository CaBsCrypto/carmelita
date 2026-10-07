import assert from "node:assert/strict";
import test from "node:test";
import { prepareOAuthWallets } from "../app/stytch/authorize-with-wallets";
import type { provisionUserWallets } from "../app/wallets/onboarding";
import { requestConsentRedirect, ConsentRequestError } from "../app/oauth/authorize/consent-request";

type Result = Awaited<ReturnType<typeof provisionUserWallets>>;
const ready = { status: "ready" as const, error: null, retryable: false };
function result(status: "ready" | "failed" | "conflict" = "ready") {
  return { stellar: {}, evm: {}, solana: {}, activation: "pending", preparation: {
    stellar: ready, solana: ready, evm: { ...ready, status },
  } } as Result;
}
test("OAuth preparation passes only the authenticated owner and accepts registered wallets with network activation pending", async () => {
  const identity = { id: "did:privy:owner", email: "owner@example.com" };
  await prepareOAuthWallets(identity, async input => {
    assert.deepEqual(input, { userId: identity.id, email: identity.email });
    return result();
  }, async saved => { assert.deepEqual(saved, identity); });
});
test("a preparation failure is shown as a recoverable preparation problem without accepting a callback", async () => {
  await assert.rejects(requestConsentRedirect("synthetic", true, async () => "synthetic",
    async () => Response.json({ error: "oauth_wallet_preparation_incomplete" }, { status: 503 })),
  (error: unknown) => error instanceof ConsentRequestError && error.code === "wallet_preparation_failed");
});
test("partial or conflicting wallet preparation cannot issue a successful OAuth connection", async () => {
  const identity = { id: "did:privy:owner", email: "owner@example.com" };
  await assert.rejects(prepareOAuthWallets(identity, async () => result("failed"), async () => {}), /oauth_wallet_preparation_incomplete/);
  await assert.rejects(prepareOAuthWallets(identity, async () => result("conflict"), async () => {}), /wallet_identity_conflict/);
  await assert.rejects(prepareOAuthWallets(identity, async () => ({ ...result(), stellar: null }), async () => {}), /oauth_wallet_preparation_incomplete/);
  await assert.rejects(prepareOAuthWallets(identity, async () => { throw new Error("wallet_persistence_unavailable"); }, async () => {}), /wallet_persistence_unavailable/);
});
test("verified email is persisted before a failed wallet preparation and a profile failure prevents provisioning", async () => {
  const calls: string[] = [];
  const identity = { id: "did:privy:owner", email: "owner@example.com" };
  await assert.rejects(prepareOAuthWallets(identity, async () => {
    calls.push("wallets"); return result("failed");
  }, async saved => { assert.deepEqual(saved, identity); calls.push("profile"); }), /oauth_wallet_preparation_incomplete/);
  assert.deepEqual(calls, ["profile", "wallets"]);
  calls.length = 0;
  await assert.rejects(prepareOAuthWallets(identity, async () => {
    calls.push("wallets"); return result();
  }, async () => { throw new Error("wallet_persistence_unavailable"); }), /wallet_persistence_unavailable/);
  assert.deepEqual(calls, []);
});
