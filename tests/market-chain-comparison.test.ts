import assert from "node:assert/strict";
import test from "node:test";
import { compareChains } from "../app/market-data/defillama";
import type { ChainComparisonInput } from "../app/market-data/types";

const NOW = Date.parse("2026-09-30T06:30:00Z");
type ChainFixture = {
  name: string; tvl: number | null; gecko_id?: string | null; gasTokenGeckoId?: string | null;
  tokenSymbol?: string | null; cmcId?: string | null; chainId?: number | null;
};
const chain = (name: string, tvl: number, id: string | null, symbol: string | null, gas = id): ChainFixture => ({
  name, tvl, gecko_id: id, gasTokenGeckoId: gas, tokenSymbol: symbol, chainId: null,
});
const input = (overrides: Partial<ChainComparisonInput> = {}): ChainComparisonInput => ({
  sortBy: "tvl", limit: 10, locale: "es", ...overrides,
});

function providerFixture(chains: ChainFixture[], caps: Record<string, number | null> = {}) {
  const requests: URL[] = [];
  let now = NOW;
  const fetcher: typeof fetch = async resource => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    requests.push(url);
    if (url.hostname === "api.llama.fi" && url.pathname === "/v2/chains") return Response.json(chains);
    const ids = [...new Set(chains.flatMap(row => row.gecko_id ? [row.gecko_id] : []))];
    const symbolFor = (id: string) => chains.find(row => row.gecko_id === id)?.tokenSymbol ?? id;
    if (url.pathname.endsWith("/coins/list")) return Response.json(ids.map(id => ({ id, name: id, symbol: symbolFor(id), platforms: {} })));
    if (url.pathname.endsWith("/coins/markets")) return Response.json((url.searchParams.get("ids") ?? "").split(",").filter(Boolean).map(id => ({
      id, name: id, symbol: symbolFor(id), current_price: 1, market_cap: caps[id] ?? null, total_volume: 10,
      market_cap_rank: 1, price_change_percentage_24h: 1, price_change_percentage_7d_in_currency: 2,
      last_updated: new Date(now).toISOString(),
    })));
    if (url.pathname.includes("cryptocurrency/map")) return Response.json({ data: [], status: { error_code: 0 } });
    if (url.hostname === "coins.llama.fi") return Response.json({ coins: {} });
    throw new Error(`Unexpected mock endpoint: ${url.hostname}${url.pathname}`);
  };
  return { fetcher, requests, now: () => now, advance: (ms: number) => { now += ms; } };
}

test("Base has TVL and ETH gas but no fabricated token or capitalization", async () => {
  const fixture = providerFixture([chain("Base", 10, null, null, "ethereum")]);
  const result = await compareChains(input(), fixture);
  assert.equal(result.rows[0].tvl, 10);
  assert.equal(result.rows[0].gasTokenId, "ethereum");
  assert.equal(result.rows[0].associatedToken, null);
  assert.equal(result.rows[0].marketCap, null);
  assert.equal(result.rows[0].quoteStatus, "no_associated_token");
  assert.equal(result.tvlUpdatedAt, null);
  assert.equal(result.tvlFetchedAt, new Date(NOW).toISOString());
  assert.equal(result.dataScope, "mainnet_market_data");
  assert.equal(result.status, "ok");
  assert.equal(result.quotedChains, 0);
  assert.equal(result.unavailableChains, 0);
  assert.equal(fixture.requests.length, 1);
});

test("chain aliases are case insensitive and repeated aliases do not duplicate rows", async () => {
  const fixture = providerFixture([
    chain("BSC", 20, "binancecoin", "BNB"), chain("Avalanche", 10, "avalanche-2", "AVAX"),
    chain("Solana", 30, "solana", "SOL"), chain("Stellar", 5, "stellar", "XLM"), chain("Base", 15, null, null, "ethereum"),
  ], { binancecoin: 10, "avalanche-2": 20, solana: 30, stellar: 40 });
  const result = await compareChains(input({ chains: ["bnb", "BNB Chain", "bSc", "aVaLaNcHe", "Stellar", "BASE", "missing"] }), fixture);
  assert.deepEqual(result.rows.map(row => row.name), ["BSC", "Base", "Avalanche", "Stellar"]);
  assert.deepEqual(result.missingChains, ["missing"]);
  assert.equal(result.totalChains, 4);
  assert.equal(result.rows[0].marketCap, 10);
  assert.equal(result.rows[0].tvlSourceUrl, "https://defillama.com/chain/BSC");
});

test("market-cap ranking quotes every matching associated token before applying the limit", async () => {
  const fixture = providerFixture([
    chain("Ethereum", 1_000, "ethereum", "ETH"), chain("Solana", 1, "solana", "SOL"), chain("Base", 500, null, null, "ethereum"),
  ], { ethereum: 10, solana: 1_000 });
  const result = await compareChains(input({ sortBy: "marketCap", limit: 1 }), fixture);
  assert.equal(result.rows[0].name, "Solana");
  assert.equal(result.rows[0].marketCap, 1_000);
  assert.equal(result.totalChains, 3);
  const queried = fixture.requests.filter(url => url.pathname.endsWith("/coins/markets")).flatMap(url => (url.searchParams.get("ids") ?? "").split(","));
  assert.deepEqual(new Set(queried), new Set(["ethereum", "solana"]));
});

test("associated ARB remains separate from ETH gas and duplicate coin IDs are quoted once", async () => {
  const fixture = providerFixture([
    chain("Arbitrum", 30, "arbitrum", "ARB", "ethereum"), chain("Ethereum", 20, "ethereum", "ETH"),
    chain("Shared token network", 10, "arbitrum", "ARB", "ethereum"),
  ], { arbitrum: 12, ethereum: 100 });
  const result = await compareChains(input({ sortBy: "marketCap" }), fixture);
  const arb = result.rows.find(row => row.name === "Arbitrum")!;
  assert.equal(arb.associatedToken?.coingeckoId, "arbitrum");
  assert.equal(arb.gasTokenId, "ethereum");
  assert.equal(arb.marketCap, 12);
  const queried = fixture.requests.filter(url => url.pathname.endsWith("/coins/markets")).flatMap(url => (url.searchParams.get("ids") ?? "").split(","));
  assert.equal(queried.filter(id => id === "arbitrum").length, 1);
});

test("global rankings batch more than ten assets without quoting one chain per request", async () => {
  const chains = Array.from({ length: 23 }, (_, i) => chain(`Network ${i}`, 100 - i, `token-${i}`, `T${i}`));
  const caps = Object.fromEntries(chains.map((row, i) => [row.gecko_id!, i + 1]));
  const fixture = providerFixture(chains, caps);
  const result = await compareChains(input({ sortBy: "marketCap", limit: 2 }), fixture);
  assert.deepEqual(result.rows.map(row => row.name), ["Network 22", "Network 21"]);
  const requests = fixture.requests.filter(url => url.pathname.endsWith("/coins/markets"));
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => (url.searchParams.get("ids") ?? "").split(",").length <= 10));
  assert.equal(new Set(requests.flatMap(url => (url.searchParams.get("ids") ?? "").split(","))).size, 23);
});

test("TVL ranking only quotes the selected rows and never replaces missing capitalization with zero", async () => {
  const fixture = providerFixture([chain("Ethereum", 20, "ethereum", "ETH"), chain("Solana", 10, "solana", "SOL")]);
  const result = await compareChains(input({ limit: 1 }), fixture);
  assert.equal(result.rows[0].name, "Ethereum");
  assert.equal(result.rows[0].marketCap, null);
  const queried = fixture.requests.filter(url => url.pathname.endsWith("/coins/markets")).flatMap(url => (url.searchParams.get("ids") ?? "").split(","));
  assert.deepEqual(queried, ["ethereum"]);
});

test("TVL cache keeps its real fetch time for five minutes and then refreshes", async () => {
  const fixture = providerFixture([chain("Base", 10, null, null, "ethereum")]);
  const first = await compareChains(input(), fixture);
  fixture.advance(299_000);
  const cached = await compareChains(input(), fixture);
  assert.equal(first.tvlFromCache, false);
  assert.equal(cached.tvlFromCache, true);
  assert.equal(cached.tvlFetchedAt, first.tvlFetchedAt);
  assert.equal(cached.queriedAt, new Date(NOW + 299_000).toISOString());
  assert.equal(fixture.requests.length, 1);
  fixture.advance(2_000);
  const refreshed = await compareChains(input(), fixture);
  assert.equal(refreshed.tvlFromCache, false);
  assert.equal(refreshed.tvlFetchedAt, new Date(NOW + 301_000).toISOString());
  assert.equal(fixture.requests.length, 2);
});

test("malformed numerical TVL values fail closed with an error envelope", async () => {
  for (const tvl of [-1, "100", "Infinity"]) {
    const result = await compareChains(input(), { fetcher: async () => Response.json([{ name: "Base", tvl, gecko_id: null }]), now: () => NOW });
    assert.deepEqual(result.rows, []);
    assert.equal(result.error, "defillama_invalid_response");
  }
});

test("quota errors, invalid content and oversized responses are explicit and do not throw", async () => {
  const cases: Array<[() => Response, string]> = [
    [() => new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } }), "defillama_rate_limited"],
    [() => new Response("<html>unavailable</html>", { headers: { "Content-Type": "text/html" } }), "defillama_invalid_response"],
    [() => new Response("[]", { headers: { "Content-Type": "application/json", "Content-Length": String(2 * 1024 * 1024 + 1) } }), "defillama_response_too_large"],
    [() => new Response("{broken", { headers: { "Content-Type": "application/json" } }), "defillama_invalid_response"],
  ];
  for (const [response, expected] of cases) {
    const result = await compareChains(input(), { fetcher: async () => response(), now: () => NOW });
    assert.equal(result.error, expected);
    assert.deepEqual(result.rows, []);
  }
});

test("streamed bodies are bounded even when the provider omits Content-Length", async () => {
  const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(oversized); controller.close(); },
  }), { headers: { "Content-Type": "application/json" } });
  const result = await compareChains(input(), { fetcher, now: () => NOW });
  assert.equal(result.error, "defillama_response_too_large");
  assert.deepEqual(result.rows, []);
});

test("caller cancellation returns promptly even when the injected fetch ignores its signal", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const promise = compareChains(input(), { fetcher: () => new Promise<Response>(() => undefined), signal: controller.signal, now: () => NOW });
  controller.abort();
  const result = await promise;
  assert.equal(result.error, "market_request_aborted");
  assert.ok(Date.now() - started < 1_000);
});

test("stale market data stays visible as stale but does not enter current capitalization rankings", async () => {
  const fixture = providerFixture([chain("Solana", 10, "solana", "SOL")], { solana: 100 });
  const fetcher: typeof fetch = async (resource, init) => {
    const response = await fixture.fetcher(resource, init);
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    if (!url.pathname.endsWith("/coins/markets")) return response;
    const rows = await response.json() as Array<Record<string, unknown>>;
    return Response.json(rows.map(row => ({ ...row, last_updated: new Date(NOW - 600_000).toISOString() })));
  };
  const result = await compareChains(input({ sortBy: "marketCap" }), { fetcher, now: () => NOW });
  assert.equal(result.rows[0].quoteStatus, "stale");
  assert.equal(result.rows[0].marketCap, null);
  assert.equal(result.rows[0].marketSource?.marketCap, 100);
  assert.equal(result.rows[0].marketSource?.updatedAt, new Date(NOW - 600_000).toISOString());
});

test("per-token rate limits preserve TVL and the provider error without a fake capitalization", async () => {
  const fetcher: typeof fetch = async resource => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    if (url.hostname === "api.llama.fi") return Response.json([chain("Solana", 10, "solana", "SOL")]);
    return new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } });
  };
  const result = await compareChains(input(), { fetcher, now: () => NOW });
  assert.equal(result.rows[0].tvl, 10);
  assert.equal(result.rows[0].quoteStatus, "unavailable");
  assert.equal(result.rows[0].quoteError, "market_rate_limited");
  assert.equal(result.rows[0].marketCap, null);
  assert.equal(result.rows[0].marketSource, null);
  assert.equal(result.status, "partial");
  assert.equal(result.unavailableChains, 1);
});

test("global market-cap rankings expose unavailable chains omitted by the row limit", async () => {
  const fixture = providerFixture([
    chain("Ethereum", 10, "ethereum", "ETH"), chain("Solana", 100, "solana", "SOL"),
    chain("Base", 200, null, null, "ethereum"),
  ], { ethereum: 100, solana: null });
  const result = await compareChains(input({ sortBy: "marketCap", limit: 1 }), fixture);
  assert.deepEqual(result.rows.map(row => row.name), ["Ethereum"]);
  assert.equal(result.totalChains, 3);
  assert.equal(result.quotedChains, 1);
  assert.equal(result.unavailableChains, 1);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.failures, [{ chain: "Solana", status: "missing_market_cap" }]);
});

test("an explicitly reported zero capitalization is preserved separately from missing data", async () => {
  const fixture = providerFixture([chain("Ethereum", 10, "ethereum", "ETH"), chain("Solana", 20, "solana", "SOL")], { ethereum: 0, solana: null });
  const result = await compareChains(input({ sortBy: "marketCap" }), fixture);
  assert.equal(result.rows[0].name, "Ethereum");
  assert.equal(result.rows[0].marketCap, 0);
  assert.equal(result.rows[1].marketCap, null);
  assert.equal(result.quotedChains, 1);
  assert.equal(result.unavailableChains, 1);
  assert.equal(result.status, "partial");
});
