import type { MarketQuote } from "@/app/connectors/coinmarketcap";
import { canonicalAssetForQuery, getCanonicalProviderQuote, getMarketQuotes } from "@/app/market-data/service";
import type { MarketAsset, MarketPrice } from "@/app/market-data/types";

export function toCoinGeckoId(symbol: string): string | null {
  return canonicalAssetForQuery(symbol)?.coingeckoId ?? null;
}

export function toLegacyMarketQuote(asset: MarketAsset, quote: MarketPrice): MarketQuote {
  if (quote.price === null || !quote.updatedAt) throw new Error("market_quote_unavailable");
  return { id: quote.source === "CoinMarketCap" ? asset.cmcId ?? asset.id : asset.coingeckoId ?? asset.id,
    name: asset.name, symbol: asset.symbol, currency: "USD", price: quote.price,
    rank: quote.rank, change24h: quote.change24h, change7d: quote.change7d,
    marketCap: quote.marketCap, volume24h: quote.volume24h, updatedAt: quote.updatedAt,
    source: quote.source, access: quote.source === "CoinGecko"
      ? process.env.COINGECKO_API_KEY?.trim() ? "demo-key" : "keyless"
      : quote.source === "CoinMarketCap" ? "keyless-public" : "public-read-only" };
}

export async function getCoinGeckoQuote(symbol: string, fetcher: typeof fetch = fetch): Promise<MarketQuote> {
  const { asset, quote } = await getCanonicalProviderQuote(symbol, "CoinGecko", fetcher);
  return toLegacyMarketQuote(asset, quote);
}

export async function getMarketQuote(symbol: string, fetcher: typeof fetch = fetch): Promise<MarketQuote> {
  const known = canonicalAssetForQuery(symbol);
  if (!known) throw new Error("market_symbol_unsupported");
  const { results } = await getMarketQuotes([{ coingeckoId: known.coingeckoId! }], { fetcher });
  const result = results[0];
  if (result.status !== "ok" || !result.asset || !result.quote) throw new Error(result.error ?? `market_quote_${result.status}`);
  return toLegacyMarketQuote(result.asset, result.quote);
}
