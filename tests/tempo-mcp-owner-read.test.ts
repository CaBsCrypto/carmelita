import assert from "node:assert/strict";
import test from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { executeMcpReadQuery } from "../app/queries/adapters";
import { createPersonalQueries, type PersonalQueryDependencies } from "../app/queries/personal";
import { TEMPO_MODERATO_TOKEN } from "../app/wallets/networks";
import type { TempoWalletReading } from "../app/wallets/types";

const ownerA = "did:privy:tempo-owner-a";
const ownerB = "did:privy:tempo-owner-b";
const addressA = `0x${"a".repeat(40)}`;
const addressB = `0x${"b".repeat(40)}`;
const date = new Date("2026-10-13T00:31:55Z");
const tools = ["read_personal_wallets_status", "read_personal_wallets_balances"];

function available(address = addressA, atomic = "90071992547409931234567"): TempoWalletReading {
  return { network: "tempo:moderato", caip2: "eip155:42431", testnet: true, address,
    explorerUrl: `https://explore.testnet.tempo.xyz/address/${address}`, queriedAt: date.toISOString(),
    status: "available", chainId: 42431,
    token: { ...TEMPO_MODERATO_TOKEN, balanceAtomic: atomic, balance: atomic === "0" ? "0" : "90071992547409931.234567", metadataVerified: true },
    block: { number: "39341709", hash: `0x${"c".repeat(64)}`, timestamp: "1791859735" } };
}

function principal(userId: string, scopes = ["agent:read"]): AuthInfo {
  return { token: "unit-fixture-not-a-credential", clientId: "unit-fixture", scopes, extra: { subjectType: "user", userId } };
}

function fixture(override?: PersonalQueryDependencies["tempoReading"]) {
  const calls: Array<{ type: string; value: string }> = [];
  const neverRead = async () => { assert.fail("unrelated provider or native gas read reached during Tempo query"); };
  const dependencies: PersonalQueryDependencies = {
    context: neverRead, conversation: neverRead, nativeBalance: neverRead, watchlist: neverRead, quotes: neverRead,
    connections: neverRead, connectedApps: neverRead, memory: neverRead, activity: neverRead, autopilot: neverRead,
    stellarAccount: neverRead, evmDiagnostics: neverRead, erc20Balance: neverRead, solanaBalance: neverRead,
    now: () => date.getTime(),
    // Return mixed owners deliberately to test defense in depth beyond database filtering.
    wallets: async userId => {
      calls.push({ type: "wallets", value: userId });
      return [
        { id: "private-wallet-a", walletId: "private-wallet-a", userId: ownerA, address: addressA, chainType: "ethereum", network: "tempo:moderato", status: "active", updatedAt: date },
        { id: "private-wallet-b", walletId: "private-wallet-b", userId: ownerB, address: addressB, chainType: "ethereum", network: "tempo:moderato", status: "active", updatedAt: date },
      ];
    },
    tempoReading: async (address, options) => {
      calls.push({ type: "tempo", value: address });
      return override ? override(address, options) : available(address, address === addressB ? "0" : undefined);
    },
  };
  return { calls, definitions: createPersonalQueries(dependencies) };
}

test("MCP keeps existing tool names and accepts Tempo only as a network filter", async () => withTempo(async () => {
  const { calls, definitions } = fixture();
  for (const name of tools) {
    const query = definitions.find(item => item.toolName === name)!;
    assert.ok(query, `existing tool ${name} was removed`);
    assert.equal(query.scope, "agent:read");
    assert.deepEqual(query.inputSchema.parse({ networks: ["tempo:moderato"] }), { networks: ["tempo:moderato"] });
    for (const forged of [
      { userId: ownerB }, { owner: ownerB }, { walletId: "private-wallet-b" }, { address: addressB },
      { context: { userId: ownerB } }, { rpc: "https://attacker.invalid" }, { chainId: 4217 },
    ]) await assert.rejects(executeMcpReadQuery(name, { networks: ["tempo:moderato"], ...forged }, principal(ownerA), definitions));
    for (const network of ["tempo:mainnet", "eip155:4217", "eip155:42431"]) {
      await assert.rejects(executeMcpReadQuery(name, { networks: [network] }, principal(ownerA), definitions));
    }
  }
  assert.deepEqual(calls, [], "invalid selectors must fail before owner lookup or RPC");
}));

test("missing principal, foreign principal type and insufficient scopes never reach wallets or RPC", async () => withTempo(async () => {
  const { calls, definitions } = fixture();
  for (const name of tools) {
    await assert.rejects(executeMcpReadQuery(name, {}, undefined, definitions), /mcp_principal_required/);
    await assert.rejects(executeMcpReadQuery(name, {}, principal(ownerA, ["agent:context"]), definitions), /mcp_scope_required/);
    await assert.rejects(executeMcpReadQuery(name, {}, { ...principal(ownerA), extra: { subjectType: "provider", userId: ownerA } }, definitions), /mcp_principal_required/);
  }
  assert.deepEqual(calls, []);
}));

test("A-B-A owner reads remain independent, exact and readonly without sharing a wallet or cache", async () => withTempo(async () => {
  const { calls, definitions } = fixture();
  for (const name of tools) {
    for (const [owner, address] of [[ownerA, addressA], [ownerB, addressB], [ownerA, addressA]]) {
      const result = await executeMcpReadQuery(name, { networks: ["tempo:moderato"] }, principal(owner), definitions) as Record<string, unknown>;
      const rows = (result.wallets ?? result.balances) as Array<Record<string, unknown>>;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].address, address);
      const reading = rows[0].tempo as TempoWalletReading;
      assert.equal(reading.status, "available");
      if (reading.status !== "available") assert.fail("expected available Tempo DTO");
      assert.equal(reading.chainId, 42431);
      assert.equal(reading.address, address);
      assert.equal(reading.token.balanceAtomic, owner === ownerB ? "0" : "90071992547409931234567");
      assert.equal(reading.token.balance, owner === ownerB ? "0" : "90071992547409931.234567");
      assert.doesNotMatch(JSON.stringify(result), /private-wallet-|unit-fixture-not-a-credential/);
      const native = rows[0].native as { balance?: unknown; status?: string } | undefined;
      if (native) { assert.equal(native.balance, null); assert.equal(native.status, "not_applicable"); }
      else { assert.equal(rows[0].balance, null); assert.equal(rows[0].nativeBalanceStatus, "not_applicable"); }
    }
  }
  assert.deepEqual(calls.filter(call => call.type === "wallets").map(call => call.value), [ownerA, ownerB, ownerA, ownerA, ownerB, ownerA]);
  assert.deepEqual(calls.filter(call => call.type === "tempo").map(call => call.value), [addressA, addressB, addressA, addressA, addressB, addressA]);
}));

test("a Tempo result for another address or chain cannot publish its token balance", async () => withTempo(async () => {
  for (const incorrect of [
    { ...available(), address: addressB },
    { ...available(), chainId: 4217 },
    { ...available(), network: "avalanche:fuji" },
  ]) {
    const { definitions } = fixture(async () => incorrect as TempoWalletReading);
    for (const name of tools) {
      const result = await executeMcpReadQuery(name, { networks: ["tempo:moderato"] }, principal(ownerA), definitions) as Record<string, unknown>;
      const row = ((result.wallets ?? result.balances) as Array<Record<string, unknown>>)[0];
      const tempo = row.tempo as TempoWalletReading;
      assert.notEqual(tempo.status, "available");
      assert.equal(tempo.token, null);
      assert.doesNotMatch(JSON.stringify(result), /90071992547409931/);
    }
  }
}));

test("failed reads expose a cause and null balance without provider details or fabricated zero", async () => withTempo(async () => {
  for (const operation of [
    async () => { throw new Error("provider-secret Bearer fixture"); },
    async (address: string) => ({ ...available(address), status: "unavailable", token: null, block: null,
      error: { code: "tempo_rpc_timeout", message: "Tempo request timed out." } } as TempoWalletReading),
  ]) {
    const { definitions } = fixture(operation);
    for (const name of tools) {
      const result = await executeMcpReadQuery(name, { networks: ["tempo:moderato"] }, principal(ownerA), definitions) as Record<string, unknown>;
      const row = ((result.wallets ?? result.balances) as Array<Record<string, unknown>>)[0];
      const reading = row.tempo as TempoWalletReading;
      assert.notEqual(reading.status, "available");
      assert.equal(reading.token, null);
      assert.equal(reading.block, null);
      assert.doesNotMatch(JSON.stringify(result), /provider-secret|Bearer fixture|"balance":"0"/);
    }
  }
}));

test("public Tempo projection drops unexpected provider fields even from an available upstream reading", async () => withTempo(async () => {
  const { definitions } = fixture(async address => ({ ...available(address), providerSecret: "provider-secret", providerWalletId: "private-wallet-a" }));
  for (const name of tools) {
    const result = await executeMcpReadQuery(name, { networks: ["tempo:moderato"] }, principal(ownerA), definitions);
    assert.doesNotMatch(JSON.stringify(result), /providerSecret|providerWalletId|provider-secret|private-wallet-a/);
  }
}));

test("flag rollback stops Tempo RPC and returns no foreign or disabled registration", async () => withTempo(async () => {
  const { definitions, calls } = fixture();
  process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "false";
  for (const name of tools) {
    const result = await executeMcpReadQuery(name, { networks: ["tempo:moderato"] }, principal(ownerA), definitions) as Record<string, unknown>;
    assert.deepEqual(result.wallets ?? result.balances, []);
  }
  assert.equal(calls.filter(call => call.type === "tempo").length, 0);
}));

async function withTempo(run: () => Promise<void>) {
  const env = { CARMELITA_TEMPO_TESTNET_ENABLED: "true", CARMELITA_PREVIEW_ISOLATED: "true", VERCEL_ENV: "preview" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
