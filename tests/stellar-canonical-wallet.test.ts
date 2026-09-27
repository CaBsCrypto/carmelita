import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { selectStellarWallet, getOrCreateUserWallet } from "../app/wallets/privy";

const userId = "did:privy:stellar-canonical-test";
const active = { id: "active", address: Keypair.random().publicKey(), chain_type: "stellar" };
const unused = { id: "unused", address: Keypair.random().publicKey(), chain_type: "stellar" };
const canonical = { id: active.id, address: active.address, userId, chainType: "stellar" };

test("Stellar preserves the stored identity regardless of Privy ordering or external ID", () => {
  for (const candidates of [[unused, active], [active, unused]]) {
    assert.equal(selectStellarWallet(candidates, { userId, canonical })?.id, active.id);
  }
  assert.throws(() => selectStellarWallet([active, unused], { userId, canonical: null }), /ambiguous/);
  assert.equal(selectStellarWallet([active], { userId, canonical: null })?.id, active.id);
  assert.equal(selectStellarWallet([], { userId, canonical: null }), undefined);
});

test("Stellar rejects changed address, owner, family, missing identity and malformed candidates", () => {
  for (const saved of [
    { ...canonical, address: unused.address },
    { ...canonical, userId: "did:privy:another" },
    { ...canonical, chainType: "ethereum" },
    { ...canonical, id: "missing" },
  ]) assert.throws(() => selectStellarWallet([active], { userId, canonical: saved }), /identity_conflict/);
  assert.throws(() => selectStellarWallet([{ ...active, address: "bad" }], { userId, canonical: null }), /invalid_wallet/);
});

test("repeated and concurrent Stellar recovery never creates a replacement", async () => {
  const originalFetch = globalThis.fetch;
  const appId = process.env.PRIVY_APP_ID, secret = process.env.PRIVY_APP_SECRET;
  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "GET", "recovery must not create or sign");
    requests++;
    return Response.json({ data: requests % 2 ? [unused, active] : [active, unused] });
  };
  try {
    const dependencies = { canonicalStellarWallet: async () => canonical };
    const wallets = await Promise.all(Array.from({ length: 4 }, () => getOrCreateUserWallet(userId, "stellar", dependencies)));
    assert.ok(wallets.every(wallet => wallet.id === active.id && wallet.created === false));
    await assert.rejects(getOrCreateUserWallet(userId, "stellar", { canonicalStellarWallet: async () => null }), /ambiguous/);
  } finally {
    globalThis.fetch = originalFetch;
    if (appId === undefined) delete process.env.PRIVY_APP_ID; else process.env.PRIVY_APP_ID = appId;
    if (secret === undefined) delete process.env.PRIVY_APP_SECRET; else process.env.PRIVY_APP_SECRET = secret;
  }
});
