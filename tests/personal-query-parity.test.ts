import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";
import { createPersonalQueries, readOwnConnectedApps, type PersonalQueryDependencies } from "../app/queries/personal";
import { executeQueryDefinition } from "../app/queries/types";
import { readStytchConnectedAppsConfig } from "../app/stytch/connected-apps-config";
import { DEFAULT_AUTOPILOT_CONFIG } from "../app/agent-autopilot";
import { AVALANCHE_X402 } from "../app/x402-avalanche/config";
import { agentContinuationUrl } from "../app/queries/links";

const date = new Date("2026-10-01T07:00:00Z");
const own = "did:privy:owner-a";
const foreign = "did:privy:owner-b";
const address = "0x7A33b72BddF1d6D01c279b6cC9049c5E751f9d07";
const stellar = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";
const solana = "4yAd1yx6WKukQR1ZR1VHUub1fMKMriwfb6QqRG3r5phn";
function wallet(userId: string, network: string, walletAddress = address, chainType = "ethereum", status = "active") {
  return { id: `${userId}:${chainType}`, walletId: `${userId}:${chainType}`, userId, address: walletAddress,
    chainType, network, status, updatedAt: date };
}

function fixture(overrides: Partial<PersonalQueryDependencies> = {}) {
  const calls: Array<{ operation: string; owner?: string }> = [];
  const rows = [wallet(own, "avalanche:fuji"), wallet(own, "stellar:testnet", stellar, "stellar", "pending"),
    wallet(own, "solana:devnet", solana, "solana"), wallet(foreign, "avalanche:fuji", "0x1111111111111111111111111111111111111111")];
  const dependencies: PersonalQueryDependencies = {
    context: async (userId) => {
      calls.push({ operation: "context", owner: userId });
      return { user: { id: userId, email: null, status: "active", lastSeenAt: date },
        ...buildMcpWalletContext(rows.filter((row) => row.userId === userId)), connections: [],
        authority: { paymentSigning: "not_enabled", custody: false, writeToolsRequireExplicitApproval: true } };
    },
    conversation: async (userId) => { calls.push({ operation: "conversation", owner: userId }); return { conversationId: null, messages: [] }; },
    wallets: async (userId) => { calls.push({ operation: "wallets", owner: userId }); return rows; },
    nativeBalance: async (network, walletAddress) => {
      calls.push({ operation: `balance:${network}:${walletAddress}` });
      if (network === "stellar:testnet") return null;
      if (network === "solana:devnet") throw new Error("rpc_unavailable:secret-provider-detail");
      return "0 AVAX";
    },
    watchlist: async (userId) => { calls.push({ operation: "watchlist", owner: userId }); return [{ symbol: "XLM", source: "coinmarketcap", createdAt: date }]; },
    quotes: async (assets) => { calls.push({ operation: `quotes:${assets.map((asset) => asset.query).join(",")}` }); return { results: assets.map((request) => ({ request, status: "unavailable" })), queriedAt: date.toISOString(), fetchedAt: date.toISOString(), dataScope: "mainnet_market_data" }; },
    connections: async (userId) => { calls.push({ operation: "connections", owner: userId }); return [{ provider: "notion", status: "active", scopes: ["search"], tokenExpiresAt: null, updatedAt: date, accessTokenEncrypted: "secret" }]; },
    connectedApps: async (userId) => { calls.push({ operation: "connectedApps", owner: userId }); return { status: "connection_required", connectedApps: [], source: "Stytch", connectionUrl: agentContinuationUrl() }; },
    memory: async (userId) => { calls.push({ operation: "memory", owner: userId }); return { knowledge: [], policies: [], decisions: [] }; },
    activity: async (userId) => { calls.push({ operation: "activity", owner: userId }); return []; },
    autopilot: async (userId) => { calls.push({ operation: "autopilot", owner: userId }); return { status: "off", config: DEFAULT_AUTOPILOT_CONFIG, signer: { ready: false, status: "manual_signature_required" } }; },
    stellarAccount: async (walletAddress) => { calls.push({ operation: `stellar:${walletAddress}` }); return { exists: false, sequence: null, balances: [] }; },
    evmDiagnostics: async (network, walletAddress) => {
      calls.push({ operation: `evm:${network.id}:${walletAddress}` });
      return { network: network.id, chainId: network.chainId!, address: walletAddress, balanceWei: "0", balance: "0", nativeAsset: network.nativeAsset,
        gasPriceWei: "0", nonce: 0, funded: false, explorerUrl: `${network.explorerUrl}/address/${walletAddress}`, faucetUrl: network.faucetUrl };
    },
    erc20Balance: async (network, tokenAddress, walletAddress, decimals) => {
      calls.push({ operation: `erc20:${network.id}:${tokenAddress}:${walletAddress}` });
      return { tokenAddress, walletAddress, atomic: "0", balance: "0", decimals };
    },
    solanaBalance: async (walletAddress) => {
      calls.push({ operation: `solana:${walletAddress}` });
      return { address: walletAddress, lamports: 0, sol: 0, formatted: "0.0000 SOL" };
    },
    now: () => date.getTime(),
    ...overrides,
  };
  return { calls, definitions: createPersonalQueries(dependencies) };
}

test("every personal read authenticates and checks its retained scope before any owner/provider access", async () => {
  const { calls, definitions } = fixture();
  assert.equal(definitions.length, 11);
  for (const definition of definitions) {
    await assert.rejects(executeQueryDefinition(definition, {}, undefined), /mcp_personal_authorization_required/);
    await assert.rejects(executeQueryDefinition(definition, {}, { userId: own, scopes: [] }), /mcp_insufficient_scope/);
  }
  assert.deepEqual(calls, []);
  assert.equal(definitions.find((query) => query.toolName === "get_agent_context")?.scope, "agent:context");
  assert.equal(definitions.find((query) => query.toolName === "get_agent_conversation")?.scope, "agent:conversation");
});

test("owner selectors are rejected before reads; personal IDs only come from authenticated context", async () => {
  const { calls, definitions } = fixture();
  for (const definition of definitions) {
    for (const forbidden of [{ owner: foreign }, { userId: foreign }, { address }]) {
      await assert.rejects(executeQueryDefinition(definition, forbidden, { userId: own, scopes: [definition.scope] }));
    }
    assert.equal(calls.length, 0);
  }
  for (const definition of definitions) {
    await executeQueryDefinition(definition, {}, { userId: own, scopes: [definition.scope] });
  }
  assert.ok(calls.filter((call) => call.owner).every((call) => call.owner === own));
  assert.ok(!calls.some((call) => call.operation.includes("0x111111")));
});

test("registered wallets project safe metadata, preserve pending state and never perform RPC reads", async () => {
  const { calls, definitions } = fixture();
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets")!, {}, { userId: own, scopes: ["agent:read"] }) as { wallets: Array<Record<string, unknown>>; walletRegistration: { pendingActivation: unknown[] } };
  assert.equal(result.wallets.length, 3);
  assert.equal(result.walletRegistration.pendingActivation.length, 1);
  assert.ok(result.wallets.every((row) => !Object.hasOwn(row, "walletId") && !Object.hasOwn(row, "userId")));
  assert.match(String(result.wallets.find((row) => row.network === "solana:devnet")?.explorerUrl), /cluster=devnet/);
  assert.match(String(result.wallets.find((row) => row.network === "stellar:testnet")?.explorerUrl), /testnet/);
  assert.deepEqual(calls.map((call) => call.operation), ["wallets"]);
});

test("native balances preserve real zero, inactive Stellar account and per-network failure independently", async () => {
  const { calls, definitions } = fixture();
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.balances")!, {}, { userId: own, scopes: ["agent:read"] }) as { status: string; balances: Array<Record<string, unknown>> };
  assert.equal(result.status, "partial");
  const evm = result.balances.find((row) => row.network === "avalanche:fuji")!;
  assert.equal(evm.balance, "0 AVAX");
  assert.equal(evm.status, "ok");
  const absent = result.balances.find((row) => row.network === "stellar:testnet")!;
  assert.equal(absent.balance, null);
  assert.equal(absent.status, "not_activated");
  assert.equal(absent.registrationStatus, "pending");
  assert.equal(absent.onChainAccountExists, false);
  assert.equal(result.balances.find((row) => row.network === "solana:devnet")?.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-detail|owner-b/);
  assert.equal(calls.filter((call) => call.operation.startsWith("balance:")).length, 3);
});

test("native balance network filters cannot introduce wallets or change the registry", async () => {
  const { calls, definitions } = fixture();
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.balances")!, { networks: ["avalanche:fuji"] }, { userId: own, scopes: ["agent:read"] }) as { balances: Array<Record<string, unknown>> };
  assert.equal(result.balances.length, 1);
  assert.equal(result.balances[0].address, address);
  assert.equal(calls.filter((call) => call.operation.startsWith("balance:")).length, 1);
});

test("watchlist reads the existing canonical symbol and uses effective market source independently of stored provider", async () => {
  const { calls, definitions } = fixture();
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.watchlist")!, {}, { userId: own, scopes: ["agent:read"] }) as { items: Array<Record<string, unknown>>; quotes: { results: Array<{ status: string }> } };
  assert.equal(result.items[0].symbol, "XLM");
  assert.equal(result.items[0].storedSource, "coinmarketcap");
  assert.equal(result.quotes.results[0].status, "unavailable");
  assert.deepEqual(calls.map((call) => call.operation), ["watchlist", "quotes:XLM"]);
});

test("watchlist can skip providers or bound a quote request to ten without modifying any stored item", async () => {
  const items = Array.from({ length: 20 }, (_, index) => ({ symbol: `TOKEN${index}`, source: "coinmarketcap", createdAt: date }));
  const { calls, definitions } = fixture({ watchlist: async () => items });
  const query = definitions.find((item) => item.id === "personal.watchlist")!;
  const first = await executeQueryDefinition(query, { includeQuotes: false }, { userId: own, scopes: ["agent:read"] }) as { quotes: unknown; items: unknown[] };
  assert.equal(first.quotes, null);
  assert.equal(first.items.length, 20);
  assert.equal(calls.length, 0);
  const second = await executeQueryDefinition(query, {}, { userId: own, scopes: ["agent:read"] }) as { quotedItems: number; unquotedItems: number };
  assert.equal(second.quotedItems, 10);
  assert.equal(second.unquotedItems, 10);
  assert.equal(calls[0].operation.split(",").length, 10);
  assert.deepEqual(items.map((item) => item.symbol), Array.from({ length: 20 }, (_, index) => `TOKEN${index}`));
});

test("connection responses expose effective scopes and visible handoff without provider tokens", async () => {
  const { definitions } = fixture();
  const principal = { userId: own, scopes: ["agent:read"] };
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.connections")!, {}, principal) as { connections: Array<Record<string, unknown>> };
  assert.deepEqual(result.connections[0].scopes, ["search"]);
  assert.equal(result.connections[0].connectionUrl, agentContinuationUrl());
  assert.doesNotMatch(JSON.stringify(result), /accessToken|secret/);
  const apps = await executeQueryDefinition(definitions.find((item) => item.id === "personal.connected_apps")!, {}, principal) as { status: string; connectionUrl: string };
  assert.equal(apps.status, "connection_required");
  assert.equal(apps.connectionUrl, agentContinuationUrl());
});

function stytchConfig() {
  return readStytchConnectedAppsConfig({ NODE_ENV: "production", STYTCH_PROJECT_ID: "project-test",
    STYTCH_SECRET: "server-secret", STYTCH_PROJECT_DOMAIN: "https://example.customers.stytch.com",
    CARMELITA_PUBLIC_ORIGIN: "https://carmelita.example", CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED: "true" });
}

test("connected apps resolves only the current owner's existing issuer link and projects granted metadata", async () => {
  const result = await readOwnConnectedApps(own, {
    config: stytchConfig,
    resolveSubject: async (input) => { assert.deepEqual(input, { issuer: stytchConfig().issuer, privyDid: own }); return "stytch-owner-a"; },
    listApps: async (config, subject) => {
      assert.equal(config.issuer, stytchConfig().issuer);
      assert.equal(subject, "stytch-owner-a");
      return [{ id: "app-1", name: "ChatGPT", clientType: "third_party", scopes: ["agent:read", "agent:context"], token: "provider-secret" }];
    },
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.connectedApps[0].scopes, ["agent:read", "agent:context"]);
  assert.doesNotMatch(JSON.stringify(result), /secret|stytch-owner-a|token/);
});

test("connected apps missing link never provisions an identity or starts a provider authorization", async () => {
  let contactedProvider = false;
  const result = await readOwnConnectedApps(own, {
    config: stytchConfig, resolveSubject: async () => null,
    listApps: async () => { contactedProvider = true; return []; },
  });
  assert.equal(result.status, "connection_required");
  assert.equal(result.connectionUrl, agentContinuationUrl());
  assert.equal(contactedProvider, false);
});

test("connected apps provider failure publishes a stable unavailable status without exposing failure details", async () => {
  const result = await readOwnConnectedApps(own, {
    config: stytchConfig, resolveSubject: async () => "stytch-owner-a",
    listApps: async () => { throw new Error("upstream-provider-secret"); },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.error, "connected_apps_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /provider-secret|stytch-owner-a/);
});

test("autopilot status reads grant no authority and reject activation or policy overrides before lookup", async () => {
  const { definitions, calls } = fixture();
  const definition = definitions.find((item) => item.id === "personal.autopilot")!;
  const principal = { userId: own, scopes: ["agent:read"] };
  for (const input of [{ action: "activate" }, { status: "active" }, { delegatedSignerReady: true }, { xlmPerAction: 100 }]) {
    await assert.rejects(executeQueryDefinition(definition, input, principal));
  }
  assert.deepEqual(calls, []);
  const result = await executeQueryDefinition(definition, {}, principal) as { status: string; authority: Record<string, boolean> };
  assert.equal(result.status, "off");
  assert.deepEqual(result.authority, { policyChanged: false, signingAuthorityGranted: false, transactionPrepared: false, fundsMoved: false, executionEnabled: false });
  assert.deepEqual(calls, [{ operation: "autopilot", owner: own }]);
});

test("wallet status returns separate exact Stellar issuers and Fuji Circle contract without creating or selecting another owner", async () => {
  const firstIssuer = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";
  const secondIssuer = `G${"A".repeat(55)}`;
  const { definitions, calls } = fixture({
    stellarAccount: async (walletAddress, signal) => {
      assert.equal(walletAddress, stellar);
      assert.ok(signal);
      return { exists: true, sequence: "1", balances: [
        { asset: "XLM", balance: "123.456", issuer: null },
        { asset: "USDC", balance: "0.0000000", issuer: firstIssuer },
        { asset: "USDC", balance: "6.2500000", issuer: secondIssuer },
      ] };
    },
    nativeBalance: async () => "0 SOL",
  });
  const definition = definitions.find((item) => item.id === "personal.wallets.status")!;
  const result = await executeQueryDefinition(definition, {}, { userId: own, scopes: ["agent:read"] }) as { wallets: Array<Record<string, unknown>>; authority: Record<string, boolean>; status: string };
  assert.equal(result.status, "ok");
  assert.equal(result.wallets.length, 3);
  const stellarRow = result.wallets.find((row) => row.network === "stellar:testnet") as { registrationStatus: string; onChainAccountExists: boolean; native: { balance: string }; tokens: Array<{ asset: string; issuer: string; balance: string }> };
  assert.equal(stellarRow.registrationStatus, "pending");
  assert.equal(stellarRow.onChainAccountExists, true);
  assert.equal(stellarRow.native.balance, "123.456");
  assert.deepEqual(stellarRow.tokens.map(({ asset, issuer, balance }) => ({ asset, issuer, balance })), [
    { asset: "USDC", issuer: firstIssuer, balance: "0.0000000" }, { asset: "USDC", issuer: secondIssuer, balance: "6.2500000" },
  ]);
  const fuji = result.wallets.find((row) => row.network === "avalanche:fuji") as { native: { balance: string }; tokens: Array<{ contract: string; balance: string }> };
  assert.equal(fuji.native.balance, "0");
  assert.equal(fuji.tokens[0].balance, "0");
  assert.equal(fuji.tokens[0].contract, AVALANCHE_X402.asset.address);
  assert.equal(calls.filter((call) => call.operation.startsWith("erc20:")).length, 1);
  assert.ok(calls.some((call) => call.operation === `erc20:avalanche:fuji:${AVALANCHE_X402.asset.address}:${address}`));
  assert.doesNotMatch(JSON.stringify(result), /owner-b|walletId|providerWalletId|signingHash|preparedXdr/);
  assert.deepEqual(result.authority, { signingAuthorityGranted: false, transactionPrepared: false, fundsMoved: false });
});

test("wallet status preserves partial native/token successes and reports unknown readings as null instead of zero", async () => {
  const { definitions } = fixture({
    evmDiagnostics: async () => { throw new Error("rpc:provider-secret"); },
    stellarAccount: async () => { throw new Error("horizon:provider-secret"); },
  });
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.status")!, {}, { userId: own, scopes: ["agent:read"] }) as { status: string; wallets: Array<Record<string, unknown>> };
  assert.equal(result.status, "partial");
  const fuji = result.wallets.find((row) => row.network === "avalanche:fuji") as { status: string; native: { balance: null }; tokens: Array<{ balance: string }> };
  assert.equal(fuji.status, "partial");
  assert.equal(fuji.native.balance, null);
  assert.equal(fuji.tokens[0].balance, "0");
  const stellarRow = result.wallets.find((row) => row.network === "stellar:testnet")!;
  assert.equal(stellarRow.onChainAccountExists, null);
  assert.equal(stellarRow.tokensStatus, "unavailable");
  assert.equal(stellarRow.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /provider-secret/);
});

test("wallet status honors missing Stellar account and failed Circle token without marking registration as activation", async () => {
  const { definitions } = fixture({ erc20Balance: async () => { throw new Error("token-balance-private"); } });
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.status")!, { networks: ["stellar:testnet", "avalanche:fuji"] }, { userId: own, scopes: ["agent:read"] }) as { wallets: Array<Record<string, unknown>> };
  const stellarRow = result.wallets.find((row) => row.network === "stellar:testnet") as { status: string; onChainAccountExists: boolean; native: { balance: null }; tokens: unknown[] };
  assert.equal(stellarRow.status, "not_activated");
  assert.equal(stellarRow.onChainAccountExists, false);
  assert.equal(stellarRow.native.balance, null);
  assert.deepEqual(stellarRow.tokens, []);
  const fuji = result.wallets.find((row) => row.network === "avalanche:fuji") as { status: string; native: { balance: string }; tokens: Array<{ balance: null; status: string }> };
  assert.equal(fuji.status, "partial");
  assert.equal(fuji.native.balance, "0");
  assert.equal(fuji.tokens[0].balance, null);
  assert.equal(fuji.tokens[0].status, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /token-balance-private/);
});

test("wallet status flags malformed Stellar asset amounts and unsupported balances instead of inventing holdings", async () => {
  const { definitions } = fixture({ stellarAccount: async () => ({ exists: true, sequence: null, balances: [
    { asset: "XLM", issuer: null, balance: "1.0000000" },
    { asset: "USDC", issuer: `G${"A".repeat(55)}`, balance: "not-a-number" },
    { asset: "liquidity_pool_shares", issuer: null, balance: "7" },
  ] }) });
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.status")!, { networks: ["stellar:testnet"] }, { userId: own, scopes: ["agent:read"] }) as { wallets: Array<{ status: string; tokens: Array<{ balance: null; status: string }>; omittedBalances: number }> };
  assert.equal(result.wallets[0].status, "partial");
  assert.equal(result.wallets[0].tokens[0].balance, null);
  assert.equal(result.wallets[0].tokens[0].status, "unavailable");
  assert.equal(result.wallets[0].omittedBalances, 1);
});

test("wallet status discards a token reading when the RPC reports a different EVM chain", async () => {
  const { definitions } = fixture({ evmDiagnostics: async () => { throw new Error("evm_chain_id_mismatch"); } });
  const result = await executeQueryDefinition(definitions.find((item) => item.id === "personal.wallets.status")!, { networks: ["avalanche:fuji"] }, { userId: own, scopes: ["agent:read"] }) as { wallets: Array<{ status: string; tokens: Array<{ balance: null; status: string; error: string }> }> };
  assert.equal(result.wallets[0].status, "unavailable");
  assert.equal(result.wallets[0].tokens[0].balance, null);
  assert.equal(result.wallets[0].tokens[0].status, "unavailable");
  assert.equal(result.wallets[0].tokens[0].error, "token_network_unverified");
});
