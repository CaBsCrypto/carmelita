import { z } from "zod";

export const marketLocaleSchema = z.enum(["en", "es", "pt"]);
export type MarketLocale = z.infer<typeof marketLocaleSchema>;
export const assetQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  coingeckoId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).optional(),
  cmcId: z.number().int().positive().optional(),
  network: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().min(1).max(128).optional(),
  issuer: z.string().trim().regex(/^G[A-Z2-7]{55}$/).optional(),
}).strict().refine(v => Boolean(v.query || v.coingeckoId || v.cmcId || (v.network && v.address)), "asset_identity_required")
  .refine(v => !v.address || Boolean(v.network), "contract_network_required")
  .refine(v => !v.issuer || Boolean(v.query && v.network), "issuer_asset_and_network_required");
export type AssetQuery = z.infer<typeof assetQuerySchema>;
export const marketQuotesInputSchema = z.object({
  assets: z.array(assetQuerySchema).min(1).max(10),
  locale: marketLocaleSchema.default("es"),
}).strict();
export const marketSearchInputSchema = z.object({
  asset: assetQuerySchema,
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
export const chainComparisonInputSchema = z.object({
  chains: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
  sortBy: z.enum(["tvl", "marketCap"]).default("tvl"),
  limit: z.number().int().min(1).max(20).default(10),
  locale: marketLocaleSchema.default("es"),
}).strict();
export type ChainComparisonInput = z.infer<typeof chainComparisonInputSchema>;

export type MarketAsset = {
  id: string;
  name: string;
  symbol: string;
  coingeckoId: string | null;
  cmcId: number | null;
  network: string | null;
  address: string | null;
  issuer: string | null;
  sourceUrl: string;
};
export type MarketPrice = {
  currency: "USD";
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
  rank: number | null;
  source: "CoinGecko" | "CoinMarketCap" | "DefiLlama";
  sourceUrl: string;
  updatedAt: string | null;
  fetchedAt: string;
  fromCache: boolean;
  dataScope: "mainnet_market_data";
  confidence?: number;
};
export type MarketResult = {
  request: AssetQuery;
  status: "ok" | "ambiguous" | "not_found" | "unavailable" | "stale";
  asset?: MarketAsset;
  quote?: MarketPrice;
  candidates?: MarketAsset[];
  reason?: "inactive";
  inactiveCandidates?: MarketAsset[];
  error?: string;
};
export type MarketQuotes = {
  results: MarketResult[];
  queriedAt: string;
  fetchedAt: string;
  dataScope: "mainnet_market_data";
};
export type MarketSearch = {
  candidates: MarketAsset[];
  queriedAt: string;
  status: "ok" | "not_found" | "unavailable";
  fetchedAt: string;
  fromCache: boolean;
  reason?: "inactive";
  inactiveCandidates?: MarketAsset[];
  error?: string;
};
export type MarketOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
};
export type ChainRow = {
  name: string;
  chainId: number | string | null;
  tvl: number | null;
  associatedToken: MarketAsset | null;
  gasTokenId: string | null;
  marketCap: number | null;
  quoteStatus: MarketResult["status"] | "no_associated_token";
  quoteError?: string;
  marketSource: MarketPrice | null;
  tvlSourceUrl: string;
};
export type ChainComparison = {
  rows: ChainRow[];
  queriedAt: string;
  status: "ok" | "partial" | "unavailable";
  quotedChains: number;
  unavailableChains: number;
  failures: Array<{ chain: string; status: MarketResult["status"] | "missing_market_cap"; error?: string }>;
  sortBy: "tvl" | "marketCap";
  totalChains: number;
  missingChains: string[];
  tvlFetchedAt: string;
  tvlFromCache: boolean;
  tvlUpdatedAt: null;
  dataScope: "mainnet_market_data";
  error?: string;
};
