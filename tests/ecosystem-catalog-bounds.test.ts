import assert from "node:assert/strict";
import test from "node:test";
import {
  ECOSYSTEM_CATALOG_MAX_RESPONSE_BYTES,
  ECOSYSTEM_MAX_RESPONSE_BYTES,
  ECOSYSTEM_TIMEOUT_MS,
  getDefiLlamaYieldsRead,
  getLfjQuoteRead,
  getNftCollectionRead,
  getPredictionMarketsRead,
  getPredictionSectorRead,
} from "../app/connectors/avalanche-ecosystem";

const padding = "x".repeat(ECOSYSTEM_MAX_RESPONSE_BYTES + 1);
const json = (value: unknown, declaredLength?: number) => new Response(JSON.stringify(value), {
  headers: { "content-type": "application/json", ...(declaredLength ? { "content-length": String(declaredLength) } : {}) },
});

test("only existing large public catalogs accept valid responses above 512 KiB", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.ok(init?.signal);
    assert.equal(init.signal.aborted, false);
    if (String(input).includes("/protocols")) return json([
      { name: "Prediction", category: "Prediction Market", chains: ["Avalanche"], tvl: 10, metadata: padding },
    ]);
    if (String(input).includes("/pools")) return json({ data: [
      { chain: "Avalanche", project: "aave", symbol: "USDC", tvlUsd: 10, apy: 2, metadata: padding },
    ] });
    return json([{ id: "event", title: "Public market", metadata: padding, markets: [{ id: "market", active: true }] }]);
  };
  const [sector, yieldsRead, markets] = await Promise.all([
    getPredictionSectorRead(fetcher), getDefiLlamaYieldsRead(fetcher), getPredictionMarketsRead(fetcher),
  ]);
  assert.equal(sector.protocolCount, 1);
  assert.equal(sector.avalanche?.tvl, 10);
  assert.equal(yieldsRead.pools[0]?.symbol, "USDC");
  assert.equal(markets.markets[0]?.id, "market");
  assert.equal(requests.length, 3);
  assert.equal(ECOSYSTEM_TIMEOUT_MS, 10_000);
});

test("declared catalog responses over 32 MiB are canceled before consumption", async () => {
  let canceled = false;
  const fetcher: typeof fetch = async () => new Response(new ReadableStream({
    cancel() { canceled = true; },
  }), { headers: { "content-type": "application/json", "content-length": String(ECOSYSTEM_CATALOG_MAX_RESPONSE_BYTES + 1) } });
  await assert.rejects(getPredictionSectorRead(fetcher), /ecosystem_response_too_large/);
  assert.equal(canceled, true);
});

test("catalog streams enforce the 32 MiB limit without a content-length header", async () => {
  let canceled = false;
  let chunks = 0;
  const chunk = new Uint8Array(64 * 1024);
  const fetcher: typeof fetch = async () => new Response(new ReadableStream({
    pull(controller) { chunks += 1; controller.enqueue(chunk); },
    cancel() { canceled = true; },
  }), { headers: { "content-type": "application/json" } });
  await assert.rejects(getDefiLlamaYieldsRead(fetcher), /ecosystem_response_too_large/);
  assert.equal(canceled, true);
  assert.ok(chunks <= ECOSYSTEM_CATALOG_MAX_RESPONSE_BYTES / chunk.byteLength + 2);
});

test("NFT and quote providers retain the 512 KiB limit", async () => {
  let canceled = 0;
  const fetcher: typeof fetch = async () => new Response(new ReadableStream({
    cancel() { canceled += 1; },
  }), { headers: { "content-type": "application/json", "content-length": String(ECOSYSTEM_MAX_RESPONSE_BYTES + 1) } });
  await assert.rejects(getNftCollectionRead("0x1111111111111111111111111111111111111111", fetcher), /ecosystem_response_too_large/);
  await assert.rejects(getLfjQuoteRead({ amountIn: "1", assetIn: "AVAX", assetOut: "USDC" }, fetcher), /ecosystem_response_too_large/);
  assert.equal(canceled, 2);
});

test("large catalog permission does not bypass JSON, HTTP or deadline validation", async () => {
  await assert.rejects(getPredictionSectorRead(async () => new Response("html", { headers: { "content-type": "text/html" } })), /ecosystem_content_type_invalid/);
  await assert.rejects(getPredictionSectorRead(async () => new Response("{invalid", { headers: { "content-type": "application/json" } })), /ecosystem_json_invalid/);
  await assert.rejects(getPredictionSectorRead(async () => new Response("rate limit", { status: 429 })), /ecosystem_http_429/);
  await assert.rejects(getPredictionSectorRead(async () => { throw new DOMException("aborted", "AbortError"); }), /ecosystem_timeout/);
});

test("catalog row bounds accommodate measured public sizes while remaining finite", async () => {
  const protocol: { name: string; category: string; chains: string[]; tvl: number | null; chainTvls: null; url: null } = { name: "Other", category: "Dexes", chains: [], tvl: null, chainTvls: null, url: null };
  const protocols = Array.from({ length: 8_440 }, () => protocol);
  protocols[0] = { name: "Prediction", category: "Prediction Market", chains: ["Avalanche"], tvl: 20, chainTvls: null, url: null };
  const sector = await getPredictionSectorRead(async () => json(protocols));
  assert.equal(sector.protocolCount, 1);
  assert.equal(sector.totalPredictionTvl, 20);
  await assert.rejects(getPredictionSectorRead(async () => json(Array.from({ length: 20_001 }, () => protocol))), /ecosystem_defillama_protocols_invalid/);

  const pool = { chain: "Ethereum", project: "aave", symbol: "USDC", tvlUsd: 10, apy: 2, apyBase: null, apyReward: null, url: null };
  const pools = Array.from({ length: 16_975 }, () => pool);
  pools[0] = { ...pool, chain: "Avalanche" };
  const yieldRead = await getDefiLlamaYieldsRead(async () => json({ data: pools }));
  assert.equal(yieldRead.pools.length, 1);
  assert.equal(yieldRead.pools[0]?.apyBase, null);
  assert.equal(yieldRead.pools[0]?.apyReward, null);
  await assert.rejects(getDefiLlamaYieldsRead(async () => json({ data: Array.from({ length: 50_001 }, () => pool) })), /ecosystem_defillama_yields_invalid/);
});

test("prediction events validate measured market counts but expose only bounded summaries", async () => {
  const event = { id: "event", title: "Public event", markets: Array.from({ length: 315 }, (_, index) => ({ id: String(index), active: true })) };
  const result = await getPredictionMarketsRead(async () => json([event]));
  assert.equal(result.markets.length, 5);
  assert.equal(result.markets[0]?.id, "0");
  await assert.rejects(getPredictionMarketsRead(async () => json([{ ...event, markets: Array.from({ length: 1_001 }, () => ({ id: "market" })) }])), /ecosystem_polymarket_invalid/);
});

test("prediction TVL uses per-chain metrics without assigning global TVL to every network", async () => {
  const result = await getPredictionSectorRead(async () => json([
    { name: "Multichain", category: "Prediction Market", chains: ["Ethereum", "Avalanche"], tvl: 100, chainTvls: { Ethereum: 75, Avalanche: 25 } },
  ]));
  assert.equal(result.totalPredictionTvl, 100);
  assert.equal(result.avalanche?.tvl, 25);
  assert.equal(result.byChain.find(row => row.chain === "Ethereum")?.tvl, 75);
  assert.equal(result.status, "ok");
});

test("missing prediction and yield metrics remain null rather than becoming zero", async () => {
  const sector = await getPredictionSectorRead(async () => json([
    { name: "Unknown", category: "Prediction Market", chains: ["Avalanche"], tvl: null },
    { name: "No chain split", category: "Prediction Market", chains: ["Ethereum", "Solana"], tvl: 100 },
  ]));
  assert.equal(sector.totalPredictionTvl, null);
  assert.equal(sector.avalanche?.tvl, null);
  assert.equal(sector.byChain.find(row => row.chain === "Solana")?.tvl, null);
  assert.deepEqual(sector.missingTvlProtocols, ["Unknown"]);
  assert.equal(sector.status, "partial");

  const yieldsRead = await getDefiLlamaYieldsRead(async () => json({ data: [
    { chain: "Avalanche", project: "unknown", symbol: "UNKNOWN", tvlUsd: 10, apy: null, apyBase: null, apyReward: null },
    { chain: "Avalanche", project: "observed", symbol: "USDC", tvlUsd: 20, apy: 3 },
  ] }));
  assert.equal(yieldsRead.pools[0]?.symbol, "USDC");
  assert.equal(yieldsRead.pools[1]?.apy, null);
  assert.equal(yieldsRead.pools[1]?.apyBase, null);
  assert.equal(yieldsRead.pools[1]?.apyReward, null);
});
