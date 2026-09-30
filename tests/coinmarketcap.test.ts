import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMarketSymbol,
  formatMarketQuote,
  getCoinMarketCapQuote,
} from "../app/connectors/coinmarketcap";

test("extracts common asset names and symbols", () => {
  assert.equal(extractMarketSymbol("What is the price of XLM?"), "XLM");
  assert.equal(extractMarketSymbol("precio de bitcoin"), "BTC");
  assert.equal(extractMarketSymbol("Add Avalanche to my watchlist"), "AVAX");
});

test("loads and normalizes a CoinMarketCap public quote by verified ID", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    assert.ok(
      url.includes("public-api/v3/cryptocurrency/quotes/latest"),
    );
    assert.match(url, /id=512/);
    assert.ok(!url.includes("symbol="));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 512,
            name: "Stellar",
            symbol: "XLM",
            cmc_rank: 13,
            last_updated: new Date().toISOString(),
            quote: [
              {
                symbol: "USD",
                price: 0.17915,
                volume_24h: 137224056,
                percent_change_24h: -2.55,
                percent_change_7d: -8.63,
                market_cap: 6122689488,
                last_updated: new Date().toISOString(),
              },
            ],
          },
        ],
        status: { error_code: "0" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const quote = await getCoinMarketCapQuote("xlm", fetcher);
  assert.equal(quote.symbol, "XLM");
  assert.equal(quote.price, 0.17915);
  assert.equal(quote.rank, 13);
  assert.equal(quote.source, "CoinMarketCap");
  assert.match(formatMarketQuote(quote), /read-only/);
  assert.match(formatMarketQuote(quote, "pt"), /Preço/);
  assert.match(formatMarketQuote(quote, "pt"), /somente leitura/);
});

test("does not present an absent CoinMarketCap asset as a quote", async () => {
  const fetcher: typeof fetch = async input =>
    new Response(JSON.stringify({ data: String(input).includes("/info") ? {} : [], status: { error_code: "0" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    getCoinMarketCapQuote("ZZZZ", fetcher),
    /cmc_asset_not_found/,
  );
});
