import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText, safeExplorerLink, safeMarketSourceLink } from "../app/agent/message-text";
import { formatChainComparison, formatMarketQuotes } from "../app/market-data/format";
import type { ChainComparison, MarketQuotes } from "../app/market-data/types";

test("market source links accept only exact HTTPS provider hosts without userinfo or explicit ports", () => {
  for (const host of ["coingecko.com", "www.coingecko.com", "coinmarketcap.com", "www.coinmarketcap.com", "defillama.com", "www.defillama.com", "coins.llama.fi"]) {
    const url = `https://${host}/coins/token`;
    assert.equal(safeMarketSourceLink(url), url);
    for (const unsafe of [`http://${host}/`, `https://${host}.evil.test/`, `https://evil.${host}/`, `https://user:secret@${host}/`, `https://@${host}/`, `https://${host}:444/`, `https://${host}:443/`]) assert.equal(safeMarketSourceLink(unsafe), null, unsafe);
  }
  for (const unsafe of ["javascript:alert(1)", "data:text/html,bad", "https://example.com/", "/developers", "https://coingecko.com\\@evil.test/", "https://coingecko.com%2eevil.test/", "not a URL"]) assert.equal(safeMarketSourceLink(unsafe), null, unsafe);
  // The explorer contract stays separate from the market provider allowlist.
  assert.equal(safeExplorerLink("https://coingecko.com/en/coins/solana"), null);
  assert.equal(safeMarketSourceLink("https://stellar.expert/explorer/testnet/account/GTEST"), null);
  assert.equal(safeExplorerLink("https://stellar.expert/explorer/testnet/account/GTEST"), "https://stellar.expert/explorer/testnet/account/GTEST");
});

test("formatted CoinGecko quotes, CMC inactive evidence and DefiLlama chain sources render as anchors", () => {
  const data: MarketQuotes = { queriedAt: "2026-10-04T21:00:00Z", fetchedAt: "2026-10-04T21:00:00Z", dataScope: "mainnet_market_data", results: [
    { request: { query: "SOL" }, status: "ok", quote: { currency: "USD", price: 100, marketCap: null, volume24h: null, change24h: null, change7d: null, rank: null, source: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/solana", updatedAt: null, fetchedAt: "2026-10-04T21:00:00Z", fromCache: false, dataScope: "mainnet_market_data" } },
    { request: { query: "PAY" }, status: "unavailable", reason: "inactive", inactiveCandidates: [{ id: "coinmarketcap:1758", cmcId: 1758, coingeckoId: null, name: "TenX", symbol: "PAY", network: null, address: null, issuer: null, sourceUrl: "https://coinmarketcap.com/currencies/tenx/" }] },
  ] };
  const chains: ChainComparison = { status: "ok", quotedChains: 0, unavailableChains: 0, failures: [], queriedAt: data.queriedAt, rows: [{ name: "Base", chainId: 8453, tvl: 100, associatedToken: null, gasTokenId: "ethereum", marketCap: null, quoteStatus: "no_associated_token", marketSource: null, tvlSourceUrl: "https://defillama.com/chain/Base" }], sortBy: "tvl", totalChains: 1, missingChains: [], tvlFetchedAt: data.fetchedAt, tvlFromCache: false, tvlUpdatedAt: null, dataScope: "mainnet_market_data" };
  const html = renderToStaticMarkup(createElement(MessageText, { content: formatMarketQuotes(data) + "\n\n" + formatChainComparison(chains) }));
  for (const [label, href] of [["CoinGecko", "https://www.coingecko.com/en/coins/solana"], ["CoinMarketCap", "https://coinmarketcap.com/currencies/tenx/"], ["Base", "https://defillama.com/chain/Base"], ["DefiLlama", "https://defillama.com/chains"]]) {
    assert.ok(html.includes(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`), `${label} must be a real safe anchor`);
    assert.ok(!html.includes(`[${label}](`));
  }
});

test("unapproved Markdown URLs stay escaped text rather than actionable anchors", () => {
  const html = renderToStaticMarkup(createElement(MessageText, { content: "[Source](https://coinmarketcap.com.evil.test/) [Source](https://user@coingecko.com/) [Source](https://defillama.com:443/) [Docs](/developers) <script>bad</script>" }));
  assert.doesNotMatch(html, /<a\b|<script>/);
  assert.match(html, /&lt;script&gt;/);
});
