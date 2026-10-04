// Next normally installs AsyncLocalStorage before its cache modules are loaded.
import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import test from "node:test";
import { clearMarketTestCache, publicMarketCache } from "../app/market-data/cache";
import { getMarketQuotes, searchMarketAssets } from "../app/market-data/service";

const NOW = Date.parse("2026-09-30T15:00:00Z");
const options = (fetcher: typeof fetch, now = () => NOW) => ({ fetcher, now });
const json = (value: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(value),
  { headers: { "content-type": "application/json", ...extra } });
const unavailable = () => new Response("unavailable", { status: 503 });
const cg = (id: string, symbol: string, patch: Record<string, unknown> = {}) => ({ id, symbol, name: id,
  current_price: 1.25, market_cap: 1_000, market_cap_rank: 7, total_volume: 500,
  price_change_percentage_24h: -2, price_change_percentage_7d_in_currency: 4,
  last_updated: new Date(NOW).toISOString(), ...patch });
const cmc = (id: number, symbol: string, name: string, patch: Record<string, unknown> = {}) => ({
  id, symbol, name, slug: name.toLowerCase(), cmc_rank: 10,
  quote: [{ symbol: "USD", price: 2, market_cap: 1_500, volume_24h: 20,
    percent_change_24h: -1, percent_change_7d: 3, last_updated: new Date(NOW).toISOString() }], ...patch,
});

test("quotes native aliases in one HTTP batch, with independent metrics and sources", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url.href);
    assert.equal(url.hostname, "api.coingecko.com");
    assert.equal(url.pathname, "/api/v3/coins/markets");
    assert.deepEqual(url.searchParams.get("ids")?.split(","), ["stellar", "solana", "avalanche-2", "binancecoin"]);
    return json([cg("stellar", "xlm"), cg("solana", "sol"), cg("avalanche-2", "avax"), cg("binancecoin", "bnb")]);
  };
  const response = await getMarketQuotes([{ query: "Stellar" }, { query: "sol" }, { query: "Avalanche" }, { query: "BNB" }], options(fetcher));
  assert.equal(calls.length, 1);
  assert.deepEqual(response.results.map(item => item.asset?.symbol), ["XLM", "SOL", "AVAX", "BNB"]);
  assert.ok(response.results.every(item => item.status === "ok" && item.quote?.source === "CoinGecko"));
  assert.equal(response.results[0].quote?.change24h, -2);
  assert.equal(response.dataScope, "mainnet_market_data");
});

test("ticker collisions return candidates without requesting any price", async () => {
  const fetcher: typeof fetch = async input => {
    assert.equal(new URL(String(input)).pathname, "/api/v3/coins/list");
    return json([{ id: "pepe", name: "Pepe", symbol: "pepe", platforms: {} },
      { id: "pepe-other", name: "Other Pepe", symbol: "pepe", platforms: {} }]);
  };
  const response = await getMarketQuotes([{ query: "pepe" }], options(fetcher));
  assert.equal(response.results[0].status, "ambiguous");
  assert.equal(response.results[0].candidates?.length, 2);
  assert.equal(response.results[0].quote, undefined);
});

test("a unique name and exact ID resolve catalog assets outside the canonical list", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "render-token", name: "Render", symbol: "rndr", platforms: {} }]);
    assert.equal(url.searchParams.get("ids"), "render-token");
    return json([cg("render-token", "rndr")]);
  };
  const response = await getMarketQuotes([{ query: "render" }, { coingeckoId: "render-token" }], options(fetcher));
  assert.ok(response.results.every(item => item.status === "ok" && item.asset?.coingeckoId === "render-token"));
});

test("malformed unrelated catalog rows do not disable indexed tokens", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([
      { id: "artificial-pepe-2", name: "Artificial Pepe", symbol: "", platforms: {} },
      { id: "uniswap", name: "Uniswap", symbol: "uni", platforms: {} },
    ]);
    return json([cg("uniswap", "uni")]);
  };
  const response = await getMarketQuotes([{ coingeckoId: "uniswap" }], options(fetcher));
  assert.equal(response.results[0].status, "ok");
  assert.equal(response.results[0].asset?.coingeckoId, "uniswap");
});

test("USDC on Solana preserves token identity and rejects a different contract", async () => {
  const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "usd-coin", name: "USDC", symbol: "usdc", platforms: { solana: mint } }]);
    if (url.pathname.endsWith("/map")) return json({ data: [] });
    if (url.pathname.endsWith("/info")) return json({ data: {} });
    return json([cg("usd-coin", "usdc")]);
  };
  const good = await getMarketQuotes([{ query: "USDC", network: "Solana", address: mint }], options(fetcher));
  assert.equal(good.results[0].status, "ok");
  assert.equal(good.results[0].asset?.symbol, "USDC");
  assert.equal(good.results[0].asset?.address, mint);
  const wrong = await getMarketQuotes([{ query: "USDC", network: "Solana", address: mint.toLowerCase() }], options(fetcher));
  assert.equal(wrong.results[0].status, "not_found");
});

test("Stellar classic assets require the exact code and issuer, never XLM substitution", async () => {
  const issuer = "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "aquarius", name: "Aquarius", symbol: "aqua",
      platforms: { stellar: `AQUA-${issuer}` } }]);
    return json([cg("aquarius", "aqua")]);
  };
  const good = await getMarketQuotes([{ query: "AQUA", network: "Stellar", issuer }], options(fetcher));
  assert.equal(good.results[0].status, "ok");
  assert.equal(good.results[0].asset?.issuer, issuer);
  assert.equal(good.results[0].asset?.symbol, "AQUA");
  const wrong = await getMarketQuotes([{ query: "XLM", network: "Stellar", issuer }], options(fetcher));
  assert.equal(wrong.results[0].status, "not_found");
});

test("conflicting explicit canonical provider IDs are rejected without upstream calls", async () => {
  const fetcher: typeof fetch = async () => { assert.fail("conflicting IDs must never fetch"); };
  const response = await getMarketQuotes([{ coingeckoId: "bitcoin", cmcId: 1027 }], options(fetcher));
  assert.equal(response.results[0].status, "not_found");
});

test("CoinMarketCap fallback queries a verified public ID and ignores same-symbol impostors", async () => {
  const requests: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); requests.push(url);
    if (url.hostname === "api.coingecko.com") return unavailable();
    assert.match(url.pathname, /^\/public-api\//);
    assert.equal(url.searchParams.get("id"), "512");
    return json({ data: [cmc(999, "XLM", "Impostor"), cmc(512, "XLM", "Stellar")], status: { error_code: 0 } });
  };
  const response = await getMarketQuotes([{ query: "XLM" }], options(fetcher));
  assert.equal(response.results[0].status, "ok");
  assert.equal(response.results[0].quote?.price, 2);
  assert.equal(response.results[0].quote?.source, "CoinMarketCap");
  assert.ok(requests.every(url => !url.href.includes("trial-pro-api")));
});

test("CoinMarketCap fallback also batches multiple verified IDs in one request", async () => {
  let cmcRequests = 0;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "api.coingecko.com") return unavailable();
    assert.equal(url.hostname, "pro-api.coinmarketcap.com");
    cmcRequests++;
    assert.deepEqual(url.searchParams.get("id")?.split(","), ["512", "5426", "5805"]);
    return json({ data: [cmc(512, "XLM", "Stellar"), cmc(5426, "SOL", "Solana"), cmc(5805, "AVAX", "Avalanche")] });
  };
  const response = await getMarketQuotes([{ query: "XLM" }, { query: "SOL" }, { query: "AVAX" }], options(fetcher));
  assert.equal(cmcRequests, 1);
  assert.ok(response.results.every(item => item.status === "ok" && item.quote?.source === "CoinMarketCap"));
});

test("explicit provider IDs for a catalog token must describe the same identity", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "reserve-rights-token", name: "Reserve Rights", symbol: "rsr", platforms: {} }]);
    assert.ok(url.pathname.endsWith("/info"));
    return json({ data: { "99": { id: 99, name: "Another RSR", symbol: "RSR" } } });
  };
  const response = await getMarketQuotes([{ coingeckoId: "reserve-rights-token", cmcId: 99 }], options(fetcher));
  assert.equal(response.results[0].status, "not_found");
});

test("catalog network lookup accepts an exact EVM address ignoring case and Soroban contract without issuer", async () => {
  const address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const contract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([
      { id: "usd-coin", name: "USDC", symbol: "usdc", platforms: { ethereum: address } },
      { id: "soroban-coin", name: "Soroban Coin", symbol: "scoin", platforms: { stellar: contract } },
    ]);
    return json([cg("usd-coin", "usdc"), cg("soroban-coin", "scoin")]);
  };
  const response = await getMarketQuotes([
    { network: "Ethereum", address: address.toUpperCase().replace("0X", "0x") },
    { network: "Stellar", address: contract },
  ], options(fetcher));
  assert.ok(response.results.every(item => item.status === "ok"));
  assert.equal(response.results[0].asset?.coingeckoId, "usd-coin");
  assert.equal(response.results[1].asset?.issuer, null);
});

test("fallback for a discovered token requires a unique matching name or contract", async () => {
  let quotedCmc = false;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "reserve-rights-token", name: "Reserve Rights", symbol: "rsr", platforms: {} }]);
    if (url.pathname.endsWith("/map")) return json({ data: [{ id: 99, name: "Wrong Asset", symbol: "RSR" }] });
    if (url.pathname.includes("quotes/latest")) { quotedCmc = true; return json({ data: [cmc(99, "RSR", "Wrong Asset")] }); }
    return unavailable();
  };
  const response = await getMarketQuotes([{ query: "RSR" }], options(fetcher));
  assert.equal(response.results[0].status, "unavailable");
  assert.equal(quotedCmc, false);
});

test("DefiLlama is a labeled last price fallback; low confidence is unavailable", async () => {
  const makeFetcher = (confidence: number): typeof fetch => async input => {
    const url = new URL(String(input));
    if (url.hostname !== "coins.llama.fi") return unavailable();
    assert.equal(decodeURIComponent(url.pathname), "/prices/current/coingecko:solana");
    return json({ coins: { "coingecko:solana": { symbol: "SOL", price: 120, timestamp: NOW / 1_000, confidence } } });
  };
  const valid = await getMarketQuotes([{ query: "SOL" }], options(makeFetcher(0.9)));
  assert.equal(valid.results[0].status, "ok");
  assert.equal(valid.results[0].quote?.source, "DefiLlama");
  assert.equal(valid.results[0].quote?.marketCap, null);
  const low = await getMarketQuotes([{ query: "SOL" }], options(makeFetcher(0.79)));
  assert.equal(low.results[0].status, "unavailable");
  assert.equal(low.results[0].quote, undefined);
});

test("old prices are stale, and future or negative metrics are not presented as quotes", async () => {
  const fetcherFor = (patch: Record<string, unknown>): typeof fetch => async input => {
    return new URL(String(input)).hostname === "api.coingecko.com" ? json([cg("stellar", "xlm", patch)]) : unavailable();
  };
  const old = await getMarketQuotes([{ query: "XLM" }], options(fetcherFor({ last_updated: new Date(NOW - 300_001).toISOString() })));
  assert.equal(old.results[0].status, "stale");
  assert.equal(old.results[0].quote?.updatedAt, new Date(NOW - 300_001).toISOString());
  const future = await getMarketQuotes([{ query: "XLM" }], options(fetcherFor({ last_updated: new Date(NOW + 61_000).toISOString() })));
  assert.equal(future.results[0].status, "unavailable");
  const invalid = await getMarketQuotes([{ query: "XLM" }], options(fetcherFor({ market_cap: -1 })));
  assert.equal(invalid.results[0].status, "unavailable");
});

test("one malformed row does not hide valid quotes in the same provider batch", async () => {
  const fetcher: typeof fetch = async input => new URL(String(input)).hostname === "api.coingecko.com"
    ? json([cg("stellar", "xlm"), cg("solana", "sol", { current_price: null })]) : unavailable();
  const response = await getMarketQuotes([{ query: "XLM" }, { query: "SOL" }], options(fetcher));
  assert.deepEqual(response.results.map(item => item.status), ["ok", "unavailable"]);
});

test("successful empty catalogs mean not_found, provider failures mean unavailable", async () => {
  const empty: typeof fetch = async input => {
    const url = new URL(String(input));
    return url.hostname === "api.coingecko.com" ? json([]) : json({ data: url.pathname.endsWith("/info") ? {} : [] });
  };
  const missing = await searchMarketAssets({ query: "unlisted-token" }, 10, options(empty));
  assert.equal(missing.status, "not_found");
  const failure: typeof fetch = async () => new Response("quota", { status: 429 });
  const unavailableResult = await searchMarketAssets({ query: "unlisted-token" }, 10, options(failure));
  assert.equal(unavailableResult.status, "unavailable");
  assert.equal(unavailableResult.error, "market_rate_limited");
});

test("an arbitrary CoinMarketCap ID uses official V2 metadata and verifies its returned ID", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/map")) {
      assert.equal(url.searchParams.get("symbol"), "UNI");
      return json({ data: [{ id: 7083, name: "Uniswap", symbol: "UNI", slug: "uniswap", is_active: 1 }] });
    }
    assert.equal(url.searchParams.get("id"), "7083");
    if (url.pathname.endsWith("/info")) return json({ data: { "7083": {
      id: 7083, name: "Uniswap", symbol: "UNI", slug: "uniswap",
      platform: { id: "1027", name: "Ethereum", slug: "ethereum", token_address: "0x123" },
    } } });
    assert.ok(url.pathname.endsWith("/quotes/latest"));
    return json({ data: [cmc(7083, "UNI", "Uniswap")] });
  };
  const result = await getMarketQuotes([{ cmcId: 7083 }], options(fetcher));
  assert.equal(result.results[0].status, "ok");
  assert.equal(result.results[0].asset?.cmcId, 7083);
  assert.equal(result.results[0].quote?.source, "CoinMarketCap");
});

test("a short token name falls back to exact CMC metadata rather than being mistaken for a ticker", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "api.coingecko.com") return unavailable();
    if (url.pathname.endsWith("/map")) {
      const symbol = url.searchParams.get("symbol");
      assert.ok(symbol === "UNISWAP" || symbol === "UNI");
      return json({ data: symbol === "UNI" ? [{ id: 7083, name: "Uniswap", symbol: "UNI", slug: "uniswap", is_active: 1 }] : [] });
    }
    if (url.pathname.endsWith("/info")) {
      assert.equal(url.searchParams.get("slug"), "uniswap");
      return json({ data: { "7083": { id: 7083, name: "Uniswap", symbol: "UNI", slug: "uniswap" } } });
    }
    assert.equal(url.searchParams.get("id"), "7083");
    return json({ data: [cmc(7083, "UNI", "Uniswap")] });
  };
  const response = await getMarketQuotes([{ query: "Uniswap" }], options(fetcher));
  assert.equal(response.results[0].status, "ok");
  assert.equal(response.results[0].asset?.cmcId, 7083);
  assert.equal(response.results[0].quote?.source, "CoinMarketCap");
});

test("a generic CMC no-data HTTP 400 for an ID is unavailable without evidence of absence", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ status: { error_code: 400, error_message: "No data found" } }),
    { status: 400, headers: { "content-type": "application/json" } });
  const response = await getMarketQuotes([{ cmcId: 99999999 }], options(fetcher));
  assert.equal(response.results[0].status, "unavailable");
  assert.equal(response.results[0].error, "market_upstream_http_400");
});

test("inactive symbol identities stay cached as metadata without falling back to a slug or price", async () => {
  let time = NOW; let mapReads = 0;
  const retired = { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 };
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([]);
    assert.ok(url.pathname.endsWith("/map")); mapReads++;
    return json({ data: [retired] });
  };
  const search = () => searchMarketAssets({ query: "PAY" }, 10, options(fetcher, () => time));
  const first = await search();
  assert.equal(first.status, "not_found");
  assert.equal(first.reason, "inactive");
  assert.deepEqual(first.candidates, []);
  assert.equal(first.inactiveCandidates?.[0].cmcId, 1758);
  time += 86_399_000;
  const cached = await search();
  assert.equal(cached.reason, "inactive"); assert.equal(cached.fromCache, true);
  assert.equal(cached.fetchedAt, first.fetchedAt); assert.equal(mapReads, 1);
  time += 2_000;
  await search(); assert.equal(mapReads, 2);
});

test("activity lookup verifies the metadata ID among same-symbol active impostors", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/info")) return json({ data: {
      "1758": { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx" },
    } });
    assert.ok(url.pathname.endsWith("/map"));
    return json({ data: [
      { id: 901, name: "Active Pay", symbol: "PAY", slug: "active-pay", is_active: 1 },
      { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 },
    ] });
  };
  const result = (await getMarketQuotes([{ cmcId: 1758 }], options(fetcher))).results[0];
  assert.equal(result.reason, "inactive"); assert.equal(result.status, "unavailable");
  assert.deepEqual(result.inactiveCandidates?.map(coin => coin.cmcId), [1758]);
  assert.equal(result.quote, undefined);
});

test("inactive CMC evidence preserves a CoinGecko failure without asserting global absence", async () => {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "api.coingecko.com") return new Response("quota", { status: 429 });
    assert.ok(url.pathname.endsWith("/map"));
    return json({ data: [{ id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 }] });
  };
  const search = await searchMarketAssets({ query: "PAY" }, 10, options(fetcher));
  assert.equal(search.reason, "inactive"); assert.equal(search.error, "market_rate_limited");
  assert.equal(search.inactiveCandidates?.[0].sourceUrl, "https://coinmarketcap.com/currencies/tenx/");
  const result = (await getMarketQuotes([{ query: "PAY" }], options(fetcher))).results[0];
  assert.equal(result.status, "unavailable"); assert.equal(result.error, "market_rate_limited");
  assert.equal(result.quote, undefined);
});

test("an inactive CMC result with a failed CoinGecko read does not cache the aggregate failure", async () => {
  let recovering = false; let catalogReads = 0; let mapReads = 0;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) {
      catalogReads++;
      return recovering ? json([{ id: "tenx", name: "TenX", symbol: "pay", platforms: {} }]) : unavailable();
    }
    if (url.pathname.endsWith("/map")) {
      mapReads++;
      return json({ data: [{ id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 }] });
    }
    assert.ok(url.pathname.endsWith("/coins/markets")); return json([cg("tenx", "pay")]);
  };
  const first = await searchMarketAssets({ query: "PAY" }, 10, options(fetcher));
  assert.equal(first.reason, "inactive"); assert.equal(first.error, "market_upstream_http_503");
  assert.equal(first.fromCache, false);
  recovering = true;
  const second = await searchMarketAssets({ query: "PAY" }, 10, options(fetcher));
  assert.equal(second.status, "ok"); assert.equal(second.reason, undefined);
  assert.equal(second.fromCache, false); assert.equal(second.candidates[0].coingeckoId, "tenx");
  assert.equal(catalogReads, 2); assert.equal(mapReads, 1);
  const quote = (await getMarketQuotes([{ query: "PAY" }], options(fetcher))).results[0];
  assert.equal(quote.status, "ok"); assert.equal(quote.quote?.source, "CoinGecko");
});

test("malformed activity metadata cannot quote and a corrected map retries immediately", async () => {
  let recovering = false; let reads = 0;
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/info")) return json({ data: { "7083": { id: 7083, name: "Uniswap", symbol: "UNI", slug: "uniswap" } } });
    if (url.pathname.endsWith("/map")) {
      reads++;
      return json({ data: [{ id: 7083, name: "Uniswap", symbol: "UNI", ...(recovering ? { is_active: 1 } : {}) }] });
    }
    assert.ok(recovering); return json({ data: [cmc(7083, "UNI", "Uniswap")] });
  };
  const first = (await getMarketQuotes([{ cmcId: 7083 }], options(fetcher))).results[0];
  assert.equal(first.status, "unavailable"); assert.equal(first.quote, undefined);
  recovering = true;
  const second = (await getMarketQuotes([{ cmcId: 7083 }], options(fetcher))).results[0];
  assert.equal(second.status, "ok"); assert.equal(reads, 2);
});

test("explicit provider IDs preserve the exact contract and network while classifying inactivity", async () => {
  const address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const other = "0x1234567890123456789012345678901234567890";
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "tenx", name: "TenX", symbol: "pay", platforms: { ethereum: address } }]);
    if (url.pathname.endsWith("/info")) return json({ data: { "1758": {
      id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", contract_address: [
        { contract_address: other, platform: { name: "Solana", coin: { slug: "solana" } } },
        { contract_address: address, platform: { name: "Ethereum", coin: { slug: "ethereum" } } },
      ],
    } } });
    assert.ok(url.pathname.endsWith("/map"));
    return json({ data: [{ id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 }] });
  };
  const result = (await getMarketQuotes([{ coingeckoId: "tenx", cmcId: 1758, network: "Ethereum", address }], options(fetcher))).results[0];
  assert.equal(result.status, "unavailable"); assert.equal(result.reason, "inactive");
  assert.deepEqual(result.inactiveCandidates?.map(coin => [coin.network, coin.address]), [["ethereum", address]]);
  assert.equal(result.quote, undefined);
});

test("shared Next Data Cache never accepts an envelope older than the requested TTL", async () => {
  const globalState = globalThis as typeof globalThis & { __incrementalCache?: unknown };
  const original = globalState.__incrementalCache;
  let reads = 0; let loads = 0;
  globalState.__incrementalCache = {
    generateCacheKey: async (key: string) => key,
    get: async () => { reads++; return { value: { kind: "FETCH", data: { body: JSON.stringify({
      value: "old", cachedAt: NOW - 61_000, generation: "cached-public-generation",
    }) } }, isStale: false }; },
    set: async () => undefined,
  };
  try {
    const cached = await publicMarketCache("ttl-test", 60, async () => { loads++; return "fresh"; }, { now: () => NOW });
    assert.equal(cached.value, "fresh");
    assert.equal(cached.fromCache, false);
    assert.equal(reads, 1);
    assert.equal(loads, 1);
  } finally { globalState.__incrementalCache = original; clearMarketTestCache(); }
});

test("shared cache changes buckets at expiry and reports real cache hits", async () => {
  const globalState = globalThis as typeof globalThis & { __incrementalCache?: unknown };
  const original = globalState.__incrementalCache;
  const entries = new Map<string, unknown>(); let time = NOW; let loads = 0;
  globalState.__incrementalCache = {
    generateCacheKey: async (key: string) => key,
    get: async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => { entries.set(key, value); },
  };
  try {
    const loader = async () => ++loads;
    const first = await publicMarketCache("bucket-test", 60, loader, { now: () => time });
    const again = await publicMarketCache("bucket-test", 60, loader, { now: () => time });
    time += 61_000;
    const renewed = await publicMarketCache("bucket-test", 60, loader, { now: () => time });
    assert.deepEqual([first.value, again.value, renewed.value], [1, 1, 2]);
    assert.deepEqual([first.fromCache, again.fromCache, renewed.fromCache], [false, true, false]);
  } finally { globalState.__incrementalCache = original; clearMarketTestCache(); }
});

test("the large catalog is shared through bounded revision shards across cold processes", async () => {
  const globalState = globalThis as typeof globalThis & { __incrementalCache?: unknown };
  const original = globalState.__incrementalCache; const originalFetch = globalThis.fetch;
  const entries = new Map<string, { data: { body: string } }>(); let catalogReads = 0;
  const coins = Array.from({ length: 8_000 }, (_, index) => ({ id: `indexed-token-${index}`,
    name: `Token ${index} ${"x".repeat(150)}`, symbol: `tok${index}`, platforms: {} }));
  globalState.__incrementalCache = {
    generateCacheKey: async (key: string) => key,
    get: async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
    set: async (key: string, value: { data: { body: string } }) => { entries.set(key, value); },
  };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/coins/list")) { catalogReads++; return json(coins); }
    assert.ok(url.pathname.endsWith("/coins/markets"));
    return json(url.searchParams.get("ids")!.split(",").map(id => cg(id, `tok${id.split("-").at(-1)}`)));
  };
  try {
    clearMarketTestCache();
    const first = await getMarketQuotes([{ coingeckoId: "indexed-token-7999" }], { now: () => NOW });
    clearMarketTestCache(); // Another instance has no process catalog; shared cache survives.
    const second = await getMarketQuotes([{ coingeckoId: "indexed-token-7998" }], { now: () => NOW });
    assert.equal(first.results[0].status, "ok"); assert.equal(second.results[0].status, "ok");
    assert.equal(catalogReads, 1);
    const shards = [...entries.entries()].filter(([key]) => key.includes("cg:catalog:shard:"));
    assert.ok(shards.length >= 2);
    assert.ok(shards.every(([, entry]) => Buffer.byteLength(entry.data.body, "utf8") < 2 * 1024 * 1024));
    const revisions = new Set(shards.map(([, entry]) => JSON.parse(entry.data.body).value.revision));
    assert.equal(revisions.size, 1);
  } finally { globalState.__incrementalCache = original; globalThis.fetch = originalFetch; clearMarketTestCache(); }
});

test("public quotes cache for sixty seconds and custom fetchers never share cache values", async () => {
  let time = NOW; let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; return json([cg("stellar", "xlm", { last_updated: new Date(time).toISOString() })]); };
  clearMarketTestCache(fetcher);
  const first = await getMarketQuotes([{ query: "XLM" }], options(fetcher, () => time));
  const repeated = await getMarketQuotes([{ query: "XLM" }], options(fetcher, () => time));
  assert.equal(first.results[0].quote?.fromCache, false);
  assert.equal(repeated.results[0].quote?.fromCache, true);
  assert.equal(requests, 1);
  time += 61_000;
  await getMarketQuotes([{ query: "XLM" }], options(fetcher, () => time));
  assert.equal(requests, 2);
  const other: typeof fetch = async () => json([cg("stellar", "xlm", { current_price: 99 })]);
  const isolated = await getMarketQuotes([{ query: "XLM" }], options(other));
  assert.equal(isolated.results[0].quote?.price, 99);
});

test("fixed hosts, redirect rejection, response bounds, and cancellation are enforced", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, "api.coingecko.com");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    assert.ok(init?.signal);
    return json([cg("stellar", "xlm")]);
  };
  await getMarketQuotes([{ query: "XLM" }], options(fetcher));
  const controller = new AbortController(); controller.abort();
  const canceled = await getMarketQuotes([{ query: "SOL" }], { ...options(fetcher), signal: controller.signal });
  assert.equal(canceled.results[0].status, "unavailable");
  const oversized: typeof fetch = async () => json([], { "content-length": String(21 * 1024 * 1024) });
  const bounded = await searchMarketAssets({ query: "unlisted-token" }, 10, options(oversized));
  assert.equal(bounded.status, "unavailable");
  assert.equal(bounded.error, "market_response_too_large");
  await assert.rejects(getMarketQuotes([{ address: "0x123" }], options(fetcher)), /contract_network_required|asset_identity_required/);
});
