import assert from "node:assert/strict";
import test from "node:test";
import { provisionUserWallets, type WalletOnboardingDependencies } from "../app/wallets/onboarding";
import { selectSolanaWallet } from "../app/wallets/privy";
import type { UserWallet } from "../app/wallets/types";

const input = { userId: "did:privy:partial", email: "test@example.invalid" };
const stellar: UserWallet = { id: "stellar", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", family: "stellar", chainType: "stellar", created: false, owner: "user" };
const evm: UserWallet = { ...stellar, id: "evm", address: "0x1111111111111111111111111111111111111111", family: "evm", chainType: "ethereum" };
const solana: UserWallet = { ...stellar, id: "solana", address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", family: "solana", chainType: "solana" };
function dependencies(overrides: Partial<WalletOnboardingDependencies> = {}): WalletOnboardingDependencies {
  return {
    getOrCreateStellarWallet: async () => stellar,
    getStellarAccount: async () => ({ exists: false, sequence: null, balances: [] }),
    persistStellarAccount: async () => ({ profile: { ...input, id: input.userId, status: "active" }, persistence: { configured: true, provider: "Neon Postgres" }, history: [] }),
    ensureAvalancheWallet: async () => { throw new Error("legacy_unexpected"); },
    ensureEvmWallet: async () => ({ wallet: evm, networks: ["avalanche:fuji", "bnb:testnet", "base:sepolia"].map(id => ({ id: id as "avalanche:fuji", family: "evm" as const, name: id, nativeAsset: "TEST", chainId: 43113, explorerUrl: "https://example.invalid", rollout: "experimental" as const })), fundsMoved: false, signingRequired: false }),
    ensureSolanaWallet: async () => ({ wallet: solana, network: { id: "solana:devnet", family: "solana", name: "Solana Devnet", nativeAsset: "SOL", explorerUrl: "https://explorer.solana.com", rollout: "experimental" }, fundsMoved: false, signingRequired: false }),
    ...overrides,
  };
}
test("RPC failure preserves registration and does not block EVM or Solana", async () => {
  let persisted = false;
  const deps = dependencies();
  const result = await provisionUserWallets(input, dependencies({
    persistStellarAccount: async value => { assert.equal(value.activation, "unknown"); persisted = true; return deps.persistStellarAccount(value); },
    getStellarAccount: async () => { assert.equal(persisted, true); throw new Error("RPC timeout"); },
  }));
  assert.equal(result.preparation.stellar.status, "ready");
  assert.equal(result.preparation.evm.status, "ready");
  assert.equal(result.preparation.solana.status, "ready");
  assert.equal(result.account, null);
  assert.equal(result.activation, "unknown");
  assert.equal(result.reads.stellar.error, "stellar_account_unavailable");
  assert.equal(result.evm?.networks.length, 3);
});
test("family conflict is isolated and never represented as a registered wallet", async () => {
  const result = await provisionUserWallets(input, dependencies({ getOrCreateStellarWallet: async () => { throw new Error("privy_stellar_wallet_ambiguous"); } }));
  assert.equal(result.stellar, null);
  assert.deepEqual(result.preparation.stellar, { status: "conflict", error: "wallet_identity_conflict", retryable: false });
  assert.equal(result.evm?.wallet.id, evm.id);
  assert.equal(result.solana?.wallet.id, solana.id);
});
test("transient family failure retries using the same existing identities", async () => {
  let fail = true;
  const deps = dependencies();
  const retry = dependencies({ ensureSolanaWallet: async value => { if (fail) throw new Error("secret provider detail"); return deps.ensureSolanaWallet(value); } });
  const first = await provisionUserWallets(input, retry);
  assert.equal(first.preparation.solana.error, "wallet_preparation_failed");
  assert.equal(first.preparation.solana.retryable, true);
  fail = false;
  const second = await provisionUserWallets(input, retry);
  assert.equal(second.stellar?.id, first.stellar?.id);
  assert.equal(second.evm?.wallet.id, first.evm?.wallet.id);
  assert.equal(second.solana?.wallet.id, solana.id);
});
test("Solana canonical identity survives response ordering; ambiguity fails closed", () => {
  const candidate = { id: solana.id, address: solana.address, chain_type: "solana" };
  const other = { ...candidate, id: "other" };
  const canonical = { id: solana.id, address: solana.address, chainType: "solana", userId: input.userId };
  for (const candidates of [[candidate, other], [other, candidate]]) assert.equal(selectSolanaWallet(candidates, { userId: input.userId, canonical })?.id, solana.id);
  assert.throws(() => selectSolanaWallet([candidate, other], { userId: input.userId, canonical: null }), /ambiguous/);
  assert.throws(() => selectSolanaWallet([candidate], { userId: "did:privy:other", canonical }), /conflict/);
  assert.throws(() => selectSolanaWallet([], { userId: input.userId, canonical }), /conflict/);
});

test("database failures remain global errors instead of successful partial responses", async () => {
  await assert.rejects(provisionUserWallets(input, dependencies({ persistStellarAccount: async () => { throw new Error("wallet_persistence_unavailable"); } })), /wallet_persistence_unavailable/);
});
