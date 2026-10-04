import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import test from "node:test";
import { clearMarketTestCache } from "../app/market-data/cache";
import type { ChainComparison, MarketQuotes, MarketSearch } from "../app/market-data/types";
import { executeMcpReadQuery, executeWebReadQuery } from "../app/queries/adapters";
import { createMarketQueries, marketQueries } from "../app/queries/market";

const NOW = Date.parse("2026-10-04T21:00:00Z");
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
const inactivePay = { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 };
const activeAi = [
  { id: 101, name: "Alpha AI", symbol: "AI", slug: "alpha-ai", is_active: 1 },
  { id: 102, name: "Beta AI", symbol: "AI", slug: "beta-ai", is_active: 1 },
];
function fixture() {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (url.hostname === "api.llama.fi") {
      assert.equal(url.pathname, "/v2/chains");
      return json([{ name: "Base", chainId: 8453, tvl: 100, gecko_id: null }]);
    }
    if (url.hostname === "api.coingecko.com") {
      if (url.pathname.endsWith("/coins/list")) return json([]);
      assert.ok(url.pathname.endsWith("/coins/markets"));
      return json((url.searchParams.get("ids") ?? "").split(",").map(id => ({
        id, name: id, symbol: id === "stellar" ? "xlm" : "sol", current_price: 0,
        market_cap: null, last_updated: new Date(id === "solana" ? NOW - 300_001 : NOW).toISOString(),
      })));
    }
    assert.equal(url.hostname, "pro-api.coinmarketcap.com");
    if (url.pathname.endsWith("/map")) {
      const symbol = url.searchParams.get("symbol");
      return json({ data: symbol === "PAY" ? [inactivePay] : symbol === "AI" ? activeAi : [] });
    }
    assert.ok(url.pathname.endsWith("/info"), "Unresolved/inactive assets must not request a price");
    const slug = url.searchParams.get("slug");
    if (slug === "provider-outage") return json({ error: "fixture private provider detail" }, 503);
    return json({ status: { error_code: 400, error_message: `Invalid value for 'slug': '${slug}'` } }, 400);
  };
  return { fetcher, calls, definitions: createMarketQueries({ fetcher, now: () => NOW }) };
}
const auth = { token: "fixture-not-a-credential", clientId: "parity-fixture", scopes: ["agent:read"],
  extra: { subjectType: "user", userId: "owner-a" } };

test("real shared market search preserves absence, inactive evidence, ambiguity and outage in web and MCP", async () => {
  const { definitions, fetcher } = fixture();
  for (const asset of [{ query: "unknown-pilot-token" }, { query: "PAY" }, { query: "AI" }, { query: "provider-outage" }]) {
    clearMarketTestCache(fetcher);
    const mcp = await executeMcpReadQuery("search_market_assets", { asset }, auth, definitions) as MarketSearch;
    for (const locale of ["es", "en", "pt"] as const) {
      clearMarketTestCache(fetcher);
      assert.deepEqual(await executeWebReadQuery("offchain.market.search", { asset }, "owner-a", locale, definitions), mcp);
    }
    if (asset.query === "PAY") {
      assert.equal(mcp.status, "not_found");
      assert.equal(mcp.reason, "inactive");
      assert.deepEqual(mcp.candidates, []);
      assert.deepEqual(mcp.inactiveCandidates?.map(row => row.cmcId), [1758]);
    } else if (asset.query === "AI") {
      assert.equal(mcp.status, "ok");
      assert.deepEqual(mcp.candidates.map(row => row.cmcId), [101, 102]);
    } else {
      assert.equal(mcp.status, asset.query === "provider-outage" ? "unavailable" : "not_found");
      assert.deepEqual(mcp.candidates, []);
    }
    assert.doesNotMatch(JSON.stringify(mcp), /fixture private provider detail/);
  }
});

test("real shared quote batch keeps zero, null, stale time, inactive, ambiguous and absent results in both channels", async () => {
  const { definitions, fetcher, calls } = fixture();
  const input = { assets: [{ query: "XLM" }, { query: "SOL" }, { query: "PAY" }, { query: "AI" },
    { query: "unknown-pilot-token" }, { coingeckoId: "unknown-pilot-token" }, { query: "provider-outage" }] };
  clearMarketTestCache(fetcher);
  const mcp = await executeMcpReadQuery("get_market_quotes", input, auth, definitions) as MarketQuotes;
  for (const locale of ["es", "en", "pt"] as const) {
    clearMarketTestCache(fetcher);
    assert.deepEqual(await executeWebReadQuery("offchain.market.quote", input, "owner-a", locale, definitions), mcp);
  }
  assert.deepEqual(mcp.results.map(row => row.status), ["ok", "stale", "unavailable", "ambiguous", "not_found", "not_found", "unavailable"]);
  assert.equal(mcp.results[0].quote?.price, 0);
  assert.equal(mcp.results[0].quote?.marketCap, null);
  assert.equal(mcp.results[0].quote?.source, "CoinGecko");
  assert.equal(mcp.results[1].quote?.updatedAt, new Date(NOW - 300_001).toISOString());
  assert.equal(mcp.results[2].reason, "inactive");
  assert.deepEqual(mcp.results[2].inactiveCandidates?.map(row => row.cmcId), [1758]);
  assert.deepEqual(mcp.results[3].candidates?.map(row => row.cmcId), [101, 102]);
  for (const row of mcp.results.slice(2)) assert.equal(row.quote, undefined);
  assert.ok(calls.filter(url => url.pathname.endsWith("/coins/markets")).every(url => url.searchParams.get("ids") === "stellar,solana"));
  assert.equal(mcp.dataScope, "mainnet_market_data");
});

test("market injection keeps existing tool inputs/scopes and rejects source/owner selectors before provider I/O", async () => {
  const { definitions, calls } = fixture();
  assert.deepEqual(definitions.map(query => [query.id, query.toolName, query.scope, Object.keys(query.inputSchema.shape)]),
    marketQueries.map(query => [query.id, query.toolName, query.scope, Object.keys(query.inputSchema.shape)]));
  for (const query of definitions.slice(0, 2)) {
    const input = query.id === "offchain.market.search" ? { asset: { query: "XLM" } } : { assets: [{ query: "XLM" }] };
    await assert.rejects(async () => executeMcpReadQuery(query.toolName, input, undefined, definitions), /mcp_principal_required/);
    await assert.rejects(async () => executeMcpReadQuery(query.toolName, input, { ...auth, scopes: [] }, definitions), /mcp_scope_required/);
    for (const selectors of [{ userId: "owner-b" }, { fetcher: "https://example.invalid" }, { now: NOW }]) {
      await assert.rejects(executeWebReadQuery(query.id, { ...input, ...selectors }, "owner-a", "es", definitions));
      await assert.rejects(async () => executeMcpReadQuery(query.toolName, { ...input, ...selectors }, auth, definitions));
    }
  }
  assert.deepEqual(calls, []);
});

test("chain comparison shares the controlled source without inventing Base token capitalization", async () => {
  const { definitions, fetcher } = fixture();
  const input = { chains: ["Base"] };
  clearMarketTestCache(fetcher);
  const mcp = await executeMcpReadQuery("compare_chains", input, auth, definitions) as ChainComparison;
  clearMarketTestCache(fetcher);
  assert.deepEqual(await executeWebReadQuery("offchain.defillama.chains", input, "owner-a", "es", definitions), mcp);
  assert.equal(mcp.status, "ok");
  assert.equal(mcp.rows[0].tvl, 100);
  assert.equal(mcp.rows[0].associatedToken, null);
  assert.equal(mcp.rows[0].marketCap, null);
  assert.equal(mcp.rows[0].quoteStatus, "no_associated_token");
  assert.equal(mcp.tvlUpdatedAt, null);
});

test("inactive catalog evidence keeps a simultaneous provider error in both channels", async () => {
  const base = fixture();
  const fetcher: typeof fetch = async (input, init) => new URL(String(input)).hostname === "api.coingecko.com"
    ? json({ error: "private controlled error" }, 503) : base.fetcher(input, init);
  const definitions = createMarketQueries({ fetcher, now: () => NOW });
  for (const id of ["offchain.market.search", "offchain.market.quote"]) {
    const query = definitions.find(row => row.id === id)!;
    const input = id.endsWith("search") ? { asset: { query: "PAY" } } : { assets: [{ query: "PAY" }] };
    const mcp = await executeMcpReadQuery(query.toolName, input, auth, definitions);
    assert.deepEqual(await executeWebReadQuery(id, input, "owner-a", "es", definitions), mcp);
    const result = id.endsWith("search") ? mcp as MarketSearch : (mcp as MarketQuotes).results[0];
    assert.equal(result.reason, "inactive");
    assert.equal(result.error, "market_upstream_http_503");
    assert.deepEqual(result.inactiveCandidates?.map(row => row.cmcId), [1758]);
    assert.equal(result.status, id.endsWith("search") ? "not_found" : "unavailable");
    assert.doesNotMatch(JSON.stringify(result), /private controlled error/);
  }
});

test("request cancellation takes precedence over the programmatic market signal", async () => {
  const { fetcher, calls } = fixture();
  const definitions = createMarketQueries({ fetcher, now: () => NOW, signal: new AbortController().signal });
  const query = definitions.find(row => row.id === "offchain.market.search")!;
  const result = await query.execute({ asset: { query: "unknown-pilot-token" } },
    { userId: "owner-a", locale: "es", signal: AbortSignal.abort() }) as MarketSearch;
  assert.equal(result.status, "unavailable");
  assert.deepEqual(calls, []);
});
