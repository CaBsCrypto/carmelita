import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { DEFINDEX_TESTNET } from "../app/connectors/defindex";
import { executeMcpReadQuery, executeWebReadQuery } from "../app/queries/adapters";
import { createDiscoveryQueries, readPublicInfrastructureStatus } from "../app/queries/discovery";
import { executeReadQuery, listReadQueries, readQueryDefinitions } from "../app/queries/registry";
import { defineQuery, type QueryDefinition } from "../app/queries/types";
import { createMetadataQueries } from "../app/queries/metadata";
import { agentContinuationUrl } from "../app/queries/links";
import { evaluateQueryAcceptance } from "../app/queries/acceptance";
import { listAvalancheCapabilities } from "../app/avalanche/capability-registry";

const principal = (scope = "agent:read", userId = "owner-a"): AuthInfo => ({
  token: "fixture-not-a-credential", clientId: "parity-test", scopes: [scope], extra: { subjectType: "user", userId },
});
const collection = "0x1111111111111111111111111111111111111111";
const runMcp = async (...args: Parameters<typeof executeMcpReadQuery>) => executeMcpReadQuery(...args);
function inputFor(id: string): Record<string, unknown> {
  switch (id) {
    case "offchain.market.search": return { asset: { query: "USDC", network: "solana" } };
    case "offchain.market.quote": return { assets: [{ query: "USDC", network: "solana" }, { query: "not-a-token" }], locale: "es" };
    case "avalanche.docs.search": case "avalanche.skills.search": case "offchain.notion.search": case "stellar.bazaar.discovery": return { query: "wallet integration" };
    case "dexalot.quote.read": case "lfj.swap.quote.read": return { amount: "1", assetIn: "AVAX", assetOut: "USDC" };
    case "avalanche.nft.collection_read": case "avalanche.nft.holder_distribution": return { collection };
    case "avalanche.nft.provenance_read": return { collection, tokenId: "1" };
    case "offchain.travala.hotel_search": return { location: "Santiago", checkIn: "2099-01-01", checkOut: "2099-01-03", guests: 1 };
    case "stellar.soroswap.quote": return { assetIn: "XLM", assetOut: "USDC", amount: "1" };
    case "offchain.capabilities.get": return { capabilityId: "stellar.wallet.status" };
    default: return {};
  }
}

test("read registry has unique strict contracts, existing tool aliases and evidence-derived acceptance", () => {
  assert.equal(new Set(readQueryDefinitions.map(query => query.id)).size, readQueryDefinitions.length);
  assert.equal(new Set(readQueryDefinitions.map(query => query.toolName)).size, readQueryDefinitions.length);
  const aliases = new Map([
    ["personal.context", "get_agent_context"], ["personal.conversation", "get_agent_conversation"],
    ["avalanche.skills.search", "search_avax_skills"], ["offchain.market.search", "search_market_assets"],
    ["offchain.market.quote", "get_market_quotes"], ["offchain.defillama.chains", "compare_chains"],
    ["offchain.capabilities.list", "list_capabilities"], ["offchain.capabilities.get", "get_capability"],
    ["avalanche.capabilities.list", "list_avalanche_capabilities"],
  ]);
  for (const query of readQueryDefinitions) {
    assert.equal(query.toolName, aliases.get(query.id) ?? `read_${query.id.replaceAll(".", "_")}`, query.id);
    assert.ok(["agent:read", "agent:context", "agent:conversation"].includes(query.scope));
    assert.ok(query.dataScope);
    assert.equal(query.inputSchema.safeParse(inputFor(query.id)).success, true, `Missing valid acceptance input for ${query.id}`);
    for (const ownerSelector of ["userId", "ownerId", "privyDid", "subjectId"]) {
      assert.equal(query.inputSchema.safeParse({ ...inputFor(query.id), [ownerSelector]: "owner-b" }).success, false, `${query.id} allows ${ownerSelector}`);
    }
  }
  for (const item of listReadQueries()) {
    assert.deepEqual(item.channels, { carmelita: true, chatgpt: true });
    const definition = readQueryDefinitions.find(query => query.id === item.id)!;
    assert.equal(item.acceptance, evaluateQueryAcceptance(definition).acceptance);
  }
});

test("every enabled catalog business read is backed by a shared executable query", () => {
  const toolNames = new Set(readQueryDefinitions.map(query => query.toolName));
  for (const capability of listGatewayCapabilities().filter(item => item.operation === "read")) {
    assert.ok(capability.readTools?.length, `Unmapped read capability: ${capability.id}`);
    for (const toolName of capability.readTools) assert.ok(toolNames.has(toolName), `${capability.id}: ${toolName} is not a shared query`);
    assert.equal(capability.execution.exposedByGateway, true);
  }
  for (const capability of listGatewayCapabilities().filter(item => item.operation !== "read")) {
    assert.equal(capability.execution.exposedByGateway, false, `Financial/preparation capability exposed as a read: ${capability.id}`);
  }
});

test("the review matrix inventories every installed query and explicitly classifies excluded lifecycles", async () => {
  const matrix = await readFile(new URL("../docs/channel-parity.md", import.meta.url), "utf8");
  const documented = new Set([...matrix.matchAll(/^\| `([^`]+)`(?: \/ `[^`]+`)? \|/gm)].map(match => match[1]));
  for (const query of readQueryDefinitions) assert.ok(documented.has(query.id), `Missing matrix entry for ${query.id}`);
  for (const boundary of ["bootstrap", "watchlist add/remove", "OAuth start/callback", "CCTP POST `plan`", "/api/commerce", "real OAuth expiry"]) {
    assert.ok(matrix.includes(boundary), `Missing explicit lifecycle/acceptance boundary: ${boundary}`);
  }
});

test("catalog separates user connections from provider keys and wallet prerequisites", () => {
  const capabilities = listGatewayCapabilities();
  const find = (id: string) => {
    const capability = capabilities.find(item => item.id === id);
    assert.ok(capability);
    return capability;
  };
  for (const id of ["offchain.notion.search", "offchain.unblck.hub_state"]) assert.equal(find(id).availability?.connection, "required", id);
  for (const id of ["stellar.soroswap.quote", "stellar.defindex.position.read", "avalanche.aave.position.read", "personal.wallets.status", "avalanche.docs.tools"]) assert.equal(find(id).availability?.connection, "not_required", id);
  assert.ok(find("stellar.soroswap.quote").requirements.includes("soroswap_api"));
  assert.ok(find("avalanche.aave.position.read").requirements.includes("evm_wallet"));
  assert.ok(find("offchain.notion.search").requirements.includes("notion_oauth"));
});

test("continuation links use HTTPS origins without embedded credentials or navigation payloads", () => {
  const original = process.env.CARMELITA_PUBLIC_ORIGIN;
  try {
    for (const invalid of ["http://localhost:3000", "https://user:password@example.com", "https://example.com/other", "https://example.com?token=private", "https://example.com#private", "invalid"]) {
      process.env.CARMELITA_PUBLIC_ORIGIN = invalid;
      assert.equal(agentContinuationUrl(), "https://carmelita.browns.studio/agent");
    }
    process.env.CARMELITA_PUBLIC_ORIGIN = "https://qa.carmelita.example/";
    assert.equal(agentContinuationUrl(), "https://qa.carmelita.example/agent");
    delete process.env.CARMELITA_PUBLIC_ORIGIN;
    assert.equal(agentContinuationUrl(), "https://carmelita.browns.studio/agent");
  } finally {
    if (original === undefined) delete process.env.CARMELITA_PUBLIC_ORIGIN;
    else process.env.CARMELITA_PUBLIC_ORIGIN = original;
  }
});

test("Avalanche discovery preserves legacy fields and shares channel availability with the common catalog", async () => {
  const web = await executeWebReadQuery("avalanche.capabilities.list", {}, "owner-a", "es");
  const mcp = await executeMcpReadQuery("avalanche.capabilities.list", {}, principal());
  assert.deepEqual(web, mcp);
  const common = new Map(listGatewayCapabilities().map(capability => [capability.id, capability]));
  const result = web as { capabilities: Array<Record<string, unknown>> };
  for (const legacy of listAvalancheCapabilities()) {
    const actual = result.capabilities.find(capability => capability.id === legacy.id);
    assert.ok(actual);
    for (const [key, value] of Object.entries(legacy)) assert.deepEqual(actual[key], value, `${legacy.id}:${key}`);
    assert.deepEqual(actual.channels, common.get(legacy.id)?.channels);
    assert.deepEqual(actual.availability, common.get(legacy.id)?.availability);
  }
  const floor = result.capabilities.find(capability => capability.id === "avalanche.nft.floor_read")!;
  assert.equal((floor.availability as { available: boolean }).available, false);
  assert.equal((floor.availability as { provider: string }).provider, "known_unavailable");
});

test("Avalanche documentation metadata uses shared typed authorization and fixed sanitized failures", async () => {
  let calls = 0;
  const definitions = createMetadataQueries({ docsTools: async () => {
    calls++;
    return { endpoint: "https://build.avax.network/api/mcp", available: ["docs_search"], remoteToolCount: 1, readOnly: true };
  } });
  await assert.rejects(runMcp("avalanche.docs.tools", {}, undefined, definitions));
  await assert.rejects(runMcp("avalanche.docs.tools", {}, principal("agent:plan"), definitions));
  assert.equal(calls, 0);
  const web = await executeWebReadQuery("avalanche.docs.tools", {}, "owner-a", "es", definitions);
  const mcp = await executeMcpReadQuery("avalanche.docs.tools", {}, principal(), definitions);
  assert.deepEqual(web, mcp);
  assert.equal(calls, 2);
  const unavailable = await executeMcpReadQuery("avalanche.docs.tools", {}, principal(), createMetadataQueries({ docsTools: async () => { throw new Error("private_provider_secret"); } })) as Record<string, unknown>;
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.code, "avalanche_docs_tools_unavailable");
  assert.doesNotMatch(JSON.stringify(unavailable), /private_provider_secret/);
});

test("every read authorizes before parsing, owner lookup and provider I/O in both channels", async () => {
  let reads = 0;
  for (const definition of readQueryDefinitions) {
    const query: QueryDefinition = { ...definition, execute: async () => { reads++; throw new Error("unexpected_read"); } };
    await assert.rejects(executeReadQuery(query.id, null, undefined, { definitions: [query] }), /authorization_required/);
    await assert.rejects(runMcp(query.id, null, undefined, [query]), /mcp_principal_required/);
    await assert.rejects(runMcp(query.id, null, principal("unrelated:scope"), [query]), /mcp_scope_required/);
    await assert.rejects(runMcp(query.id, null, { ...principal(query.scope), extra: { subjectType: "provider", providerId: "provider-a" } }, [query]), /mcp_principal_required/);
    await assert.rejects(executeWebReadQuery(query.id, null, "", "es", [query]), /authorization_required/);
  }
  assert.equal(reads, 0);
  let parses = 0;
  const guarded = defineQuery({
    id: "fixture.guarded", toolName: "read_fixture_guarded", title: "Guarded fixture", description: "Authorization ordering",
    inputSchema: z.object({ value: z.string().transform(value => { parses++; return value; }) }).strict(),
    scope: "agent:read", dataScope: "fixture", execute: async () => { reads++; },
  });
  await assert.rejects(executeReadQuery(guarded.id, { value: "valid" }, { userId: "owner-a", scopes: [] }, { definitions: [guarded] }), /insufficient_scope/);
  assert.equal(parses, 0);
  assert.equal(reads, 0);
});

test("web and MCP preserve each typed read result and owner from authenticated identity", async () => {
  const unchanged = { walletIds: ["wallet-a"], owners: ["owner-a", "owner-b"], states: ["active"], permissions: ["agent:read"] };
  const baseline = structuredClone(unchanged);
  for (const definition of readQueryDefinitions) {
    const calls: string[] = [];
    const query: QueryDefinition = { ...definition, execute: async (input, context) => {
      calls.push(context.userId);
      return { input, owner: context.userId, locale: context.locale, dataScope: definition.dataScope, fixtureSource: "controlled", unchanged };
    } };
    const web = await executeWebReadQuery(query.id, inputFor(query.id), "owner-a", "es", [query]);
    const mcp = await executeMcpReadQuery(query.toolName, inputFor(query.id), principal(query.scope), [query]);
    assert.deepEqual(web, mcp, definition.id);
    const second = await executeMcpReadQuery(query.id, inputFor(query.id), principal(query.scope, "owner-b"), [query]) as { owner: string };
    assert.equal(second.owner, "owner-b");
    assert.deepEqual(calls, ["owner-a", "owner-a", "owner-b"]);
    await assert.rejects(runMcp(query.id, { ...inputFor(query.id), userId: "owner-b" }, principal(query.scope), [query]));
    assert.equal(calls.length, 3);
  }
  assert.deepEqual(unchanged, baseline);
});

test("existing scoped personal reads do not become agent:read permissions", async () => {
  for (const [id, scope] of [["personal.context", "agent:context"], ["personal.conversation", "agent:conversation"]]) {
    const query = readQueryDefinitions.find(item => item.id === id)!;
    assert.equal(query.scope, scope);
    await assert.rejects(runMcp(id, {}, principal()), /mcp_scope_required/);
  }
});

test("both adapters bound stalled providers and cancel completed-query timers", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const channel of ["web", "mcp"] as const) {
      let signal: AbortSignal | undefined;
      const stalled = defineQuery({
        id: "fixture.stalled", toolName: "read_fixture_stalled", title: "Stalled source", description: "Controlled timeout",
        inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "fixture",
        execute: async (_, queryContext) => { signal = queryContext.signal; return new Promise(() => {}); },
      });
      const pending = channel === "web"
        ? executeWebReadQuery(stalled.id, {}, "owner-a", "es", [stalled])
        : executeMcpReadQuery(stalled.id, {}, principal(), [stalled]);
      const rejection = assert.rejects(pending, /read_query_timeout/);
      context.mock.timers.tick(19_800);
      assert.equal(signal?.aborted, true, channel);
      context.mock.timers.tick(200);
      await rejection;
    }
    let completedSignal: AbortSignal | undefined;
    const completed = defineQuery({
      id: "fixture.completed", toolName: "read_fixture_completed", title: "Completed source", description: "Controlled completion",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "fixture",
      execute: async (_, queryContext) => { completedSignal = queryContext.signal; return { status: "ok" }; },
    });
    assert.deepEqual(await executeWebReadQuery(completed.id, {}, "owner-a", "es", [completed]), { status: "ok" });
    context.mock.timers.tick(20_000);
    assert.equal(completedSignal?.aborted, false, "Completed source timers must be cleared");
  } finally { context.mock.timers.reset(); }
});

test("shared query modules cannot call onboarding, schema preparation or financial writers", async () => {
  for (const sourceName of ["market", "personal", "personal-store", "ecosystem", "ecosystem-venue", "discovery", "metadata"]) {
    const source = await readFile(new URL(`../app/queries/${sourceName}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(?:provisionUserWallets|getOrCreateUserWallet|persistActivatedWallet|setPersistedWalletNetworkStatus|ensureConversation|ensureAgentVaultSchema|ensureDefindexSchema|prepareDefindexDeposit|prepareUsdcTrustline|buildSoroswapSwap|sendSoroswapSwap|fundStellarTestnetWallet|startNotionOAuth|createGatewayPlan)\s*\(/, sourceName);
    assert.doesNotMatch(source, /\.\s*(?:insert|delete)\s*\(|(?:\bdb|getDb\(\))\s*\.\s*update\s*\(|\bCREATE\s+(?:TABLE|INDEX)\b/i, sourceName);
  }
});

test("MCP registration and web discovery bind to shared contracts instead of separate tool inventories", async () => {
  const [mcp, discovery, web, chat] = await Promise.all([
    readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/.well-known/mcp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/queries/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/chat/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(mcp, /for\s*\(const query of readQueryDefinitions\)/);
  assert.match(mcp, /inputSchema: query\.inputSchema,/);
  assert.doesNotMatch(mcp, /inputSchema: query\.inputSchema\.shape/);
  assert.match(mcp, /executeMcpReadQuery\(query\.id, input, extra\.authInfo\)/);
  assert.match(discovery, /readQueries:\s*listReadQueries\(\)/);
  assert.match(web, /await ownUser\(request\)[\s\S]*executeWebReadQuery\(input\.query, input\.input, userId, input\.locale\)/);
  assert.match(chat, /locale:\s*z\.enum\(\["es", "en", "pt"\]\)\.optional\(\)/);
  assert.match(chat, /sendAgentMessage\(userId, input\.message, input\.locale\)/);
});

test("Testnet quotes preserve source identity and omit preparation material", async () => {
  let quotes = 0;
  const queries = createDiscoveryQueries({ getSoroswapQuote: async input => {
    quotes++;
    return { network: "testnet", assetIn: input.assetIn, assetOut: input.assetOut, amountIn: "1", amountOut: "2", minimumAmountOut: "1.99", priceImpactPct: "0.01", platform: "router", slippageBps: 50, routePlan: [], raw: { assetIn: "C".padEnd(56, "A"), assetOut: "C".padEnd(56, "B"), amountIn: "10000000", amountOut: "20000000", otherAmountThreshold: "19900000", tradeType: "EXACT_IN", priceImpactPct: "0.01", platform: "router", routePlan: [], providerPrivateDebug: "omit-me" } };
  } });
  const result = await executeMcpReadQuery("stellar.soroswap.quote", inputFor("stellar.soroswap.quote"), principal(), queries) as Record<string, unknown>;
  assert.equal(result.status, "ok");
  assert.equal(result.network, "stellar:testnet");
  assert.equal(result.transactionPrepared, false);
  assert.equal(result.fundsMoved, false);
  assert.equal(result.raw, undefined);
  assert.doesNotMatch(JSON.stringify(result), /omit-me|signedXdr|authorizationToken/);
  await assert.rejects(executeWebReadQuery("stellar.soroswap.quote", { assetIn: "XLM", assetOut: "USDC", amount: "101" }, "owner-a", "es", queries));
  assert.equal(quotes, 1);
});

test("MPP fallback examples never claim live availability or enable service consumption", async () => {
  const queries = createDiscoveryQueries({ discoverMppRouterServices: async () => ({ source: "fallback", services: [{ id: "fixture", name: "Fixture", path: "", price: "unknown", paymentStatus: "unknown" }] }) });
  const result = await executeMcpReadQuery("offchain.mpp.catalog", {}, principal(), queries) as Record<string, unknown>;
  assert.equal(result.status, "unavailable");
  assert.equal(result.examplesOnly, true);
  assert.equal(result.executionEnabled, false);
});

test("public infrastructure and authenticated reads share safe metadata and unknown-source semantics", async () => {
  const dependencies = {
    soroswapConfigured: () => true,
    getSoroswapHealth: async () => { throw new Error("health-provider-secret"); },
    discoverMppRouterServices: async () => ({ source: "fallback" as const, services: [] }),
    getUnblckReadiness: () => ({ configured: true, baseUrl: "https://private-config.example", channels: ["telegram", "whatsapp"] as ["telegram", "whatsapp"], capabilities: ["link", "state", "book", "cancel"], sourceOfTruth: "unblck" } as const),
  };
  const publicResult = await readPublicInfrastructureStatus(dependencies);
  const authenticated = await executeWebReadQuery("offchain.infrastructure.status", {}, "owner-a", "es", createDiscoveryQueries(dependencies)) as typeof publicResult;
  assert.deepEqual({ ...publicResult, fetchedAt: undefined }, { ...authenticated, fetchedAt: undefined });
  assert.equal(publicResult.soroswap.apiReachable, null);
  assert.equal(publicResult.soroswap.routeAvailable, null);
  assert.equal(publicResult.mppRouter.sourceStatus, "unavailable");
  assert.equal(publicResult.mppRouter.examplesOnly, true);
  assert.equal(publicResult.executionEnabled, false);
  assert.doesNotMatch(JSON.stringify(publicResult), /health-provider-secret|private-config\.example|API_KEY|baseUrl/);
});

test("legacy read panels use shared readers without schema or financial preparation", async () => {
  const [defindex, infrastructure, cctp, knowledge] = await Promise.all([
    readFile(new URL("../app/api/agent/defindex/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/infrastructure/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/bridge/cctp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/avalanche/knowledge/route.ts", import.meta.url), "utf8"),
  ]);
  const getOnly = defindex.split("export async function GET(request: Request)")[1].split("export async function POST")[0];
  assert.match(getOnly, /executeWebReadQuery\("stellar\.defindex\.position\.read", \{\}, userId\)/);
  assert.match(getOnly, /candidate\.userId === userId/);
  assert.match(getOnly, /where\(eq\(agentStellarActions\.userId, userId\)\)/);
  assert.match(getOnly, /\.limit\(10\)/);
  assert.doesNotMatch(getOnly, /ensureDefindexSchema\(|userWallet\(|\.insert\(|\.update\(|signedXdr|preparedXdr/);
  assert.match(infrastructure, /await readPublicInfrastructureStatus\(\)/);
  assert.doesNotMatch(infrastructure, /process\.env|discoverMppRouterServices|getSoroswapHealth/);
  assert.match(cctp, /executeWebReadQuery\("circle\.cctp\.fees\.read", \{\}, claims\.user_id\)/);
  assert.match(cctp, /executeWebReadQuery\("circle\.cctp\.readiness\.read", \{\}, claims\.user_id\)/);
  assert.match(knowledge, /executeWebReadQuery\("avalanche\.docs\.tools", \{\}, userId\)/);
  assert.doesNotMatch(knowledge, /listAvalancheReadOnlyTools/);
});

test("actual legacy DeFindex and CCTP read adapters preserve safe owner-bound output without schema writes", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./legacy-query-read-fixture.mts", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});

test("read errors never leak arbitrary provider messages or secrets", async () => {
  const queries = createDiscoveryQueries({ getSoroswapQuote: async () => { throw new Error("Authorization: Bearer secret-credential"); } });
  const result = await executeWebReadQuery("stellar.soroswap.quote", inputFor("stellar.soroswap.quote"), "owner-a", "es", queries) as Record<string, unknown>;
  assert.equal(result.status, "unavailable");
  assert.equal(result.error, "soroswap_quote_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /secret-credential|Bearer/);
  const disguised = createDiscoveryQueries({ getSoroswapQuote: async () => { throw new Error("private_key_looks_like_a_public_code"); } });
  const sanitized = await executeWebReadQuery("stellar.soroswap.quote", inputFor("stellar.soroswap.quote"), "owner-a", "es", disguised) as Record<string, unknown>;
  assert.equal(sanitized.error, "soroswap_quote_unavailable");
  assert.doesNotMatch(JSON.stringify(sanitized), /private_key/);
  const rateLimited = createDiscoveryQueries({ getCctpFujiToStellarFees: async () => { throw new Error("cctp_fee_http_429:secret-detail"); } });
  const rate = await executeWebReadQuery("circle.cctp.fees.read", {}, "owner-a", "es", rateLimited) as Record<string, unknown>;
  assert.equal(rate.error, "cctp_fee_http_429");
  assert.doesNotMatch(JSON.stringify(rate), /secret-detail/);
});

test("DeFindex positions ignore foreign wallet rows and retain per-vault unavailable data", async () => {
  const ownerAddress = "G".padEnd(56, "A");
  const foreignAddress = "G".padEnd(56, "B");
  const positionCalls: string[] = [];
  const wallet = (userId: string, address: string) => ({ id: `id-${userId}`, walletId: `id-${userId}`, userId, address, chainType: "stellar", network: "stellar:testnet", status: "active" as const, updatedAt: new Date("2026-01-01") });
  const queries = createDiscoveryQueries({
    listWallets: async userId => [wallet("owner-b", foreignAddress), wallet(userId, ownerAddress)],
    getDefindexPosition: async (address, asset) => {
      positionCalls.push(address);
      if (asset === "USDC") throw new Error("defindex_read_failed");
      return { asset, vault: DEFINDEX_TESTNET.xlm.vault, sharesAtomic: "0", shares: "0" };
    },
  });
  const result = await executeMcpReadQuery("stellar.defindex.position.read", {}, principal(), queries) as { status: string; address: string; positions: { asset: string; status: string; shares?: string }[]; transactionPrepared: boolean };
  assert.equal(result.status, "partial");
  assert.equal(result.address, ownerAddress);
  assert.deepEqual(positionCalls, [ownerAddress, ownerAddress]);
  assert.deepEqual(result.positions.map(item => [item.asset, item.status, item.shares ?? null]), [["XLM", "ok", "0"], ["USDC", "unavailable", null]]);
  assert.equal(result.transactionPrepared, false);
  await assert.rejects(runMcp("stellar.defindex.position.read", { address: foreignAddress }, principal(), queries));
  assert.equal(positionCalls.length, 2);
});

test("CCTP failed chain reads remain unknown instead of proving no trustline or a zero balance", async () => {
  const wallet = (chainType: string, network: string, address: string) => ({ id: `id-${chainType}`, walletId: `id-${chainType}`, userId: "owner-a", address, chainType, network, status: "active" as const, updatedAt: new Date("2026-01-01") });
  const queries = createDiscoveryQueries({
    listWallets: async () => [wallet("ethereum", "avalanche:fuji", collection), wallet("stellar", "stellar:testnet", "G".padEnd(56, "A"))],
    diagnoseEvmWallet: async () => { throw new Error("offline"); },
    getErc20Balance: async () => { throw new Error("offline"); },
    getStellarTestnetAccount: async (_address, signal) => { assert.ok(signal); throw new Error("offline"); },
  });
  const result = await executeMcpReadQuery("circle.cctp.readiness.read", {}, principal(), queries) as Record<string, unknown>;
  assert.equal(result.status, "partial");
  for (const key of ["sourceGasReady", "sourceUsdcBalance", "destinationGasReady", "destinationTrustlineReady"]) assert.equal(result[key], null, key);
  assert.deepEqual(result.errors, ["fuji_rpc_unavailable", "fuji_usdc_unavailable", "stellar_horizon_unavailable"]);
  assert.equal(result.transactionPrepared, false);
});

test("CCTP does not attribute a balance to Fuji after a contradictory chain identity", async () => {
  const queries = createDiscoveryQueries({
    listWallets: async () => [{ id: "evm", walletId: "evm", userId: "owner-a", address: collection, chainType: "ethereum", network: "avalanche:fuji", status: "active", updatedAt: new Date("2026-01-01") }],
    diagnoseEvmWallet: async () => { throw new Error("evm_chain_id_mismatch"); },
    getErc20Balance: async () => ({ balance: "1000", atomic: "1000000000", walletAddress: collection, tokenAddress: "0x1111111111111111111111111111111111111111", decimals: 6 }),
  });
  const result = await executeMcpReadQuery("circle.cctp.readiness.read", {}, principal(), queries) as Record<string, unknown>;
  assert.equal(result.sourceUsdcBalance, null);
  assert.equal(result.sourceGasReady, null);
  assert.deepEqual(result.errors, ["fuji_chain_id_mismatch"]);
  assert.equal(result.transactionPrepared, false);
});
