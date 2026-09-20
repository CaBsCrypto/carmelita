import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWalletIdentityAvailable,
  buildWalletPersistenceStatements,
  persistActivatedWallet,
  persistWalletNetworks,
  setPersistedWalletNetworkStatus,
  type PersistWalletNetworksInput,
  type WalletPersistenceStatement,
} from "../app/multichain-account";

const input: PersistWalletNetworksInput = {
  userId: "did:privy:wallet-a", email: "fixture@example.invalid",
  wallet: { id: "privy-evm-a", address: `0x${"Ab".repeat(20)}`, chainType: "ethereum", family: "evm", owner: "user", created: false },
  networks: ["avalanche:fuji", "bnb:testnet", "base:sepolia"],
};

test("persists all requested networks in one transaction without changing the signing identity", async () => {
  const transactions: WalletPersistenceStatement[][] = [];
  const wallet = await persistWalletNetworks(input, { transaction: async (statements) => { transactions.push(statements); } });
  assert.equal(wallet.id, input.wallet.id);
  assert.equal(wallet.address, input.wallet.address);
  assert.equal(transactions.length, 1);
  const [, canonical, bindings] = transactions[0];
  assert.deepEqual(bindings.parameters, [input.wallet.id, input.userId, "active", input.networks]);
  const update = canonical.text.split("ON CONFLICT (id) DO UPDATE SET")[1].split("WHERE")[0];
  assert.doesNotMatch(update, /(?:^|,)\s*(id|user_id|address|chain_type|network)\s*=/);
  assert.equal(canonical.parameters[4], "avalanche:fuji");
  assert.match(canonical.text, /agent_wallets\.user_id = EXCLUDED\.user_id/);
  assert.match(canonical.text, /agent_wallets\.chain_type = EXCLUDED\.chain_type/);
  assert.match(canonical.text, /lower\(agent_wallets\.address\) = lower\(EXCLUDED\.address\)/);
  assert.match(canonical.text, /count\(\*\) = 1/);
});

test("single network activation uses the same transaction and retry-safe binding key", async () => {
  const transactions: WalletPersistenceStatement[][] = [];
  const dependencies = { transaction: async (statements: WalletPersistenceStatement[]) => { transactions.push(statements); } };
  await persistActivatedWallet({ ...input, network: "bnb:testnet" }, dependencies);
  await persistActivatedWallet({ ...input, network: "bnb:testnet" }, dependencies);
  assert.deepEqual(transactions[0], transactions[1]);
  assert.deepEqual(transactions[0][2].parameters[3], ["bnb:testnet"]);
  assert.match(transactions[0][2].text, /ON CONFLICT \(wallet_id, network\)/);
});

test("invalid identities and family/network mismatches never reach the database", async () => {
  let called = 0;
  const dependencies = { transaction: async () => { called += 1; } };
  for (const candidate of [
    { ...input, userId: "someone" },
    { ...input, wallet: { ...input.wallet, chainType: "solana" as const } },
    { ...input, networks: [] },
    { ...input, networks: ["stellar:testnet" as const] },
  ]) await assert.rejects(persistWalletNetworks(candidate, dependencies));
  assert.equal(called, 0);
});

test("deduplicates requested networks and created events without changing their identity", () => {
  const statements = buildWalletPersistenceStatements({ ...input, wallet: { ...input.wallet, created: true }, networks: ["avalanche:fuji", "bnb:testnet", "bnb:testnet"] });
  assert.deepEqual(statements[2].parameters[3], ["avalanche:fuji", "bnb:testnet"]);
  const events = statements.slice(3);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.parameters[0]), ["wallet-created:privy-evm-a:avalanche:fuji", "wallet-created:privy-evm-a:bnb:testnet"]);
  assert.ok(events.every((event) => /ON CONFLICT \(id\) DO NOTHING/.test(event.text)));
});

test("database conflicts reject without retrying or reporting successful persistence", async () => {
  for (const code of ["23505", "23503", "22012"]) {
    let calls = 0;
    await assert.rejects(persistWalletNetworks(input, { transaction: async () => { calls += 1; throw Object.assign(new Error("database conflict"), { code }); } }), /wallet_identity_conflict/);
    assert.equal(calls, 1);
  }
  const uncertain = new Error("connection interrupted after commit may have happened");
  let calls = 0;
  await assert.rejects(persistWalletNetworks(input, { transaction: async () => { calls += 1; throw uncertain; } }), (error) => error === uncertain);
  assert.equal(calls, 1);
});

test("changes binding status with owner and network predicates and mirrors only the matching legacy network", async () => {
  let statements: WalletPersistenceStatement[] = [];
  await setPersistedWalletNetworkStatus({ userId: input.userId, walletId: input.wallet.id, network: "bnb:testnet", status: "pending" }, {
    transaction: async (next) => { statements = next; },
  });
  assert.equal(statements.length, 2);
  assert.match(statements[0].text, /WHERE wallet_id = \$1 AND user_id = \$2 AND network = \$3/);
  assert.match(statements[1].text, /WHERE id = \$1 AND user_id = \$2 AND network = \$3/);
  assert.deepEqual(statements[0].parameters, [input.wallet.id, input.userId, "bnb:testnet", "pending"]);
});

test("EVM casing changes preserve the identity while another wallet ID remains a conflict", () => {
  const existing = { id: input.wallet.id, userId: input.userId, address: input.wallet.address };
  assert.doesNotThrow(() => assertWalletIdentityAvailable([existing], { ...existing, address: existing.address.toLowerCase() }));
  assert.throws(() => assertWalletIdentityAvailable([existing], { ...existing, id: "other-id", address: existing.address.toLowerCase() }), /wallet_identity_conflict/);
});
