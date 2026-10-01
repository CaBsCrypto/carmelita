import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalQueries, readOwnWalletRegistry, type PersonalQueryDependencies } from "../app/queries/personal";
import { executeWebReadQuery } from "../app/queries/adapters";
import { readAvalancheWalletPanel, readConnectionsPanel, readSolanaWalletPanel, readWalletListPanel, withPersonalPanelReadDeadline, type PersonalPanelDependencies } from "../app/queries/personal-panels";
import { getWalletNetwork } from "../app/wallets/networks";
import { AVALANCHE_X402 } from "../app/x402-avalanche/config";
import { GET as walletsGET } from "../app/api/agent/wallets/route";
import { GET as avalancheGET } from "../app/api/agent/wallets/avalanche/route";
import { GET as solanaGET } from "../app/api/agent/wallets/solana/route";
import { GET as connectionsGET } from "../app/api/connections/route";

const owner = "did:privy:panel-owner";
const foreign = "did:privy:panel-foreign";
const evm = `0x${"a".repeat(40)}`;
const solana = "4yAd1yx6WKukQR1ZR1VHUub1fMKMriwfb6QqRG3r5phn";
const date = new Date("2026-10-01T07:00:00Z");
const row = (userId: string, network: string, chainType: string, address: string, status = "active") => ({
  id: `${userId}-provider-id`, walletId: `${userId}-provider-id`, userId, network, chainType, address, status, updatedAt: date,
});

function fixture(overrides: Partial<PersonalQueryDependencies> = {}) {
  const reads: string[] = [];
  const rows = [row(foreign, "avalanche:fuji", "ethereum", `0x${"b".repeat(40)}`),
    row(owner, "avalanche:fuji", "ethereum", evm), row(owner, "solana:devnet", "solana", solana)];
  const forbidden = async () => { throw new Error("unexpected_ancillary_read"); };
  const queryDependencies: PersonalQueryDependencies = {
    context: forbidden, conversation: forbidden, nativeBalance: forbidden, watchlist: forbidden, quotes: forbidden,
    connectedApps: forbidden, memory: forbidden, activity: forbidden, autopilot: forbidden, stellarAccount: forbidden,
    wallets: async (userId) => { assert.equal(userId, owner); reads.push("registry"); return rows; },
    evmDiagnostics: async (network, address) => {
      assert.equal(network.id, "avalanche:fuji"); assert.equal(address, evm); reads.push("native");
      return { network: network.id, chainId: 43113, address, balanceWei: "1250000000000000000", balance: "1.25",
        nativeAsset: "AVAX", gasPriceWei: "25000000000", nonce: 4, funded: true,
        explorerUrl: `${network.explorerUrl}/address/${address}`, faucetUrl: network.faucetUrl };
    },
    erc20Balance: async (network, tokenAddress, walletAddress, decimals) => {
      assert.equal(network.id, "avalanche:fuji"); assert.equal(tokenAddress, AVALANCHE_X402.asset.address);
      assert.equal(walletAddress, evm); reads.push("token");
      return { tokenAddress, walletAddress, decimals, atomic: "2500000", balance: "2.5" };
    },
    solanaBalance: async (address) => {
      assert.equal(address, solana); reads.push("solana");
      return { address, lamports: 123456789, sol: 0.123456789, formatted: "0.1235 SOL" };
    },
    connections: async (userId) => {
      assert.equal(userId, owner); reads.push("connections");
      return [{ provider: "notion", status: "active", scopes: ["search"], tokenExpiresAt: null, updatedAt: date, accessTokenEncrypted: "private-secret" }];
    },
    now: () => date.getTime(), ...overrides,
  };
  const definitions = createPersonalQueries(queryDependencies);
  const dependencies: PersonalPanelDependencies = {
    registry: (userId) => readOwnWalletRegistry(userId, queryDependencies.wallets),
    execute: (id, input, userId, locale) => executeWebReadQuery(id, input, userId, locale, definitions),
    distributorConfig: () => ({ enabled: false, reason: "fuji_distributor_disabled" }),
  };
  return { reads, rows, definitions, dependencies };
}

test("wallet list panel retains legacy IDs and dates only for session owner, while MCP projections omit them", async () => {
  const { dependencies, definitions, reads } = fixture();
  const panel = await readWalletListPanel(owner, dependencies);
  assert.equal(panel.wallets.length, 2);
  assert.equal(panel.wallets[0].walletId, `${owner}-provider-id`);
  assert.equal(panel.wallets[0].updatedAt, date);
  assert.ok(panel.networks.find((network) => network.id === "avalanche:fuji")?.active);
  assert.doesNotMatch(JSON.stringify(panel), /panel-foreign|userId|accessToken/);
  assert.deepEqual(reads, ["registry"]);
  const context = await executeWebReadQuery("personal.wallets", {}, owner, "es", definitions);
  assert.doesNotMatch(JSON.stringify(context), /provider-id|walletId|userId|panel-foreign/);
});

test("Avalanche panel preserves native diagnostics, Circle balance and public funding metadata through shared status", async () => {
  const { dependencies, reads } = fixture();
  const result = await readAvalancheWalletPanel(owner, dependencies);
  assert.equal(result.address, evm);
  assert.equal(result.chainId, 43113);
  assert.equal(result.balance, "1.25");
  assert.equal(result.balanceWei, "1250000000000000000");
  assert.equal(result.nonce, 4);
  assert.deepEqual(result.balances, { native: { asset: "AVAX", balance: "1.25" }, usdc: { asset: "USDC", balance: "2.5", contract: AVALANCHE_X402.asset.address } });
  assert.equal(result.funding.automaticEnabled, false);
  assert.equal(result.funding.automaticReason, "fuji_distributor_disabled");
  assert.equal(result.funding.claimWindow, "once_per_authenticated_user");
  assert.equal(result.explorerUrl, `${getWalletNetwork("avalanche:fuji").explorerUrl}/address/${evm}`);
  assert.deepEqual(reads, ["registry", "registry", "native", "token"]);
  assert.doesNotMatch(JSON.stringify(result), /provider-id|secret|signature|preparedXdr/);
});

test("Solana panel preserves exact lamports independently from rounded display text", async () => {
  const { dependencies, definitions } = fixture();
  assert.deepEqual(await readSolanaWalletPanel(owner, dependencies), {
    address: solana, network: "solana:devnet", nativeAsset: "SOL", balance: "0.1235 SOL",
    sol: 0.123456789, lamports: 123456789, explorerUrl: `https://explorer.solana.com/address/${solana}?cluster=devnet`,
  });
  const status = await executeWebReadQuery("personal.wallets.status", { networks: ["solana:devnet"] }, owner, "es", definitions) as { wallets: Array<{ native: { balance: string } }> };
  assert.equal(status.wallets[0].native.balance, "0.123456789");
});

test("panels reject foreign or pending registrations before any RPC call", async () => {
  for (const network of ["avalanche:fuji", "solana:devnet"]) {
    for (const kind of ["foreign", "pending"] as const) {
      const { dependencies, reads, rows } = fixture();
      for (const wallet of rows.filter((wallet) => wallet.network === network && wallet.userId === owner)) {
        if (kind === "foreign") wallet.userId = foreign;
        else wallet.status = "pending";
      }
      await assert.rejects(network === "avalanche:fuji" ? readAvalancheWalletPanel(owner, dependencies) : readSolanaWalletPanel(owner, dependencies),
        new RegExp(network === "avalanche:fuji" ? "avalanche_not_activated" : "solana_not_activated"));
      assert.deepEqual(reads, ["registry"]);
    }
  }
});

test("panels retain provider unavailable errors and never substitute null with zero", async () => {
  const fuji = fixture({ erc20Balance: async () => { throw new Error("evm_rpc_http_503:private-provider-detail"); } });
  await assert.rejects(readAvalancheWalletPanel(owner, fuji.dependencies), /evm_rpc_http_503/);
  const sol = fixture({ solanaBalance: async () => { throw new Error("private-provider-detail"); } });
  await assert.rejects(readSolanaWalletPanel(owner, sol.dependencies), { message: "solana_balance_unavailable" });
});

test("connection panel retains old metadata DTO and effective granted scopes without tokens", async () => {
  const { dependencies, reads } = fixture();
  const result = await readConnectionsPanel(owner, dependencies);
  assert.deepEqual(result, { connections: [{ provider: "notion", status: "active", scopes: ["search"], tokenExpiresAt: null, updatedAt: date.toISOString() }] });
  assert.deepEqual(reads, ["connections"]);
  assert.doesNotMatch(JSON.stringify(result), /secret|accessToken|connectionUrl/);
});

test("all four real GET handlers reject missing authentication before shared reads", async () => {
  for (const handler of [walletsGET, avalancheGET, solanaGET, connectionsGET]) {
    const response = await handler(new Request("https://carmelita.example/api/agent/wallets"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "privy_access_token_missing" });
  }
});

test("Solana GET keeps its existing origin protection before authentication", async () => {
  const response = await solanaGET(new Request("https://carmelita.example/api/agent/wallets/solana", {
    headers: { host: "carmelita.example", origin: "https://other.example" },
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "invalid_origin" });
});

test("whole panel read bounds a stalled registry stage without publishing an incomplete wallet DTO", async () => {
  await assert.rejects(withPersonalPanelReadDeadline(() => new Promise<never>(() => {}), 1), { message: "read_query_timeout" });
  assert.deepEqual(await withPersonalPanelReadDeadline(async () => ({ wallets: [] }), 10), { wallets: [] });
});
