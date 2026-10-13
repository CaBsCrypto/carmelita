import assert from "node:assert/strict";
import test from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { associateTempoWallet, isTempoChatAssociationEnabled, tempoWalletAssociationInputSchema, type TempoWalletAssociationDependencies } from "../app/mcp/tempo-wallet-association";
import { readTempoExistingWallet } from "../app/mcp/tempo-existing-wallet";
import { buildWalletPersistenceStatements } from "../app/multichain-account";
import { TEMPO_MODERATO_TOKEN } from "../app/wallets/networks";
import type { TempoWalletReading, UserWallet } from "../app/wallets/types";

const ownerA = "did:privy:association-a", ownerB = "did:privy:association-b";
const addressA = `0x${"a".repeat(40)}`, addressB = `0x${"b".repeat(40)}`;
const date = new Date("2026-10-13T07:11:56.409Z");
const scopes = ["agent:read", "agent:wallet:associate"];
const input = { explicitUserConfirmation: true };
const env = { VERCEL_ENV: "production", CARMELITA_TEMPO_TESTNET_ENABLED: "true",
  CARMELITA_TEMPO_PRODUCTION_READ_ENABLED: "true", CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED: "true" };
const principal = (userId = ownerA, grants = scopes): AuthInfo => ({ token: "unit-fixture-not-a-credential", clientId: "fixture", scopes: grants,
  extra: { subjectType: "user", userId } });
const wallet = (owner = ownerA): UserWallet => ({ id: `private-${owner}`, address: owner === ownerB ? addressB : addressA,
  owner: "user", created: false, family: "evm", chainType: "ethereum" });
const available = (address = addressA): Extract<TempoWalletReading, { status: "available" }> => ({
  network: "tempo:moderato", caip2: "eip155:42431", testnet: true, address, queriedAt: date.toISOString(),
  explorerUrl: "https://ignored.invalid", status: "available", chainId: 42431,
  token: { ...TEMPO_MODERATO_TOKEN, balanceAtomic: "1234567", balance: "1.234567", metadataVerified: true },
  block: { number: "39380745", hash: `0x${"c".repeat(64)}`, timestamp: "1791875381" },
});
function fixture(overrides: TempoWalletAssociationDependencies = {}) {
  const calls: string[] = [];
  const persisted: Parameters<NonNullable<TempoWalletAssociationDependencies["persistWallet"]>>[0][] = [];
  const dependencies: TempoWalletAssociationDependencies = {
    env, now: () => date,
    getCanonicalWallet: async owner => { calls.push(`canonical:${owner}`); return { id: wallet(owner).id, userId: owner,
      address: wallet(owner).address, chainType: "ethereum" }; },
    getExistingWallet: async owner => { calls.push(`privy:${owner}`); return wallet(owner); },
    read: async address => { calls.push(`rpc:${address}`); return available(address); },
    persistWallet: async value => { calls.push(`persist:${value.userId}`); persisted.push(value); return value.wallet; },
    ...overrides,
  };
  return { calls, persisted, dependencies };
}

test("Tempo association requires dedicated write scope before read scope and all owner IO", async () => {
  const { calls, dependencies } = fixture();
  await assert.rejects(associateTempoWallet(input, undefined, dependencies), /mcp_principal_required/);
  for (const grants of [[], ["agent:read"], ["agent:context"], ["agent:plan"]]) {
    await assert.rejects(associateTempoWallet(input, principal(ownerA, grants), dependencies), /mcp_scope_required:agent:wallet:associate/);
  }
  await assert.rejects(associateTempoWallet(input, principal(ownerA, ["agent:wallet:associate"]), dependencies), /mcp_scope_required:agent:read/);
  await assert.rejects(associateTempoWallet(input, { ...principal(), extra: { subjectType: "provider", userId: ownerA } }, dependencies), /mcp_principal_required/);
  await assert.rejects(associateTempoWallet(input, principal("did:privy:"), dependencies), /invalid_privy_user_id/);
  assert.deepEqual(calls, []);
});

test("Tempo association requires exact confirmation and rejects every client identity or chain selector", async () => {
  const { calls, dependencies } = fixture();
  assert.deepEqual(tempoWalletAssociationInputSchema.parse(input), input);
  for (const forged of [{}, { explicitUserConfirmation: false }, { explicitUserConfirmation: "true" },
    ...[{ userId: ownerB }, { address: addressB }, { walletId: "private-other" }, { owner: ownerB },
      { network: "tempo:moderato" }, { chainId: 4217 }, { rpcUrl: "https://foreign.invalid" }, { context: { userId: ownerB } }].map(value => ({ ...input, ...value }))]) {
    await assert.rejects(associateTempoWallet(forged, principal(), dependencies));
  }
  assert.deepEqual(calls, []);
});

test("Tempo chat association is off by default and requires its own flag plus Tempo network gate", async () => {
  assert.equal(isTempoChatAssociationEnabled({}), false);
  assert.equal(isTempoChatAssociationEnabled(env), true);
  for (const override of [{ CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED: undefined }, { CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED: "TRUE" },
    { CARMELITA_TEMPO_TESTNET_ENABLED: "false" }, { CARMELITA_TEMPO_PRODUCTION_READ_ENABLED: "false" },
    { CARMELITA_PREVIEW_ISOLATED: "true" }, { CARMELITA_PREVIEW_DATABASE_URL: "" }]) {
    const { calls, dependencies } = fixture({ env: { ...env, ...override } });
    await assert.rejects(associateTempoWallet(input, principal(), dependencies), /tempo_chat_association_disabled/);
    assert.deepEqual(calls, []);
  }
  assert.equal(isTempoChatAssociationEnabled({ CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED: "true", CARMELITA_TEMPO_TESTNET_ENABLED: "true" }), false);
});

test("missing or foreign canonical EVM and unavailable RPC cannot persist", async () => {
  for (const canonical of [null, { id: wallet().id, userId: ownerB, address: addressA, chainType: "ethereum" as const }]) {
    const { calls, persisted, dependencies } = fixture({ getCanonicalWallet: async () => canonical });
    await assert.rejects(associateTempoWallet(input, principal(), dependencies), /existing_evm_wallet_required|wallet_identity_conflict/);
    assert.deepEqual(calls, []); assert.deepEqual(persisted, []);
  }
  const invalid: unknown[] = [{ ...available(), chainId: 4217 }, { ...available(), address: addressB },
    { ...available(), token: { ...available().token, balance: "0" } },
    { ...available(), status: "unavailable", token: null, block: null, error: { code: "tempo_rpc_timeout", message: "private" } }];
  for (const result of invalid) {
    const { persisted, dependencies } = fixture({ read: async () => result as TempoWalletReading });
    await assert.rejects(associateTempoWallet(input, principal(), dependencies), /tempo_rpc_invalid_response|tempo_rpc_timeout/);
    assert.deepEqual(persisted, []);
  }
  const { persisted, dependencies } = fixture({ getExistingWallet: async () => { throw new Error("existing_evm_wallet_required"); } });
  await assert.rejects(associateTempoWallet(input, principal(), dependencies), /existing_evm_wallet_required/);
  assert.deepEqual(persisted, []);
});

test("A-B-A explicit associations persist the same owner wallet and network idempotently with no activity creation", async () => {
  const { calls, persisted, dependencies } = fixture();
  const bindings = new Set<string>();
  for (const owner of [ownerA, ownerB, ownerA]) {
    const result = await associateTempoWallet(input, principal(owner), dependencies);
    const value = persisted.at(-1)!;
    bindings.add(`${value.userId}/${value.wallet.id}/${value.network}`);
    assert.equal(value.email, null); assert.equal(value.preserveUserActivity, true);
    assert.deepEqual(value.wallet, wallet(owner)); assert.equal(value.network, "tempo:moderato");
    assert.equal(result.associated, true); assert.equal(result.association.address, wallet(owner).address);
    assert.equal(result.associationPersisted, true); assert.equal(result.registryChanged, true);
    assert.equal(result.association.network, "tempo:moderato"); assert.equal(result.tempo.chainId, 42431);
    assert.equal(result.tempo.token.balance, "1.234567");
    assert.equal(result.walletCreated, false); assert.equal(result.fundsMoved, false); assert.equal(result.signingRequired, false);
    assert.ok(!JSON.stringify(result).includes("private-")); assert.ok(!JSON.stringify(result).includes(owner));
    const statements = buildWalletPersistenceStatements({ ...value, networks: [value.network] });
    assert.equal(statements.length, 3);
    assert.match(statements[0].text, /WHERE id = \$1 AND status = 'active'/);
    assert.doesNotMatch(statements.map(item => item.text).join("\n"), /INSERT INTO agent_users|INSERT INTO agent_activities/);
  }
  assert.equal(bindings.size, 2);
  assert.deepEqual(persisted[0], persisted[2]);
  assert.deepEqual(calls, [ownerA, ownerB, ownerA].flatMap(owner => [`canonical:${owner}`, `privy:${owner}`, `rpc:${wallet(owner).address}`, `persist:${owner}`]));
});

test("association strips provider fields and rejects persisted identity mismatch or private persistence errors", async () => {
  const valid = available();
  const result = await associateTempoWallet(input, principal(), fixture({ read: async () => ({ ...valid, secret: "private",
    token: { ...valid.token, secret: "private" } }) as TempoWalletReading }).dependencies);
  assert.ok(!JSON.stringify(result).includes("private"));
  for (const returned of [{ ...wallet(), id: "other" }, { ...wallet(), address: addressB }, { ...wallet(), created: true }]) {
    await assert.rejects(associateTempoWallet(input, principal(), fixture({ persistWallet: async () => returned }).dependencies), /wallet_identity_conflict/);
  }
  await assert.rejects(associateTempoWallet(input, principal(), fixture({ persistWallet: async () => { throw new Error("private database URL"); } }).dependencies), /^Error: wallet_persistence_unavailable$/);
});

test("complementary direct read never invokes the association writer", async () => {
  const { dependencies, persisted } = fixture();
  const read = await readTempoExistingWallet({}, principal(ownerA, ["agent:read"]), { ...dependencies, enabled: () => true });
  assert.equal(read.registryChanged, false); assert.equal(read.tempoRegistrationChecked, false); assert.deepEqual(persisted, []);
});

test("already aborted association does not read owners or persist", async () => {
  const controller = new AbortController();
  controller.abort();
  const { calls, persisted, dependencies } = fixture({ signal: controller.signal });
  await assert.rejects(associateTempoWallet(input, principal(), dependencies), /tempo_rpc_unavailable/);
  assert.deepEqual(calls, []); assert.deepEqual(persisted, []);
});

test("abort during a successful RPC reading prevents persistence", async () => {
  const controller = new AbortController();
  let reads = 0;
  const { persisted, dependencies } = fixture({ signal: controller.signal, read: async (address, options) => {
    assert.equal(options?.signal, controller.signal);
    reads++;
    controller.abort();
    return available(address);
  } });
  await assert.rejects(associateTempoWallet(input, principal(), dependencies), /tempo_rpc_unavailable/);
  assert.equal(reads, 1); assert.deepEqual(persisted, []);
});

test("association flag revoked after the RPC reading prevents persistence", async () => {
  const currentEnv = { ...env };
  let reads = 0;
  const { persisted, dependencies } = fixture({ env: currentEnv, read: async address => {
    reads++;
    currentEnv.CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED = "false";
    return available(address);
  } });
  await assert.rejects(associateTempoWallet(input, principal(), dependencies), /tempo_chat_association_disabled/);
  assert.equal(reads, 1); assert.deepEqual(persisted, []);
});
