import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText, messageBlocks, safeExplorerLink, safeMessageLink } from "../app/agent/message-text";
import { formatChainComparison } from "../app/market-data/format";

test("market sources render visible anchors through the actual chat component", () => {
  const sources = [
    ["CoinGecko", "https://www.coingecko.com/en/coins/stellar"],
    ["CoinMarketCap", "https://coinmarketcap.com/currencies/stellar/"],
    ["DefiLlama", "https://defillama.com/chains"],
    ["DefiLlama prices", "https://coins.llama.fi/prices/current/coingecko:stellar?searchWidth=4h"],
  ];
  for (const [label, url] of sources) {
    const html = renderToStaticMarkup(createElement(MessageText, { content: `**Fuente:** [${label}](${url})` }));
    assert.match(html, /<strong>Fuente:<\/strong>/);
    assert.ok(html.includes(`href="${url}"`));
    assert.ok(html.includes(`${label} ↗</a>`));
    assert.match(html, /class="agent-message-link"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.ok(!html.includes(`[${label}](`));
  }
  const nested = renderToStaticMarkup(createElement(MessageText, { content: "**[CoinGecko](https://www.coingecko.com/en/coins/stellar)**" }));
  assert.match(nested, /<strong><a[^>]+>CoinGecko ↗<\/a><\/strong>/);
});

test("source links reject executable schemes, spoofed hosts, credentials, ports and HTML", () => {
  const unsafe = ["javascript:alert(1)", "data:text/html,<script>bad</script>", "http://coingecko.com/", "https://coingecko.com.evil.test/", "https://evil.test/?redirect=https://coingecko.com/", "https://www.coingecko.com@evil.test/", "https://user:password@defillama.com/", "https://coins.llama.fi:444/", "https://pro-api.coinmarketcap.com/", "https://coingecko.com\\@evil.test/"];
  for (const url of unsafe) {
    assert.equal(safeMessageLink(url), null);
    const html = renderToStaticMarkup(createElement(MessageText, { content: `[Source](${url})` }));
    assert.doesNotMatch(html, /<a\b/);
  }
  const html = renderToStaticMarkup(createElement(MessageText, { content: '[<img src=x onerror=alert(1)>](https://www.coingecko.com/en/coins/stellar)\n<script>alert(1)</script>' }));
  assert.match(html, /href="https:\/\/www\.coingecko\.com\/en\/coins\/stellar"/);
  assert.doesNotMatch(html, /<(?:script|img)\b/);
  assert.match(html, /&lt;script&gt;/);
  // The legacy explorer-only validation does not expand its permissions.
  assert.equal(safeExplorerLink("https://coingecko.com/"), null);
  assert.equal(safeMessageLink("https://explorer.solana.com/address/abc?cluster=devnet"), "https://explorer.solana.com/address/abc?cluster=devnet");
});

test("five-column market tables preserve dynamic accessible names and linked chain names", () => {
  const content = formatChainComparison({ rows: [{ name: "Base", chainId: 8453, tvl: 100, associatedToken: null, gasTokenId: "ethereum", marketCap: null, quoteStatus: "no_associated_token", marketSource: null, tvlSourceUrl: "https://defillama.com/chain/Base" }], queriedAt: "2026-09-30T08:00:00.000Z", status: "ok", quotedChains: 0, unavailableChains: 0, failures: [], sortBy: "tvl", totalChains: 1, missingChains: [], tvlFetchedAt: "2026-09-30T07:59:00.000Z", tvlFromCache: true, tvlUpdatedAt: null, dataScope: "mainnet_market_data" }, "es");
  const blocks = messageBlocks(content);
  const table = blocks.find(block => block.kind === "table");
  assert.equal(table?.kind, "table");
  assert.ok(table?.kind === "table");
  assert.equal(table.rows.length, 1);
  const html = renderToStaticMarkup(createElement(MessageText, { content }));
  assert.match(html, /aria-label="Red · TVL de la red · Token asociado · Capitalización del token · Token de gas"/);
  assert.doesNotMatch(html, /Dirección · Estado · Explorador/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 5);
  assert.match(html, /href="https:\/\/defillama\.com\/chain\/Base"/);
  assert.match(html, />Base ↗<\/a>/);
  assert.match(html, /overflow-x:auto;max-width:100%/);
  assert.doesNotMatch(html, /min-width:12rem/);
});
