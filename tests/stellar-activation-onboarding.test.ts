import assert from "node:assert/strict";
import test from "node:test";
import { provisionUserWallets, type WalletOnboardingDependencies } from "../app/wallets/onboarding";
import type { UserWallet } from "../app/wallets/types";

const input = { userId: "did:privy:stellarowner", email: "owner@example.test" };
const wallet: UserWallet = { id: "canonical-stellar", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  family: "stellar", chainType: "stellar", owner: "user", created: false };
const absent = { exists: false, sequence: null, balances: [] };
const active = { exists: true, sequence: "123", balances: [{ asset: "XLM", balance: "10000", issuer: null }] };
function fixture() {
  const calls: string[] = [];
  const dependencies: WalletOnboardingDependencies = {
    getOrCreateStellarWallet: async id => { assert.equal(id, input.userId); calls.push("canonical"); return wallet; },
    persistStellarAccount: async saved => {
      assert.equal(saved.wallet, wallet); assert.equal(saved.activation, "unknown"); calls.push("persist");
      return { profile: { id: input.userId, email: input.email, status: "active" }, persistence: { configured: true, provider: "Neon Postgres" }, history: [] };
    },
    getStellarAccount: async address => { assert.equal(address, wallet.address); calls.push("read"); return absent; },
    activateStellar: async value => {
      assert.equal(value.userId, input.userId); assert.equal(value.wallet, wallet); assert.equal(value.account, absent);
      calls.push("activate");
      return { account: active, activation: "active", faucetRequested: true, fundsMoved: true, transactionHash: "a".repeat(64),
        error: null, retryable: false, retryAfterMs: null };
    },
    updateStellarStatus: async (saved, owner, activation) => {
      assert.equal(saved, wallet); assert.deepEqual(owner, input); calls.push("status:" + activation);
    },
    ensureAvalancheWallet: async () => ({ wallet: { ...wallet, family: "evm", chainType: "ethereum" }, network: {
      id: "avalanche:fuji", family: "evm", name: "Avalanche Fuji", nativeAsset: "AVAX", chainId: 43113,
      explorerUrl: "https://example.test", rollout: "experimental" }, fundsMoved: false, signingRequired: false }),
    ensureSolanaWallet: async () => ({ wallet: { ...wallet, family: "solana", chainType: "solana" }, network: {
      id: "solana:devnet", family: "solana", name: "Solana Devnet", nativeAsset: "SOL",
      explorerUrl: "https://example.test", rollout: "experimental" }, fundsMoved: false, signingRequired: false }),
  };
  return { calls, dependencies };
}

test("onboarding activates only the persisted canonical address and reports verified Testnet funding", async () => {
  const { calls, dependencies } = fixture();
  const result = await provisionUserWallets(input, dependencies);
  assert.deepEqual(calls, ["canonical", "persist", "read", "activate", "status:active"]);
  assert.equal(result.stellar, wallet);
  assert.equal(result.account, active);
  assert.equal(result.activation, "active");
  assert.equal(result.testnetActivation?.faucetRequested, true);
  assert.equal(result.fundsMoved, true);
  assert.equal(result.signingRequired, false);
});

test("uncertain faucet outcome preserves all registered wallets and does not report no funds or activation", async () => {
  const { calls, dependencies } = fixture();
  dependencies.activateStellar = async () => ({ account: absent, activation: "pending", faucetRequested: true,
    fundsMoved: null, transactionHash: null, error: "stellar_activation_pending", retryable: true, retryAfterMs: 60000 });
  const result = await provisionUserWallets(input, dependencies);
  assert.equal(result.stellar, wallet);
  assert.equal(result.activation, "pending");
  assert.equal(result.fundsMoved, null);
  assert.equal(result.testnetActivation?.retryable, true);
  assert.equal(result.preparation.stellar.status, "ready");
  assert.equal(result.preparation.evm.status, "ready");
  assert.equal(result.preparation.solana.status, "ready");
  assert.equal(calls.at(-1), "status:pending");
});

test("an unknown network read never triggers activation or downgrades an existing registration", async () => {
  const { calls, dependencies } = fixture();
  dependencies.getStellarAccount = async () => { calls.push("unavailable"); throw new Error("private upstream detail"); };
  const result = await provisionUserWallets(input, dependencies);
  assert.deepEqual(calls, ["canonical", "persist", "unavailable"]);
  assert.equal(result.preparation.stellar.status, "ready");
  assert.equal(result.activation, "unknown");
  assert.equal(result.testnetActivation, null);
  assert.equal(result.fundsMoved, false);
  assert.equal(result.reads.stellar.error, "stellar_account_unavailable");
});

test("a persistence or identity failure cannot reach Friendbot", async () => {
  for (const conflict of [false, true]) {
    const { calls, dependencies } = fixture();
    if (conflict) dependencies.getOrCreateStellarWallet = async () => ({ ...wallet, family: "evm" });
    else dependencies.persistStellarAccount = async () => { throw new Error("wallet_persistence_unavailable"); };
    if (conflict) {
      const result = await provisionUserWallets(input, dependencies);
      assert.equal(result.preparation.stellar.status, "conflict");
      assert.equal(result.stellar, null);
    } else await assert.rejects(provisionUserWallets(input, dependencies), /wallet_persistence_unavailable/);
    assert.ok(!calls.includes("activate") && !calls.includes("read"));
  }
});

test("a canonical identity conflict during activation cannot authorize the conflicting Stellar registration", async () => {
  const { dependencies } = fixture();
  dependencies.activateStellar = async () => ({ account: null, activation: "unknown", faucetRequested: false,
    fundsMoved: false, transactionHash: null, error: "wallet_identity_conflict", retryable: false, retryAfterMs: null });
  const result = await provisionUserWallets(input, dependencies);
  assert.equal(result.stellar, null);
  assert.equal(result.preparation.stellar.status, "conflict");
  assert.equal(result.testnetActivation?.error, "wallet_identity_conflict");
});

test("a late registration failure cannot discard confirmed or uncertain activation funding", async () => {
  for (const fundsMoved of [true, null] as const) {
    const { dependencies } = fixture();
    const activate = dependencies.activateStellar!;
    dependencies.activateStellar = async value => ({ ...await activate(value), fundsMoved });
    dependencies.updateStellarStatus = async () => { throw new Error("late private provider error"); };
    const result = await provisionUserWallets(input, dependencies);
    assert.equal(result.preparation.stellar.status, "failed");
    assert.equal(result.fundsMoved, fundsMoved);
    assert.equal(result.testnetActivation?.faucetRequested, true);
    assert.equal(result.testnetActivation?.fundsMoved, fundsMoved);
  }
});
