import assert from "node:assert/strict";
import test from "node:test";
import { formatChainComparison, formatMarketQuotes } from "../app/market-data/format";
import type { ChainComparison, MarketQuotes } from "../app/market-data/types";

test("market output marks old data, null metrics and provider timestamps in every locale", () => {
  const data: MarketQuotes = { queriedAt: "2026-09-30T06:01:00Z", fetchedAt: "2026-09-30T06:00:00Z", dataScope: "mainnet_market_data", results: [{ request: { query: "SOL" }, status: "stale", asset: { id: "coingecko:solana", coingeckoId: "solana", cmcId: null, name: "Solana", symbol: "SOL", network: null, address: null, issuer: null, sourceUrl: "https://www.coingecko.com/en/coins/solana" }, quote: { price: 100, marketCap: null, volume24h: null, change24h: null, change7d: null, rank: null, currency: "USD", source: "DefiLlama", sourceUrl: "https://defillama.com/", updatedAt: "2026-09-30T05:00:00Z", fetchedAt: "2026-09-30T06:00:00Z", fromCache: true, dataScope: "mainnet_market_data" } }] };
  for (const locale of ["es", "en", "pt"] as const) {
    const result = formatMarketQuotes(data, locale);
    assert.match(result, /Mainnet/); assert.match(result, /Testnet/); assert.match(result, /2026-09-30T05:00:00Z/);
    assert.match(result, /2026-09-30T06:01:00Z/); assert.match(result, /2026-09-30T06:00:00Z/); assert.match(result, /DefiLlama/); assert.doesNotMatch(result, /\$0\.00/);
  }
  assert.match(formatMarketQuotes(data, "es"), /Dato antiguo/);
});

test("Base shows no associated token cap and TVL does not invent an update time", () => {
  const data: ChainComparison = { status: "ok", quotedChains: 0, unavailableChains: 0, failures: [], queriedAt: "2026-09-30T06:01:00Z", rows: [{ name: "Base", chainId: 8453, tvl: 5_000_000, associatedToken: null, gasTokenId: "ethereum", marketCap: null, quoteStatus: "no_associated_token", marketSource: null, tvlSourceUrl: "https://defillama.com/chain/Base" }], sortBy: "tvl", totalChains: 1, missingChains: [], tvlFetchedAt: "2026-09-30T06:00:00Z", tvlFromCache: false, tvlUpdatedAt: null, dataScope: "mainnet_market_data" };
  const result = formatChainComparison(data, "es");
  assert.match(result, /Sin token asociado/); assert.match(result, /No disponible/);
  assert.match(result, /ethereum/); assert.match(result, /no informa fecha/);
  assert.match(result, /métricas distintas/);
  const partial = formatChainComparison({ ...data, status: "partial", unavailableChains: 1,
    failures: [{ chain: "Arbitrum", status: "unavailable", error: "market_rate_limited" }] }, "es");
  assert.match(partial, /Resultado parcial/);
  assert.match(partial, /Arbitrum/);
});
