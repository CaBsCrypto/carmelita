import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import test from "node:test";
import { getMarketQuotes, searchMarketAssets } from "../app/market-data/service";

// Public metadata fixtures only. Every provider call is intercepted in memory.
const NOW = Date.parse("2026-10-04T21:00:00Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const fail = (status = 503) => new Response("fixture upstream unavailable", { status });
const options = (fetcher: typeof fetch, now = () => NOW) => ({ fetcher, now });
const cgQuote = (id: string, symbol: string, patch: Record<string, unknown> = {}) => ({
  id, symbol, name: id, current_price: 1, last_updated: new Date(NOW).toISOString(), ...patch,
});
const cmcQuote = (id: number, symbol: string, name: string) => ({
  id, symbol, name, slug: name.toLowerCase(), quote: [{ symbol: "USD", price: 1,
    last_updated: new Date(NOW).toISOString() }],
});
function controlled(handler: (url: URL) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "omit");
    assert.ok(["api.coingecko.com", "pro-api.coinmarketcap.com", "coins.llama.fi"].includes(url.hostname));
    if (url.hostname === "pro-api.coinmarketcap.com") assert.match(url.pathname, /^\/public-api\//);
    return handler(url);
  };
}

test("only an exact valid singleton CMC public-info slug absence becomes not_found", async t => {
  const slug = "unknown-pilot-token";
  const cases = [
    { label: "provider echoed validated slug", status: 400, code: 400, message: `Invalid value for 'slug': '${slug}'`, expected: "not_found" },
    { label: "different echoed slug", status: 400, code: 400, message: "Invalid value for 'slug': 'another-token'", expected: "unavailable" },
    { label: "unexpected400", status: 400, code: 400, message: "Invalid value for 'aux': 'bad'", expected: "unavailable" },
    { label: "wrong provider error code", status: 400, code: 1002, message: `Invalid value for 'slug': '${slug}'`, expected: "unavailable" },
    { label: "401 is unavailable", status: 401, code: 400, message: `Invalid value for 'slug': '${slug}'`, expected: "unavailable" },
    { label: "429 is unavailable", status: 429, code: 400, message: `Invalid value for 'slug': '${slug}'`, expected: "unavailable" },
    { label: "503 is unavailable", status: 503, code: 400, message: `Invalid value for 'slug': '${slug}'`, expected: "unavailable" },
  ];
  for (const entry of cases) await t.test(entry.label, async () => {
    let metadataCalls = 0;
    const fetcher = controlled(url => {
      if (url.hostname === "api.coingecko.com") return json([]);
      assert.equal(url.pathname, "/public-api/v2/cryptocurrency/info");
      assert.equal(url.searchParams.get("slug"), slug);
      metadataCalls++;
      return json({ status: { error_code: entry.code, error_message: entry.message } }, entry.status);
    });
    const result = await searchMarketAssets({ query: slug }, 10, options(fetcher));
    assert.equal(result.status, entry.expected);
    assert.deepEqual(result.candidates, []);
    if (entry.status === 429) assert.equal(result.error, "market_rate_limited");
    assert.equal(metadataCalls, 1);
  });
});

test("an echoed400 for a syntactically invalid slug is an outage, not absence", async () => {
  const fetcher = controlled(url => url.hostname === "api.coingecko.com" ? json([])
    : json({ status: { error_code: 400, error_message: `Invalid value for 'slug': '${url.searchParams.get("slug")}'` } }, 400));
  const result = await searchMarketAssets({ query: "pilot token?!" }, 10, options(fetcher));
  assert.equal(result.status, "unavailable");
  assert.equal(result.error, "market_upstream_http_400");
});

test("provider timeout stays unavailable without an invented candidate", async () => {
  const fetcher = controlled(url => {
    if (url.hostname === "api.coingecko.com") return json([]);
    throw new DOMException("controlled timeout", "TimeoutError");
  });
  const result = await searchMarketAssets({ query: "unknown-pilot-token" }, 10, options(fetcher));
  assert.equal(result.status, "unavailable");
  assert.equal(result.error, "market_timeout");
  assert.deepEqual(result.candidates, []);
});

const inactivePay = [
  { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_active: 0 },
  { id: 17978, name: "PayBolt", symbol: "PAY", slug: "paybolt", is_active: 0 },
  { id: 19749, name: "PocketPay", symbol: "PAY", slug: "pocketpay-finance", is_active: 0 },
];
test("PAY returns an inactive explanation and never requests an inactive quote", async () => {
  const fetcher = controlled(url => {
    if (url.hostname === "api.coingecko.com") return json([]);
    if (url.pathname.endsWith("/map")) return json({ data: inactivePay });
    if (url.pathname.endsWith("/info")) return json({ status: { error_code: 400,
      error_message: "Invalid value for 'slug': 'pay'" } }, 400);
    assert.fail("an inactive identity must not request a price");
  });
  const search = await searchMarketAssets({ query: "pAy" }, 10, options(fetcher));
  assert.equal(search.status, "not_found");
  assert.equal((search as { reason?: string }).reason, "inactive");
  assert.deepEqual(search.candidates, []);
  assert.deepEqual((search as { inactiveCandidates?: Array<{ cmcId: number }> }).inactiveCandidates?.map(row => row.cmcId).sort((a,b) => a-b), [1758, 17978, 19749]);
  const quote = (await getMarketQuotes([{ query: "pAy" }], options(fetcher))).results[0];
  assert.equal(quote.status, "unavailable");
  assert.equal((quote as { reason?: string }).reason, "inactive");
  assert.equal(quote.quote, undefined);
});

test("metadata without is_active cannot reactivate TenX by exact name or CMC ID", async t => {
  for (const request of [{ query: "TenX" }, { cmcId: 1758 }]) await t.test(JSON.stringify(request), async () => {
    let verifiedPay = false;
    const fetcher = controlled(url => {
      if (url.hostname === "api.coingecko.com") return json([]);
      if (url.pathname.endsWith("/info")) return json({ data: { "1758": { id: 1758, name: "TenX", symbol: "PAY", slug: "tenx", is_hidden: 0 } } });
      if (url.pathname.endsWith("/map")) {
        assert.ok(["TENX", "PAY"].includes(url.searchParams.get("symbol") ?? ""));
        if (url.searchParams.get("symbol") === "PAY") verifiedPay = true;
        return json({ data: url.searchParams.get("symbol") === "PAY" ? inactivePay : [] });
      }
      assert.fail("inactive metadata must never reach quotes/latest");
    });
    const result = (await getMarketQuotes([request], options(fetcher))).results[0];
    assert.equal(result.status, "unavailable");
    assert.equal((result as { reason?: string }).reason, "inactive");
    assert.equal(result.quote, undefined);
    assert.equal(verifiedPay, true);
  });
});

test("AI preserves two active identities without choosing or quoting an inactive third", async () => {
  const fetcher = controlled(url => {
    if (url.hostname === "api.coingecko.com") return json([]);
    assert.ok(url.pathname.endsWith("/map"));
    return json({ data: [
      { id: 101, name: "Alpha AI", symbol: "AI", slug: "alpha-ai", is_active: 1 },
      { id: 102, name: "Beta AI", symbol: "AI", slug: "beta-ai", is_active: 1 },
      { id: 103, name: "Retired AI", symbol: "AI", slug: "retired-ai", is_active: 0 },
    ] });
  });
  const result = (await getMarketQuotes([{ query: "AI" }], options(fetcher))).results[0];
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates?.map(row => row.cmcId), [101, 102]);
  assert.equal(result.asset, undefined);
  assert.equal(result.quote, undefined);
});

test("a valid unknown CoinGecko ID remains not_found without ticker substitution", async () => {
  const fetcher = controlled(url => {
    assert.equal(url.hostname, "api.coingecko.com");
    assert.ok(url.pathname.endsWith("/coins/list"));
    return json([{ id: "other-token", symbol: "pilot", name: "Pilot", platforms: {} }]);
  });
  const result = (await getMarketQuotes([{ coingeckoId: "unknown-pilot-token" }], options(fetcher))).results[0];
  assert.equal(result.status, "not_found");
  assert.equal(result.quote, undefined);
});

test("ticker/name case resolves the exact Solana USDC mint; partial identity mismatch remains unavailable", async () => {
  const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const fetcher = controlled(url => {
    if (url.pathname.endsWith("/coins/list")) return json([{ id: "usd-coin", name: "USDC", symbol: "usdc", platforms: { solana: mint } }]);
    if (url.pathname.endsWith("/coins/markets")) return json([
      cgQuote("usd-coin", "usdc", { market_cap: 0 }), cgQuote("solana", "impostor"),
    ]);
    if (url.pathname.endsWith("/map")) return json({ data: [] });
    if (url.pathname.endsWith("/info")) return json({ data: {} });
    return fail();
  });
  const result = await getMarketQuotes([{ query: "uSd CoIn", network: "sOlAnA", address: mint }, { query: "SoLaNa" }], options(fetcher));
  assert.deepEqual(result.results.map(row => row.status), ["ok", "unavailable"]);
  assert.equal(result.results[0].asset?.address, mint);
  assert.equal(result.results[0].quote?.marketCap, 0);
  assert.equal(result.results[0].quote?.volume24h, null);
  assert.equal(result.results[1].quote, undefined);
  const wrong = (await getMarketQuotes([{ query: "USDC", network: "Solana", address: mint.toLowerCase() }], options(fetcher))).results[0];
  assert.equal(wrong.status, "not_found");
});

test("a transient metadata failure can retry using the same controlled fetcher", async () => {
  let recovering = false;
  let metadataReads = 0;
  const fetcher = controlled(url => {
    if (url.hostname === "api.coingecko.com") return json([]);
    if (url.pathname.endsWith("/info")) {
      metadataReads++;
      return recovering ? json({ data: { "901": { id: 901, name: "Pilot Coin", symbol: "PLT", slug: "pilot-coin", is_active: 1 } } }) : fail(429);
    }
    if (url.pathname.endsWith("/map")) return json({ data: [{ id: 901, name: "Pilot Coin", symbol: "PLT", slug: "pilot-coin", is_active: 1 }] });
    return json({ data: [cmcQuote(901, "PLT", "Pilot Coin")] });
  });
  const before = (await getMarketQuotes([{ cmcId: 901 }], options(fetcher))).results[0];
  assert.equal(before.status, "unavailable");
  recovering = true;
  const after = (await getMarketQuotes([{ cmcId: 901 }], options(fetcher))).results[0];
  assert.equal(after.status, "ok");
  assert.equal(after.asset?.cmcId, 901);
  assert.equal(after.quote?.marketCap, null);
  assert.equal(metadataReads, 2);
});

test("cache hits preserve stale source time and expiry retries a failed refresh", async () => {
  let time = NOW;
  let reads = 0;
  let recovering = false;
  const old = new Date(NOW - 300_001).toISOString();
  const fetcher = controlled(url => {
    if (url.hostname !== "api.coingecko.com") return fail();
    reads++;
    if (reads > 1 && !recovering) return fail(429);
    return json([cgQuote("stellar", "xlm", { last_updated: recovering ? new Date(time).toISOString() : old })]);
  });
  const query = () => getMarketQuotes([{ query: "XLM" }], options(fetcher, () => time));
  const first = (await query()).results[0];
  const cached = (await query()).results[0];
  assert.equal(first.status, "stale");
  assert.equal(cached.status, "stale");
  assert.equal(cached.quote?.updatedAt, old);
  assert.equal(cached.quote?.fromCache, true);
  assert.equal(reads, 1);
  time += 61_000;
  const failed = (await query()).results[0];
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.quote, undefined);
  recovering = true;
  const renewed = (await query()).results[0];
  assert.equal(renewed.status, "ok");
  assert.equal(renewed.quote?.updatedAt, new Date(time).toISOString());
  assert.equal(renewed.quote?.fromCache, false);
});
