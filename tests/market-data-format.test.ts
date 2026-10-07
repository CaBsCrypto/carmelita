import assert from "node:assert/strict";
import test from "node:test";
import { formatChainComparison, formatMarketQuotes } from "../app/market-data/format";
import type { ChainComparison, MarketAsset, MarketQuotes, MarketResult } from "../app/market-data/types";

const inactiveAsset: MarketAsset = { id: "coingecko:tenx", coingeckoId: "tenx", cmcId: 1758, name: "TenX", symbol: "PAY", network: null, address: null, issuer: null, sourceUrl: "https://coinmarketcap.com/currencies/tenx/" };
function quotes(result: MarketResult): MarketQuotes {
  return { queriedAt: "2026-10-04T21:00:00Z", fetchedAt: "2026-10-04T21:00:00Z", dataScope: "mainnet_market_data", results: [result] };
}

const evidenceExpectations = {
  es: { inactive: /identificados como inactivos/, absent: /no encontrado en los catálogos consultados/, partial: /Consulta parcial: otra fuente no respondió/, limited: /se limita a los activos identificados/, retry: /puedes reintentar/, ambiguous: /varios activos/, unavailable: /dato verificado/ },
  en: { inactive: /identified as inactive/, absent: /not found in the catalogs consulted/, partial: /Partial query: another source did not respond/, limited: /only to the identified assets/, retry: /you can retry/, ambiguous: /Several assets/, unavailable: /verified data/ },
  pt: { inactive: /identificados como inativos/, absent: /não encontrado nos catálogos consultados/, partial: /Consulta parcial: outra fonte não respondeu/, limited: /se limita aos ativos identificados/, retry: /você pode tentar novamente/, ambiguous: /Vários ativos/, unavailable: /dado verificado/ },
};

test("inactive identities retain their actual catalog source and query date without a quote in ES/EN/PT", () => {
  for (const locale of ["es", "en", "pt"] as const) {
    const result = formatMarketQuotes(quotes({ request: { query: "PAY" }, status: "unavailable", reason: "inactive", inactiveCandidates: [inactiveAsset] }), locale);
    assert.match(result, evidenceExpectations[locale].inactive);
    assert.match(result, /TenX \(PAY\).*coingecko:tenx/);
    assert.match(result, /\[CoinMarketCap\]\(https:\/\/coinmarketcap.com\/currencies\/tenx\/\)/);
    assert.doesNotMatch(result, /\[CoinGecko\]|Consulta parcial|Partial query|\$0|US\$\s*0/);
    assert.match(result, /2026-10-04T21:00:00Z/);
    assert.doesNotMatch(result, evidenceExpectations[locale].absent);
  }
});

test("a failed source alongside known inactive evidence remains a partial recoverable query in every locale", () => {
  for (const locale of ["es", "en", "pt"] as const) {
    for (const status of ["not_found", "unavailable"] as const) {
      const result = formatMarketQuotes(quotes({ request: { query: "PAY" }, status, reason: "inactive", inactiveCandidates: [inactiveAsset], error: "market_upstream_http_503" }), locale);
      const expected = evidenceExpectations[locale];
      for (const pattern of [expected.inactive, expected.partial, expected.limited, expected.retry]) assert.match(result, pattern);
      assert.match(result, /TenX \(PAY\).*coingecko:tenx/);
      assert.doesNotMatch(result, expected.absent);
      assert.doesNotMatch(result, /market_upstream_http_503|\$0|US\$\s*0/);
    }
  }
});

test("catalog absence, ambiguity and recoverable provider failure have distinct messages and no invented prices", () => {
  for (const locale of ["es", "en", "pt"] as const) {
    const expected = evidenceExpectations[locale];
    const absent = formatMarketQuotes(quotes({ request: { query: "missing" }, status: "not_found" }), locale);
    const ambiguous = formatMarketQuotes(quotes({ request: { query: "PAY" }, status: "ambiguous", candidates: [inactiveAsset, { ...inactiveAsset, id: "coinmarketcap:999", name: "Other PAY" }] }), locale);
    const failed = formatMarketQuotes(quotes({ request: { query: "PAY" }, status: "unavailable", error: "market_rate_limited" }), locale);
    assert.match(absent, expected.absent); assert.doesNotMatch(absent, expected.inactive);
    assert.match(ambiguous, expected.ambiguous); assert.match(ambiguous, /coingecko:tenx/); assert.match(ambiguous, /coinmarketcap:999/);
    assert.match(failed, expected.unavailable); assert.match(failed, locale === "es" ? /Puedes reintentar/ : locale === "en" ? /You can retry/ : /Você pode tentar novamente/);
    assert.doesNotMatch(failed, expected.inactive); assert.doesNotMatch(failed, expected.absent);
    for (const output of [absent, ambiguous, failed]) assert.doesNotMatch(output, /\$0|US\$\s*0/);
  }
});

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
  assert.match(result, /\| Token de gas \|\n\|---\|---:\|---\|---:\|---\|\n\|/);
  const partial = formatChainComparison({ ...data, status: "partial", unavailableChains: 1,
    failures: [{ chain: "Arbitrum", status: "unavailable", error: "market_rate_limited" }] }, "es");
  assert.match(partial, /Resultado parcial/);
  assert.match(partial, /Arbitrum/);
});
