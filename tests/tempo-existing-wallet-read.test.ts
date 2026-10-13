import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { projectTempoReading, readTempoExistingWallet, tempoExistingWalletInputSchema, type TempoExistingWalletDependencies } from "../app/mcp/tempo-existing-wallet";
import { TEMPO_MODERATO_TOKEN } from "../app/wallets/networks";
import { getExistingUserEvmWallet } from "../app/wallets/privy";
import type { TempoWalletReading, UserWallet } from "../app/wallets/types";

const ownerA = "did:privy:existing-a", ownerB = "did:privy:existing-b";
const addressA = `0x${"a".repeat(40)}`, addressB = `0x${"b".repeat(40)}`;
const date = new Date("2026-10-13T07:11:56.409Z");
const principal = (userId = ownerA, scopes = ["agent:read"]): AuthInfo => ({
  token: "unit-fixture-not-a-credential", clientId: "unit-fixture", scopes, extra: { subjectType: "user", userId },
});
const wallet = (address = addressA): UserWallet => ({ id: `existing-${address}`, address, owner: "user", created: false, family: "evm", chainType: "ethereum" });
const available = (address = addressA): Extract<TempoWalletReading, { status: "available" }> => ({
  network: "tempo:moderato", caip2: "eip155:42431", testnet: true, address, queriedAt: date.toISOString(),
  explorerUrl: "https://ignored.invalid", status: "available", chainId: 42431,
  token: { ...TEMPO_MODERATO_TOKEN, balanceAtomic: "90071992547409931234567", balance: "90071992547409931.234567", metadataVerified: true },
  block: { number: "39380745", hash: `0x${"c".repeat(64)}`, timestamp: "1791875381" },
});
function fixture(overrides: Partial<TempoExistingWalletDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: Partial<TempoExistingWalletDependencies> = {
    enabled: () => true, now: () => date,
    getCanonicalWallet: async owner => {
      calls.push(`canonical:${owner}`);
      const address = owner === ownerB ? addressB : addressA;
      return { id: wallet(address).id, userId: owner, address, chainType: "ethereum" };
    },
    getExistingWallet: async owner => { calls.push(`existing:${owner}`); return wallet(owner === ownerB ? addressB : addressA); },
    read: async address => { calls.push(`rpc:${address}`); return available(address); }, ...overrides,
  };
  return { calls, dependencies };
}

test("existing Tempo read rejects absent, foreign, insufficient and invalid principals before dependencies", async () => {
  const { calls, dependencies } = fixture();
  for (const auth of [undefined, principal(ownerA, ["agent:context"]), principal("did:privy:"), principal("other-user"),
    { ...principal(), extra: { subjectType: "provider", userId: ownerA } }]) {
    await assert.rejects(readTempoExistingWallet({}, auth, dependencies), /mcp_principal_required|mcp_scope_required|invalid_privy_user_id/);
  }
  assert.deepEqual(calls, []);
});

test("existing Tempo read accepts only empty strict input and disabled flag touches no wallet or RPC", async () => {
  const { calls, dependencies } = fixture();
  assert.deepEqual(tempoExistingWalletInputSchema.parse({}), {});
  for (const input of [{ userId: ownerB }, { address: addressB }, { walletId: "foreign" }, { network: "tempo:moderato" },
    { context: { userId: ownerB } }, { rpcUrl: "https://foreign.invalid" }, null, undefined]) {
    await assert.rejects(readTempoExistingWallet(input, principal(), dependencies));
  }
  await assert.rejects(readTempoExistingWallet({}, principal(), { ...dependencies, enabled: () => false }), /tempo_disabled/);
  assert.deepEqual(calls, []);
});

test("A-B-A existing owner reads are independent and public without registering or creating wallets", async () => {
  const { calls, dependencies } = fixture();
  for (const [owner, address] of [[ownerA, addressA], [ownerB, addressB], [ownerA, addressA]]) {
    const result = await readTempoExistingWallet({}, principal(owner), dependencies);
    assert.equal(result.source, "existingEVM"); assert.equal(result.evm.address, address);
    assert.equal(result.evm.ownershipVerified, true); assert.equal(result.tempo.address, address);
    assert.equal(result.registryChanged, false); assert.equal(result.walletCreated, false);
    assert.equal(result.fundsMoved, false); assert.equal(result.signingRequired, false); assert.equal(result.tempoRegistrationChecked, false);
    assert.equal(result.tempo.status, "available");
    if (result.tempo.status === "available") {
      assert.equal(result.tempo.token.balanceAtomic, "90071992547409931234567");
      assert.equal(result.tempo.token.balance, "90071992547409931.234567"); assert.equal(result.tempo.chainId, 42431);
    }
    assert.ok(!JSON.stringify(result).includes(`existing-${address}`));
    assert.ok(!JSON.stringify(result).includes("registered"));
  }
  assert.deepEqual(calls, [ownerA, ownerB, ownerA].flatMap(owner => [`canonical:${owner}`, `existing:${owner}`, `rpc:${owner === ownerB ? addressB : addressA}`]));
});

test("missing EVM, changed ownership, creation and invalid wallet cannot reach RPC", async () => {
  for (const returned of [{ ...wallet(), created: true }, { ...wallet(), owner: "provider" }, { ...wallet(), family: "solana" },
    { ...wallet(), chainType: "stellar" }, { ...wallet(), address: "invalid" }]) {
    const { calls, dependencies } = fixture({ getExistingWallet: async () => returned as UserWallet });
    await assert.rejects(readTempoExistingWallet({}, principal(), dependencies), /wallet_identity_conflict/);
    assert.deepEqual(calls, [`canonical:${ownerA}`]);
  }
  for (const [message, expected] of [["existing_evm_wallet_required", "existing_evm_wallet_required"], ["private provider secret", "existing_evm_wallet_unavailable"]]) {
    const { calls, dependencies } = fixture({ getExistingWallet: async () => { throw new Error(message); } });
    await assert.rejects(readTempoExistingWallet({}, principal(), dependencies), new RegExp(`^Error: ${expected}$`));
    assert.deepEqual(calls, [`canonical:${ownerA}`]);
  }
});

test("real existing resolver rejects a foreign SQL canonical owner before any Tempo RPC", async () => {
  const { calls, dependencies } = fixture({ getCanonicalWallet: async () => ({ id: wallet().id, userId: ownerB, address: addressA, chainType: "ethereum" }),
    getExistingWallet: owner => getExistingUserEvmWallet(owner, {
    canonicalEvmWallet: async () => { assert.fail("foreign canonical must fail before Privy"); },
    listWallets: async () => [{ id: wallet().id, address: addressA, chain_type: "ethereum" }],
  }) });
  await assert.rejects(readTempoExistingWallet({}, principal(), dependencies), /wallet_identity_conflict/);
  assert.deepEqual(calls, []);
});

test("missing SQL canonical cannot fall back to an existing unregistered Privy wallet", async () => {
  const { calls, dependencies } = fixture({ getCanonicalWallet: async () => null });
  await assert.rejects(readTempoExistingWallet({}, principal(), dependencies), /existing_evm_wallet_required/);
  assert.deepEqual(calls, []);
});

test("canonical snapshot is forwarded to the real Privy resolver without a second SQL selection", async () => {
  const { calls, dependencies } = fixture({ getExistingWallet: (owner, options) => getExistingUserEvmWallet(owner, {
    ...options, listWallets: async () => [{ id: wallet().id, address: addressA.toUpperCase().replace("0X", "0x"), chain_type: "ethereum" }],
  }) });
  const result = await readTempoExistingWallet({}, principal(), dependencies);
  assert.equal(result.evm.address, addressA);
  assert.deepEqual(calls, [`canonical:${ownerA}`, `rpc:${addressA}`]);
});

test("public projection rejects mismatched chain, address, token, balance and block evidence", () => {
  const valid = available();
  for (const altered of [{ ...valid, chainId: 4217 }, { ...valid, address: addressB }, { ...valid, testnet: false },
    { ...valid, queriedAt: "invalid" }, { ...valid, block: { ...valid.block, hash: "0x123" } },
    { ...valid, token: { ...valid.token, balance: "90071992547409931.234568" } },
    { ...valid, token: { ...valid.token, metadataVerified: false } }, { ...valid, token: { ...valid.token, decimals: 18 } },
    { ...valid, token: { ...valid.token, address: addressB } }]) {
    const result = projectTempoReading(addressA, altered, date.toISOString());
    assert.notEqual(result.status, "available"); assert.equal(result.token, null); assert.equal(result.block, null);
  }
});

test("provider extras and failure messages are stripped while fixed RPC errors stay visible", async () => {
  const valid = available();
  const projected = projectTempoReading(addressA, { ...valid, secret: "private", token: { ...valid.token, secret: "private" },
    block: { ...valid.block, secret: "private" } }, date.toISOString());
  assert.equal(projected.status, "available"); assert.ok(!JSON.stringify(projected).includes("private"));
  const failure = { ...valid, status: "unavailable", token: null, block: null, error: { code: "tempo_rpc_timeout", message: "private" } };
  const { dependencies } = fixture({ read: async () => failure as unknown as TempoWalletReading });
  const result = await readTempoExistingWallet({}, principal(), dependencies);
  assert.equal(result.tempo.status, "unavailable");
  assert.equal(result.tempo.error.code, "tempo_rpc_timeout");
  assert.ok(!JSON.stringify(result).includes("private"));
  const thrown = await readTempoExistingWallet({}, principal(), fixture({ read: async () => { throw new Error("private"); } }).dependencies);
  if (thrown.tempo.status !== "available") assert.equal(thrown.tempo.error.code, "tempo_rpc_unavailable");
});

test("existing Tempo MCP helper has no provisioning, association or writer dependency", () => {
  const source = readFileSync(new URL("../app/mcp/tempo-existing-wallet.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /getOrCreate|persistActivated|persistWallet|ensureTempoTestnetWallet|Friendbot|provisionUserWallets/);
});
