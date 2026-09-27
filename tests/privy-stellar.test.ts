import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {

  PRIVY_WALLET_ARCHITECTURE,
  getOrCreateUserStellarWallet,
  getPrivyStellarReadiness,
  getPrivyUserWalletExternalId,
  isValidStellarAddress,
  verifyStellarSignature,
} from "../app/privy-stellar";

test("validates Stellar Ed25519 public addresses", () => {
  const keypair = Keypair.random();
  assert.equal(isValidStellarAddress(keypair.publicKey()), true);
  assert.equal(isValidStellarAddress("not-a-stellar-address"), false);
});

test("verifies the signature primitive used by the Privy test harness", () => {
  const keypair = Keypair.random();
  const payload = Buffer.from("agent-assistant-test-payload");
  const signature = keypair.sign(payload);
  assert.equal(verifyStellarSignature(keypair.publicKey(), payload, signature), true);
  assert.equal(
    verifyStellarSignature(keypair.publicKey(), Buffer.from("tampered-payload"), signature),
    false,
  );
});

test("readiness never exposes Privy secrets", () => {
  const readiness = getPrivyStellarReadiness();
  assert.deepEqual(Object.keys(readiness).sort(), [
    "chainType",
    "configured",
    "friendbotUrl",
    "horizonUrl",
    "mode",
    "network",
  ]);
});

test("provisions exactly one deterministic Stellar wallet per Privy user", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.PRIVY_APP_ID;
  const originalSecret = process.env.PRIVY_APP_SECRET;
  const userId = "did:privy:test-user";
  const walletId = "wallet_test_123";
  const address = Keypair.random().publicKey();
  let created = false;
  let postCount = 0;

  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/wallets?") && init?.method === "GET") {
      return Response.json({
        data: created
          ? [{ id: walletId, address, chain_type: "stellar", external_id: getPrivyUserWalletExternalId(userId) }]
          : [],
      });
    }
    if (url.endsWith("/wallets") && init?.method === "POST") {
      postCount += 1;
      created = true;
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.owner, { user_id: userId });
      assert.equal(body.external_id, getPrivyUserWalletExternalId(userId));
      assert.equal(new Headers(init.headers).get("privy-idempotency-key"), body.external_id);
      return Response.json({ id: walletId, address, chain_type: "stellar" });
    }
    throw new Error("Unexpected Privy request: " + url);
  };

  try {
    const first = await getOrCreateUserStellarWallet(userId, { canonicalStellarWallet: async () => null });
    const second = await getOrCreateUserStellarWallet(userId, { canonicalStellarWallet: async () => null });
    assert.equal(first.id, walletId);
    assert.equal(first.created, true);
    assert.equal(second.id, walletId);
    assert.equal(second.created, false);
    assert.equal(postCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.PRIVY_APP_ID;
    else process.env.PRIVY_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.PRIVY_APP_SECRET;
    else process.env.PRIVY_APP_SECRET = originalSecret;
  }
});
test("keeps Stellar active while reserving separate EVM and Solana wallet families", () => {
  assert.deepEqual(PRIVY_WALLET_ARCHITECTURE.active, ["stellar"]);
  assert.deepEqual(PRIVY_WALLET_ARCHITECTURE.future, ["ethereum", "solana"]);
  assert.deepEqual(PRIVY_WALLET_ARCHITECTURE.evmNetworks, [
    "base",
    "bnb",
    "avalanche",
  ]);
});
