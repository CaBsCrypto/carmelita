import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMarketWatchlist } from "@/db/schema";
import { canonicalAssetForQuery, getVerifiedCmcProviderQuote } from "@/app/market-data/service";
import { toLegacyMarketQuote } from "@/app/connectors/coingecko";

const names: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  stellar: "XLM",
  lumen: "XLM",
  lumens: "XLM",
  xlm: "XLM",
  solana: "SOL",
  sol: "SOL",
  avalanche: "AVAX",
  avax: "AVAX",
  bnb: "BNB",
  usdc: "USDC",
  tether: "USDT",
  usdt: "USDT",
  xrp: "XRP",
  cardano: "ADA",
  ada: "ADA",
  dogecoin: "DOGE",
  doge: "DOGE",
};

export type MarketQuote = {
  id: number | string;
  name: string;
  symbol: string;
  currency: "USD";
  price: number;
  rank: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  updatedAt: string;
  source: "CoinMarketCap" | "CoinGecko" | "DefiLlama";
  access: string;
};

export function extractMarketSymbol(message: string) {
  const normalized = message.toLowerCase();
  for (const [term, symbol] of Object.entries(names)) {
    if (new RegExp("(^|[^a-z0-9])" + term + "([^a-z0-9]|$)", "i").test(normalized)) {
      return symbol;
    }
  }

  const uppercase = message.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) ?? [];
  return uppercase.find(
    (value) =>
      !["CMC", "USD", "API", "MCP", "THE", "AND", "FOR"].includes(value),
  ) ?? null;
}

export async function getCoinMarketCapQuote(
  symbol: string,
  fetcher: typeof fetch = fetch,
): Promise<MarketQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(normalizedSymbol)) {
    throw new Error("cmc_symbol_invalid");
  }

  const { asset, quote } = await getVerifiedCmcProviderQuote(normalizedSymbol, fetcher);
  return toLegacyMarketQuote(asset, quote);
}

export async function addToMarketWatchlist(userId: string, symbol: string) {
  const canonicalAsset = canonicalAssetForQuery(symbol);
  if (!canonicalAsset) throw new Error("market_watchlist_symbol_unsupported");
  const db = getDb();
  const normalizedSymbol = canonicalAsset.symbol;
  await db
    .insert(agentMarketWatchlist)
    .values({
      id: randomUUID(),
      userId,
      symbol: normalizedSymbol,
      source: "coinmarketcap",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        agentMarketWatchlist.userId,
        agentMarketWatchlist.symbol,
      ],
      set: { updatedAt: new Date() },
    });
  return normalizedSymbol;
}

export async function listMarketWatchlist(userId: string) {
  const db = getDb();
  return db
    .select({
      symbol: agentMarketWatchlist.symbol,
      source: agentMarketWatchlist.source,
      createdAt: agentMarketWatchlist.createdAt,
    })
    .from(agentMarketWatchlist)
    .where(eq(agentMarketWatchlist.userId, userId))
    .orderBy(asc(agentMarketWatchlist.createdAt))
    .limit(20);
}

export function formatMarketQuote(
  quote: MarketQuote,
  language: "en" | "es" | "pt" = "en",
) {
  const locale = language === "pt" ? "pt-BR" : language === "es" ? "es-CL" : "en-US";
  const labels = {
    en: { price: "Price", marketCap: "Market cap", volume: "24h volume", rank: "Rank", updated: "Updated", source: "Source", access: "read-only" },
    es: { price: "Precio", marketCap: "Capitalización", volume: "Volumen 24h", rank: "Ranking", updated: "Actualizado", source: "Fuente", access: "solo lectura" },
    pt: { price: "Preço", marketCap: "Capitalização", volume: "Volume 24h", rank: "Ranking", updated: "Atualizado", source: "Fonte", access: "somente leitura" },
  }[language];
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: quote.price < 1 ? 6 : 2,
  });
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
  const percent = (value: number | null) =>
    value === null ? "n/a" : (value >= 0 ? "+" : "") + value.toFixed(2) + "%";

  return [
    "**" + quote.name + " (" + quote.symbol + ")**",
    labels.price + ": **" + money.format(quote.price) + "**",
    "24h: " + percent(quote.change24h) + " · 7d: " + percent(quote.change7d),
    labels.marketCap + ": " +
      (quote.marketCap === null ? "n/a" : "$" + compact.format(quote.marketCap)) +
      " · " + labels.volume + ": " +
      (quote.volume24h === null ? "n/a" : "$" + compact.format(quote.volume24h)),
    labels.rank + ": " + (quote.rank ?? "n/a"),
    labels.updated + ": " + quote.updatedAt,
    labels.source + ": " + quote.source + " (" + labels.access + ")",
  ].join("\n\n");
}
