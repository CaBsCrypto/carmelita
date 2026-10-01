import assert from "node:assert/strict";
import test from "node:test";
import { getCoinGeckoQuote, getMarketQuote, toCoinGeckoId } from "../app/connectors/coingecko";

const sample = [{
  id: "stellar",
  symbol: "xlm",
  name: "Stellar",
  current_price: 0.12,
  market_cap: 3_500_000_000,
  market_cap_rank: 25,
  total_volume: 90_000_000,
  price_change_percentage_24h: 1.5,
  price_change_percentage_7d_in_currency: -2.1,
  last_updated: new Date().toISOString(),
}];

test("maps a ticker to its CoinGecko id", () => {
  assert.equal(toCoinGeckoId("xlm"), "stellar");
  assert.equal(toCoinGeckoId("BTC"), "bitcoin");
  assert.equal(toCoinGeckoId("nope"), null);
});

test("getCoinGeckoQuote parses a markets response into a MarketQuote", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify(sample), { status: 200, headers: { "Content-Type": "application/json" } });
  const quote = await getCoinGeckoQuote("xlm", fetcher);
  assert.equal(quote.source, "CoinGecko");
  assert.equal(quote.symbol, "XLM");
  assert.equal(quote.price, 0.12);
  assert.equal(quote.rank, 25);
  assert.equal(quote.change7d, -2.1);
  assert.equal(quote.access, "keyless");
});

test("getMarketQuote falls back to CoinMarketCap when CoinGecko fails", async () => {
  const cmcBody = {
    data: [{
      id: 512, name: "Stellar", symbol: "XLM", cmc_rank: 25, last_updated: new Date().toISOString(),
      quote: [{ symbol: "USD", price: 0.11, volume_24h: 1, percent_change_24h: 1, percent_change_7d: 1, market_cap: 1, last_updated: new Date().toISOString() }],
    }],
    status: { error_code: 0 },
  };
  const fetcher: typeof fetch = async (url) =>
    String(url).includes("coingecko")
      ? new Response("upstream error", { status: 500 })
      : new Response(JSON.stringify(cmcBody), { status: 200, headers: { "Content-Type": "application/json" } });
  const quote = await getMarketQuote("xlm", fetcher);
  assert.equal(quote.source, "CoinMarketCap");
  assert.equal(quote.price, 0.11);
});

test("compatibility quotes reject an old price rather than presenting it as current", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([
    { ...sample[0], last_updated: new Date(Date.now() - 301_000).toISOString() },
  ]), { headers: { "content-type": "application/json" } });
  await assert.rejects(getCoinGeckoQuote("XLM", fetcher), /market_quote_stale/);
});
