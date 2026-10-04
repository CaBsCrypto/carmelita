import { z } from "zod";
import { createHash } from "node:crypto";
import { processMarketCache, publicMarketCache } from "./cache";
import { assetQuerySchema, type AssetQuery, type MarketAsset, type MarketOptions,
  type MarketPrice, type MarketQuotes, type MarketResult, type MarketSearch } from "./types";

const CG_BASE = "https://api.coingecko.com/api/v3";
const CMC_BASE = "https://pro-api.coinmarketcap.com/public-api";
const LLAMA_BASE = "https://coins.llama.fi";
const MAX_CATALOG_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FRESHNESS_MS = 5 * 60_000;
const ALLOWED_HOSTS = new Set(["api.coingecko.com", "pro-api.coinmarketcap.com", "coins.llama.fi"]);

const canonical = [
  ["BTC", "Bitcoin", "bitcoin", 1, "bitcoin"],
  ["ETH", "Ethereum", "ethereum", 1027, "ethereum"],
  ["XLM", "Stellar", "stellar", 512, "stellar"],
  ["SOL", "Solana", "solana", 5426, "solana"],
  ["AVAX", "Avalanche", "avalanche-2", 5805, "avalanche"],
  ["BNB", "BNB", "binancecoin", 1839, "binance-smart-chain"],
  ["USDC", "USDC", "usd-coin", 3408, null],
  ["USDT", "Tether", "tether", 825, null],
  ["XRP", "XRP", "ripple", 52, "ripple"],
  ["ADA", "Cardano", "cardano", 2010, "cardano"],
  ["DOGE", "Dogecoin", "dogecoin", 74, "dogecoin"],
] as const;
export const canonicalMarketSymbols: readonly string[] = canonical.map(row => row[0]);
const aliases: Record<string, string> = { ether: "ETH", lumen: "XLM", lumens: "XLM", "usd coin": "USDC" };
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const nameKey = (value: string) => normalize(value).replace(/[^a-z0-9]/g, "");
const canonicalAssets = canonical.map(([symbol, name, id, cmcId]) => ({
  id: `coingecko:${id}`, name, symbol, coingeckoId: id, cmcId,
  network: null, address: null, issuer: null, sourceUrl: `https://www.coingecko.com/en/coins/${id}`,
} satisfies MarketAsset));

export function canonicalAssetForQuery(query: string): MarketAsset | null {
  const term = normalize(query);
  const found = canonicalAssets.find(asset => normalize(asset.symbol) === term
    || normalize(asset.name) === term || asset.coingeckoId === term
    || aliases[term] === asset.symbol);
  return found ? { ...found } : null;
}

const networkAliases: Record<string, string> = {
  eth: "ethereum", ethereum: "ethereum", "ethereum mainnet": "ethereum",
  bnb: "binance-smart-chain", bsc: "binance-smart-chain", "bnb chain": "binance-smart-chain", "bnb smart chain": "binance-smart-chain",
  avalanche: "avalanche", avax: "avalanche", "avalanche c chain": "avalanche",
  sol: "solana", solana: "solana", base: "base", polygon: "polygon-pos", matic: "polygon-pos",
  arbitrum: "arbitrum-one", "arbitrum one": "arbitrum-one", optimism: "optimistic-ethereum",
  stellar: "stellar", xlm: "stellar", tron: "tron", bitcoin: "bitcoin", btc: "bitcoin",
  ripple: "ripple", xrp: "ripple", cardano: "cardano", ada: "cardano", dogecoin: "dogecoin",
};
const llamaChains: Record<string, string> = {
  ethereum: "ethereum", "binance-smart-chain": "bsc", avalanche: "avax", base: "base",
  "polygon-pos": "polygon", "arbitrum-one": "arbitrum", "optimistic-ethereum": "optimism", solana: "solana",
};
const addressEqual = (a: string, b: string) => /^0x[0-9a-f]{40}$/i.test(a) && /^0x[0-9a-f]{40}$/i.test(b)
  ? a.toLowerCase() === b.toLowerCase() : a === b;
const nonnegative = z.number().finite().nonnegative();
const nullableNumber = z.number().finite().nullable().optional();
const nullableMetric = nonnegative.nullable().optional();
const nullableRank = nonnegative.int().nullable().optional();
const cgCoinSchema = z.object({ id: z.string().min(1).max(120), symbol: z.string().min(1).max(80), name: z.string().min(1).max(200),
  platforms: z.record(z.string(), z.string().nullable()).optional().default({}) });
type CgCoin = z.infer<typeof cgCoinSchema>;
const cgCatalogSchema = z.array(z.unknown()).max(100_000);
const cgPlatformsSchema = z.array(z.object({ id: z.string(), name: z.string(), shortname: z.string().optional().nullable(),
  chain_identifier: z.number().nullable().optional() })).max(5_000);
const cgMarketSchema = z.object({ id: z.string(), symbol: z.string(), name: z.string(), current_price: nonnegative,
  market_cap: nullableMetric, market_cap_rank: nullableRank, total_volume: nullableMetric,
  price_change_percentage_24h: nullableNumber, price_change_percentage_7d_in_currency: nullableNumber,
  last_updated: z.string().datetime({ offset: true }) });
const cmcAssetSchema = z.object({ id: z.number().int().positive(), name: z.string().min(1), symbol: z.string().min(1),
  slug: z.string().optional(), is_active: z.number().optional(), platform: z.object({
    id: z.number().optional(), name: z.string().optional(), symbol: z.string().optional(), slug: z.string().optional(), token_address: z.string().optional(),
  }).nullable().optional() });
type CmcAsset = z.infer<typeof cmcAssetSchema>;
const cmcMapSchema = z.object({ data: z.array(cmcAssetSchema.extend({ is_active: z.union([z.literal(0), z.literal(1)]) })).max(10_000),
  status: z.object({ error_code: z.union([z.string(), z.number()]).optional() }).optional() });
const cmcInfoAssetSchema = cmcAssetSchema.omit({ platform: true }).extend({ platform: z.object({
  id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).optional(), name: z.string().optional(), symbol: z.string().optional(), slug: z.string().optional(), token_address: z.string().optional(),
}).nullable().optional(), contract_address: z.array(z.object({ contract_address: z.string(), platform: z.object({
  name: z.string().optional(), coin: z.object({ id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).optional(),
    name: z.string().optional(), slug: z.string().optional(), symbol: z.string().optional() }).optional(),
}) })).max(1_000).optional() });
const cmcQuoteSchema = cmcAssetSchema.extend({ cmc_rank: nullableRank, last_updated: z.string().optional(),
  quote: z.array(z.object({ symbol: z.string(), price: nonnegative, volume_24h: nullableMetric,
    percent_change_24h: nullableNumber, percent_change_7d: nullableNumber, market_cap: nullableMetric,
    last_updated: z.string().datetime({ offset: true }) })).max(30) });
type CgMarket = z.infer<typeof cgMarketSchema>;
type CmcQuote = z.infer<typeof cmcQuoteSchema>;
type Context = { options: MarketOptions; fetcher: typeof fetch; now: () => number; signal: AbortSignal;
  batchAssets?: MarketAsset[]; resolvedAssets?: MarketAsset[]; cgBatch?: Promise<CgMarket[]>;
  cmcBatch?: Promise<{ coins: CmcQuote[]; identities: Map<string, number> }> };

function context(options: MarketOptions): Context {
  const deadline = AbortSignal.timeout(20_000);
  return { options, fetcher: options.fetcher ?? fetch, now: options.now ?? Date.now,
    signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline };
}
function cgHeaders() {
  const key = process.env.COINGECKO_API_KEY?.trim();
  return { Accept: "application/json", ...(key ? { "x-cg-demo-api-key": key } : {}) };
}

async function readJson(url: URL, ctx: Context, maxBytes = MAX_RESPONSE_BYTES, headers: Record<string, string> = {}) {
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password) throw new Error("market_url_rejected");
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(8_000)]);
  signal.throwIfAborted();
  const response = await abortable(ctx.fetcher(url, { method: "GET", headers: { Accept: "application/json", ...headers },
    redirect: "error", credentials: "omit", cache: "no-store", signal }), signal);
  signal.throwIfAborted();
  const cmcLookup400 = response.status === 400 && url.hostname === "pro-api.coinmarketcap.com"
    && url.pathname === "/public-api/v2/cryptocurrency/info";
  if (!response.ok && !cmcLookup400) throw new Error(response.status === 429 ? "market_rate_limited" : `market_upstream_http_${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("market_response_invalid");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("market_response_too_large");
  if (!response.body) throw new Error("market_response_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("market_response_too_large"); }
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (cmcLookup400) {
      const slug = url.searchParams.get("slug");
      const parsed = z.object({ status: z.object({ error_code: z.literal(400), error_message: z.string() }) }).safeParse(body);
      if (slug && /^[a-z0-9][a-z0-9-]*$/.test(slug) && parsed.success
        && parsed.data.status.error_message === `Invalid value for 'slug': '${slug}'`) throw new Error("market_asset_not_found");
      throw new Error("market_upstream_http_400");
    }
    return body;
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}

function code(error: unknown) {
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return "market_timeout";
  return error instanceof Error && /^market_[a-z0-9_]+$/.test(error.message) ? error.message : "market_upstream_unavailable";
}
async function cgCatalog(ctx: Context) {
  const bucket = Math.floor(ctx.now() / 86_400_000);
  const loadRaw = () => processMarketCache(`cg:catalog:raw:v2:${bucket}`, 86_400, async () => {
    const url = new URL(`${CG_BASE}/coins/list`); url.searchParams.set("include_platform", "true");
    const rows = cgCatalogSchema.parse(await readJson(url, ctx, MAX_CATALOG_BYTES, cgHeaders()));
    const coins = rows.flatMap(row => { const parsed = cgCoinSchema.safeParse(row); return parsed.success ? [parsed.data] : []; });
    // A small number of malformed provider rows must not disable all catalog assets.
    if (rows.length && !coins.length) throw new Error("market_catalog_invalid");
    return { coins, fetchedAt: new Date(ctx.now()).toISOString() };
  }, ctx.options);
  return (await processMarketCache(`cg:catalog:assembled:v2:${bucket}`, 86_400, async () => {
    // Content-addressed shards keep each shared Data Cache item below 2 MiB.
    const manifest = (await publicMarketCache("cg:catalog:manifest:v2", 86_400, async () => {
      const snapshot = (await loadRaw()).value;
      const revision = createHash("sha256").update(JSON.stringify(snapshot.coins)).digest("hex");
      const chunks: CgCoin[][] = []; let chunk: CgCoin[] = []; let bytes = 2;
      for (const coin of snapshot.coins) {
        const size = Buffer.byteLength(JSON.stringify(coin), "utf8") + 1;
        if (size > 1024 * 1024) throw new Error("market_catalog_entry_too_large");
        if (bytes + size > 1024 * 1024) { chunks.push(chunk); chunk = []; bytes = 2; }
        chunk.push(coin); bytes += size;
      }
      if (chunk.length || !chunks.length) chunks.push(chunk);
      const keys = chunks.map((_, index) => `cg:catalog:shard:${revision}:${index}`);
      await Promise.all(keys.map((key, index) => publicMarketCache(key, 86_400,
        async () => ({ revision, coins: chunks[index] }), ctx.options)));
      return { revision, keys, fetchedAt: snapshot.fetchedAt, count: snapshot.coins.length };
    }, ctx.options)).value;
    try {
      const shards = await Promise.all(manifest.keys.map(key => publicMarketCache<{ revision: string; coins: CgCoin[] }>(key, 86_400,
        async () => { throw new Error("market_catalog_cache_incomplete"); }, ctx.options)));
      if (shards.some(shard => shard.value.revision !== manifest.revision)) throw new Error("market_catalog_cache_incomplete");
      const coins = shards.flatMap(shard => shard.value.coins);
      if (coins.length !== manifest.count) throw new Error("market_catalog_cache_incomplete");
      return coins;
    } catch (error) {
      // Eviction must not mix revisions or prevent a safe bounded provider read.
      if (!(error instanceof Error) || error.message !== "market_catalog_cache_incomplete") throw error;
      return (await loadRaw()).value.coins;
    }
  }, ctx.options)).value;
}
async function platformId(network: string, ctx: Context) {
  const term = normalize(network);
  if (networkAliases[term]) return networkAliases[term];
  const platforms = (await publicMarketCache("cg:platforms:v1", 86_400,
    async () => cgPlatformsSchema.parse(await readJson(new URL(`${CG_BASE}/asset_platforms`), ctx, MAX_RESPONSE_BYTES, cgHeaders())), ctx.options)).value;
  return platforms.find(item => [item.id, item.name, item.shortname].some(value => value && normalize(value) === term))?.id ?? term;
}
function fromCg(coin: CgCoin, network: string | null): MarketAsset {
  const known = canonicalAssets.find(asset => asset.coingeckoId === coin.id);
  const address = network ? coin.platforms[network] ?? null : null;
  const issuer = network === "stellar" ? address?.match(/^[A-Za-z0-9]{1,12}-(G[A-Z2-7]{55})$/)?.[1] ?? null : null;
  return { id: `coingecko:${coin.id}`, name: coin.name, symbol: coin.symbol.toUpperCase(), coingeckoId: coin.id,
    cmcId: known?.cmcId ?? null, network, address,
    issuer, sourceUrl: `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.id)}` };
}
function fromCmc(coin: CmcAsset, network: string | null = null): MarketAsset {
  const known = canonicalAssets.find(asset => asset.cmcId === coin.id);
  return { id: known?.id ?? `coinmarketcap:${coin.id}`, name: coin.name, symbol: coin.symbol.toUpperCase(),
    coingeckoId: known?.coingeckoId ?? null, cmcId: coin.id, network,
    address: network ? coin.platform?.token_address ?? null : null, issuer: null,
    sourceUrl: `https://coinmarketcap.com/currencies/${encodeURIComponent(coin.slug ?? String(coin.id))}/` };
}
function cmcNetwork(coin: CmcAsset) {
  return networkAliases[normalize(coin.platform?.name ?? "")] ?? networkAliases[normalize(coin.platform?.slug ?? "")] ?? coin.platform?.slug;
}
async function cmcInfo(asset: AssetQuery, ctx: Context): Promise<CmcAsset[]> {
  // Official keyless V2 metadata supports id/slug; /map only filters by symbol.
  // https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency
  const records = (await publicMarketCache(`cmc:info:v3:${asset.cmcId ? `id:${asset.cmcId}` : `slug:${normalize(asset.query ?? "")}`}`, 86_400, async () => {
    const url = new URL(`${CMC_BASE}/v2/cryptocurrency/info`);
    if (asset.cmcId) url.searchParams.set("id", String(asset.cmcId));
    else url.searchParams.set("slug", normalize(asset.query!).replace(/\s+/g, "-"));
    let raw: unknown;
    try { raw = await readJson(url, ctx); }
    catch (error) { if (error instanceof Error && error.message === "market_asset_not_found") return []; throw error; }
    const parsed = z.object({ data: z.record(z.string(), cmcInfoAssetSchema), status: z.object({ error_code: z.union([z.string(), z.number()]).optional() }).optional() }).parse(raw);
    if (parsed.status?.error_code && String(parsed.status.error_code) !== "0") throw new Error("market_upstream_api_error");
    return Object.values(parsed.data).filter(coin => !asset.cmcId || coin.id === asset.cmcId);
  }, ctx.options)).value;
  return records.flatMap(coin => {
    const primary: CmcAsset = { id: coin.id, name: coin.name, symbol: coin.symbol, slug: coin.slug,
      is_active: coin.is_active, platform: coin.platform ? { ...coin.platform,
        id: coin.platform.id === undefined ? undefined : Number(coin.platform.id) } : null };
    if (!asset.network || !coin.contract_address?.length) return [primary];
    return coin.contract_address.map(contract => ({ ...primary, platform: {
      name: contract.platform.name ?? contract.platform.coin?.name,
      slug: contract.platform.coin?.slug, symbol: contract.platform.coin?.symbol,
      token_address: contract.contract_address,
    } }));
  });
}
async function cmcSymbolMap(symbol: string, ctx: Context): Promise<CmcAsset[]> {
  return (await publicMarketCache(`cmc:symbol-map:v3:${normalize(symbol)}`, 86_400, async () => {
    const url = new URL(`${CMC_BASE}/v1/cryptocurrency/map`);
    url.searchParams.set("symbol", symbol.toUpperCase());
    url.searchParams.set("aux", "platform,is_active");
    const parsed = cmcMapSchema.parse(await readJson(url, ctx));
    if (parsed.status?.error_code && String(parsed.status.error_code) !== "0") throw new Error("market_upstream_api_error");
    // Keep inactive identities: a matching ticker must never become a slug fallback.
    return parsed.data.filter(coin => normalize(coin.symbol) === normalize(symbol));
  }, ctx.options)).value;
}
async function cmcActivity(coins: CmcAsset[], ctx: Context): Promise<CmcAsset[]> {
  return Promise.all(coins.map(async coin => {
    if (coin.is_active === 0 || coin.is_active === 1) return coin;
    // Metadata success establishes identity, not current listing activity.
    const matches = (await cmcSymbolMap(coin.symbol, ctx)).filter(item => item.id === coin.id);
    if (matches.length !== 1 || ![0, 1].includes(matches[0].is_active ?? -1)) throw new Error("market_activity_unverified");
    return { ...coin, is_active: matches[0].is_active };
  }));
}
async function cmcMap(asset: AssetQuery, ctx: Context): Promise<CmcAsset[]> {
  const key = `cmc:resolution:v3:${JSON.stringify(asset)}`;
  return (await publicMarketCache(key, 86_400, async () => {
    if (asset.cmcId || (asset.query && !/^[a-z0-9]{1,15}$/i.test(asset.query))) return cmcActivity(await cmcInfo(asset, ctx), ctx);
    const metadataByName = async () => cmcActivity((await cmcInfo(asset, ctx)).filter(coin =>
      [coin.name, coin.symbol, coin.slug].some(value => value && normalize(value) === normalize(asset.query!))), ctx);
    if (!asset.query) return [];
    const matches = await cmcSymbolMap(asset.query, ctx);
    return matches.length ? cmcActivity(matches, ctx) : metadataByName();
  }, ctx.options)).value;
}

type Resolution = Pick<MarketSearch, "candidates" | "reason" | "inactiveCandidates" | "error">;
class PartialResolutionError extends Error {
  constructor(readonly resolution: Resolution) { super(resolution.error); }
}
function cmcResolution(coins: CmcAsset[], network: string | null): Resolution {
  const candidates = coins.filter(coin => coin.is_active === 1).map(coin => fromCmc(coin, network));
  const inactiveCandidates = coins.filter(coin => coin.is_active === 0).map(coin => fromCmc(coin, network));
  return { candidates, ...(inactiveCandidates.length ? { inactiveCandidates,
    ...(!candidates.length ? { reason: "inactive" as const } : {}) } : {}) };
}
async function resolveCandidates(asset: AssetQuery, ctx: Context): Promise<Resolution> {
  const known = asset.coingeckoId ? canonicalAssets.find(item => item.coingeckoId === asset.coingeckoId)
    : asset.cmcId ? canonicalAssets.find(item => item.cmcId === asset.cmcId) : asset.query ? canonicalAssetForQuery(asset.query) : null;
  if (known && ((asset.cmcId && asset.cmcId !== known.cmcId)
    || (asset.coingeckoId && asset.coingeckoId !== known.coingeckoId))) return { candidates: [] };
  if (known && (asset.coingeckoId || asset.cmcId) && asset.query
    && canonicalAssetForQuery(asset.query)?.id !== known.id) return { candidates: [] };
  if (known && !asset.network && !asset.address && !asset.issuer
    && (!asset.cmcId || asset.cmcId === known.cmcId) && (!asset.coingeckoId || asset.coingeckoId === known.coingeckoId)) return { candidates: [{ ...known }] };
  const network = asset.network ? await platformId(asset.network, ctx) : null;
  const errors: unknown[] = [];
  let cgAvailable = false;
  let coins: CgCoin[] = [];
  if (!asset.cmcId || asset.coingeckoId) {
    try { coins = await cgCatalog(ctx); cgAvailable = true; } catch (error) { errors.push(error); }
  }
  if (asset.issuer) {
    if (!cgAvailable) throw errors[0] ?? new Error("market_upstream_unavailable");
    if (network !== "stellar") return { candidates: [] };
    const identity = `${asset.query!.toUpperCase()}-${asset.issuer}`;
    return { candidates: coins.filter(coin => coin.platforms.stellar === identity
      && (!asset.address || asset.address === identity)
      && (!asset.coingeckoId || coin.id === asset.coingeckoId)
      && (!asset.cmcId || canonicalAssets.some(known => known.coingeckoId === coin.id && known.cmcId === asset.cmcId)))
      .map(coin => fromCg(coin, "stellar")) };
  }
  const term = normalize(asset.query ?? "");
  let matches = coins.filter(coin => asset.coingeckoId ? coin.id === asset.coingeckoId
    : known ? coin.id === known.coingeckoId
      : !term || [coin.id, coin.name, coin.symbol].some(value => normalize(value) === term));
  if (!known && (asset.coingeckoId || asset.cmcId) && term) matches = matches.filter(coin =>
    [coin.id, coin.name, coin.symbol].some(value => normalize(value) === term));
  if (network) matches = matches.filter(coin => {
    const native = canonical.find(row => row[2] === coin.id)?.[4] === network;
    const address = coin.platforms[network];
    return asset.address ? Boolean(address && addressEqual(address, asset.address)) : Boolean(address || native);
  });
  if (matches.length && asset.cmcId) {
    const mapped = await cmcInfo({ cmcId: asset.cmcId, ...(asset.network ? { network: asset.network } : {}) }, ctx);
    const identityMatches = (coin: CgCoin, item: CmcAsset) => item.id === asset.cmcId
      && normalize(item.symbol) === normalize(coin.symbol)
      && (network && coin.platforms[network]
        ? cmcNetwork(item) === network && Boolean(item.platform?.token_address && addressEqual(coin.platforms[network]!, item.platform.token_address))
        : nameKey(item.name) === nameKey(coin.name));
    const associated = await cmcActivity(mapped.filter(item => matches.some(coin => identityMatches(coin, item))), ctx);
    const resolution = cmcResolution(associated, network);
    return { ...resolution, candidates: matches.filter(coin => associated.some(item => item.is_active === 1 && identityMatches(coin, item)))
      .map(coin => ({ ...fromCg(coin, network), cmcId: asset.cmcId! })) };
  }
  if (matches.length) return { candidates: matches.map(coin => fromCg(coin, network)) };
  if (asset.coingeckoId && cgAvailable) return { candidates: [] };
  if (asset.coingeckoId && !cgAvailable) throw errors[0] ?? new Error("market_upstream_unavailable");
  let cmcAvailable = false;
  try {
    const mapped = await cmcMap(asset, ctx); cmcAvailable = true;
    const filtered = mapped.filter(coin => {
      if (asset.cmcId && coin.id !== asset.cmcId) return false;
      if (asset.cmcId && asset.query && !known && ![coin.name, coin.symbol, coin.slug].some(value => value && normalize(value) === term)) return false;
      if (known && coin.id !== known.cmcId) return false;
      if (network) {
        const mappedNetwork = cmcNetwork(coin);
        const native = canonical.find(row => row[3] === coin.id)?.[4] === network;
        if (asset.address) return mappedNetwork === network && Boolean(coin.platform?.token_address && addressEqual(coin.platform.token_address, asset.address));
        if (mappedNetwork !== network && !native) return false;
      }
      return true;
    });
    if (filtered.length) {
      const resolution = cmcResolution(filtered, network);
      // Inactive CMC evidence does not establish absence in a failed CG catalog.
      return { ...resolution, ...(resolution.reason && errors.length ? { error: code(errors[0]) } : {}) };
    }
  } catch (error) { errors.push(error); }
  if (errors.length || (!cgAvailable && !cmcAvailable)) throw errors[0] ?? new Error("market_upstream_unavailable");
  return { candidates: [] };
}

async function searchInternal(asset: AssetQuery, limit: number, ctx: Context): Promise<MarketSearch> {
  try {
    ctx.signal.throwIfAborted();
    const cached = await abortable(publicMarketCache(`search:v3:${JSON.stringify(asset)}:${limit}`, 86_400,
      async () => {
        const resolution = await resolveCandidates(asset, ctx);
        // Preserve useful inactive evidence while preventing a failed provider's
        // aggregate result from entering the 24-hour resolution cache.
        if (resolution.error) throw new PartialResolutionError(resolution);
        return { ...resolution, candidates: resolution.candidates.slice(0, limit),
          ...(resolution.inactiveCandidates ? { inactiveCandidates: resolution.inactiveCandidates.slice(0, limit) } : {}),
          fetchedAt: new Date(ctx.now()).toISOString() };
      }, ctx.options), ctx.signal);
    ctx.signal.throwIfAborted();
    return { ...cached.value, status: cached.value.candidates.length ? "ok" : "not_found", fromCache: cached.fromCache, queriedAt: new Date(ctx.now()).toISOString() };
  } catch (error) {
    if (error instanceof PartialResolutionError) return { ...error.resolution,
      candidates: error.resolution.candidates.slice(0, limit),
      ...(error.resolution.inactiveCandidates ? { inactiveCandidates: error.resolution.inactiveCandidates.slice(0, limit) } : {}),
      status: error.resolution.reason === "inactive" ? "not_found" : "unavailable",
      fetchedAt: new Date(ctx.now()).toISOString(), queriedAt: new Date(ctx.now()).toISOString(), fromCache: false };
    return { candidates: [], status: "unavailable", fetchedAt: new Date(ctx.now()).toISOString(), queriedAt: new Date(ctx.now()).toISOString(), fromCache: false, error: code(error) };
  }
}
export async function searchMarketAssets(asset: AssetQuery, limit = 10, options: MarketOptions = {}): Promise<MarketSearch> {
  return searchInternal(assetQuerySchema.parse(asset), z.number().int().min(1).max(20).parse(limit), context(options));
}

function quoteBase(ctx: Context) {
  return { fetchedAt: new Date(ctx.now()).toISOString(), fromCache: false, dataScope: "mainnet_market_data" as const, currency: "USD" as const };
}
async function cgQuote(asset: MarketAsset, ctx: Context): Promise<MarketPrice> {
  const load = async () => {
    const ids = [...new Set((ctx.batchAssets ?? [asset]).map(item => item.coingeckoId).filter((id): id is string => Boolean(id)))];
    const url = new URL(`${CG_BASE}/coins/markets`);
    url.searchParams.set("vs_currency", "usd"); url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("price_change_percentage", "24h,7d");
    const rows = z.array(z.unknown()).max(10).parse(await readJson(url, ctx, MAX_RESPONSE_BYTES, cgHeaders()));
    return rows.flatMap(row => { const parsed = cgMarketSchema.safeParse(row); return parsed.success ? [parsed.data] : []; });
  };
  const parsed = await (ctx.cgBatch ??= load());
  const coin = parsed.find(row => row.id === asset.coingeckoId && normalize(row.symbol) === normalize(asset.symbol));
  if (!coin) throw new Error("market_quote_identity_mismatch");
  return { ...quoteBase(ctx), source: "CoinGecko", sourceUrl: asset.sourceUrl, price: coin.current_price,
    marketCap: coin.market_cap ?? null, volume24h: coin.total_volume ?? null, change24h: coin.price_change_percentage_24h ?? null,
    change7d: coin.price_change_percentage_7d_in_currency ?? null, rank: coin.market_cap_rank ?? null, updatedAt: coin.last_updated };
}
async function verifiedCmcId(asset: MarketAsset, ctx: Context) {
  if (asset.cmcId) return asset.cmcId;
  const candidates = await cmcMap({ query: asset.symbol }, ctx);
  const matches = candidates.filter(coin => {
    if (coin.is_active !== 1 || normalize(coin.symbol) !== normalize(asset.symbol)) return false;
    if (asset.address && asset.network) {
      const network = cmcNetwork(coin);
      return network === asset.network && Boolean(coin.platform?.token_address && addressEqual(asset.address, coin.platform.token_address));
    }
    return nameKey(coin.name) === nameKey(asset.name);
  });
  if (matches.length !== 1) throw new Error("market_fallback_identity_unverified");
  return matches[0].id;
}
async function cmcQuote(asset: MarketAsset, ctx: Context): Promise<MarketPrice> {
  const keyFor = (item: MarketAsset) => JSON.stringify([item.id, item.network, item.address]);
  const load = async () => {
    const assets = ctx.resolvedAssets ?? [asset];
    const identities = new Map<string, number>();
    await Promise.all(assets.map(async item => {
      try { identities.set(keyFor(item), await verifiedCmcId(item, ctx)); } catch { /* Unverified assets cannot enter a price batch. */ }
    }));
    const ids = [...new Set(identities.values())];
    if (!ids.length) throw new Error("market_fallback_identity_unverified");
    const url = new URL(`${CMC_BASE}/v3/cryptocurrency/quotes/latest`);
    url.searchParams.set("id", ids.join(",")); url.searchParams.set("convert", "USD");
    const parsed = z.object({ data: z.array(z.unknown()).max(20), status: z.object({ error_code: z.union([z.string(), z.number()]).optional() }).optional() })
      .parse(await readJson(url, ctx));
    if (parsed.status?.error_code && String(parsed.status.error_code) !== "0") throw new Error("market_upstream_api_error");
    const coins = parsed.data.flatMap(row => { const coin = cmcQuoteSchema.safeParse(row); return coin.success ? [coin.data] : []; });
    return { coins, identities };
  };
  const batch = await (ctx.cmcBatch ??= load());
  const id = batch.identities.get(keyFor(asset));
  if (!id) throw new Error("market_fallback_identity_unverified");
  const coin = batch.coins.find(row => row.id === id && normalize(row.symbol) === normalize(asset.symbol));
  const usd = coin?.quote.find(row => row.symbol === "USD");
  if (!coin || !usd) throw new Error("market_quote_identity_mismatch");
  return { ...quoteBase(ctx), source: "CoinMarketCap", sourceUrl: `https://coinmarketcap.com/currencies/${encodeURIComponent(coin.slug ?? String(id))}/`,
    price: usd.price, marketCap: usd.market_cap ?? null, volume24h: usd.volume_24h ?? null,
    change24h: usd.percent_change_24h ?? null, change7d: usd.percent_change_7d ?? null, rank: coin.cmc_rank ?? null, updatedAt: usd.last_updated };
}
async function llamaQuote(asset: MarketAsset, ctx: Context): Promise<MarketPrice> {
  const identity = asset.coingeckoId ? `coingecko:${asset.coingeckoId}`
    : asset.address && asset.network && llamaChains[asset.network] ? `${llamaChains[asset.network]}:${asset.address}` : null;
  if (!identity) throw new Error("market_fallback_identity_unverified");
  const url = new URL(`${LLAMA_BASE}/prices/current/${encodeURIComponent(identity)}`);
  const raw = z.object({ coins: z.record(z.string(), z.object({ price: nonnegative, timestamp: nonnegative,
    confidence: z.number().finite().min(0).max(1), symbol: z.string() })) }).parse(await readJson(url, ctx));
  const coin = raw.coins[identity];
  if (!coin || normalize(coin.symbol) !== normalize(asset.symbol)) throw new Error("market_quote_identity_mismatch");
  if (coin.confidence < 0.8) throw new Error("market_low_confidence");
  return { ...quoteBase(ctx), source: "DefiLlama", sourceUrl: url.href, price: coin.price,
    marketCap: null, volume24h: null, change24h: null, change7d: null, rank: null,
    updatedAt: new Date(coin.timestamp * 1_000).toISOString(), confidence: coin.confidence };
}
function isFresh(quote: MarketPrice, now: number) {
  const timestamp = quote.updatedAt ? Date.parse(quote.updatedAt) : NaN;
  return Number.isFinite(timestamp) && now - timestamp <= FRESHNESS_MS && timestamp <= now + 60_000;
}
async function price(asset: MarketAsset, ctx: Context) {
  return publicMarketCache(`quote:${JSON.stringify(asset)}`, 60, async () => {
    const providers = [...(asset.coingeckoId ? [cgQuote] : []), cmcQuote, llamaQuote];
    let stale: MarketPrice | undefined; let lastError: unknown;
    for (const provider of providers) {
      ctx.signal.throwIfAborted();
      try {
        const quote = await provider(asset, ctx);
        if (isFresh(quote, ctx.now())) return quote;
        if (quote.updatedAt && Date.parse(quote.updatedAt) > ctx.now() + 60_000) throw new Error("market_timestamp_invalid");
        stale ??= quote;
      } catch (error) { lastError = error; }
    }
    if (stale) return stale;
    throw lastError ?? new Error("market_upstream_unavailable");
  }, ctx.options);
}
async function result(request: AssetQuery, ctx: Context, prepared?: MarketSearch): Promise<MarketResult> {
  const search = prepared ?? await searchInternal(request, 20, ctx);
  if (search.status !== "ok") return { request, status: search.reason === "inactive" ? "unavailable" : search.status,
    ...(search.reason ? { reason: search.reason, inactiveCandidates: search.inactiveCandidates } : {}),
    ...(search.error ? { error: search.error } : {}) };
  if (search.candidates.length > 1) return { request, status: "ambiguous", candidates: search.candidates };
  const asset = search.candidates[0];
  try {
    const cached = await abortable(price(asset, ctx), ctx.signal); ctx.signal.throwIfAborted();
    const quote = { ...cached.value, fromCache: cached.fromCache };
    if (quote.updatedAt && Date.parse(quote.updatedAt) > ctx.now() + 60_000) return { request, asset, status: "unavailable", error: "market_timestamp_invalid" };
    return { request, asset, quote, status: isFresh(quote, ctx.now()) ? "ok" : "stale" };
  } catch (error) { return { request, asset, status: "unavailable", error: code(error) }; }
}
export async function getMarketQuotes(assets: AssetQuery[], options: MarketOptions = {}): Promise<MarketQuotes> {
  const queries = z.array(assetQuerySchema).min(1).max(10).parse(assets);
  const ctx = context(options);
  // Resolve first so one bounded CoinGecko HTTP batch covers all ten assets.
  const searches = await Promise.all(queries.map(asset => searchInternal(asset, 20, ctx)));
  ctx.resolvedAssets = searches.flatMap(search => search.status === "ok" && search.candidates.length === 1 ? search.candidates : []);
  ctx.batchAssets = ctx.resolvedAssets.filter(asset => asset.coingeckoId);
  const results = await Promise.all(queries.map((asset, index) => result(asset, ctx, searches[index])));
  return { results, fetchedAt: new Date(ctx.now()).toISOString(), queriedAt: new Date(ctx.now()).toISOString(), dataScope: "mainnet_market_data" };
}

/** Compatibility wrappers are limited to verified canonical identities. New assets
 * use the structured result above and can never be persisted by ticker alone. */
export async function getCanonicalProviderQuote(symbol: string, provider: "CoinGecko" | "CoinMarketCap", fetcher: typeof fetch = fetch) {
  const asset = canonicalAssetForQuery(symbol);
  if (!asset) throw new Error(provider === "CoinGecko" ? "coingecko_symbol_unsupported" : "cmc_asset_not_found");
  const ctx = context({ fetcher });
  const quote = await (provider === "CoinGecko" ? cgQuote : cmcQuote)(asset, ctx);
  if (!isFresh(quote, ctx.now())) throw new Error("market_quote_stale");
  return { asset, quote };
}

export async function getVerifiedCmcProviderQuote(symbol: string, fetcher: typeof fetch = fetch) {
  const ctx = context({ fetcher });
  const known = canonicalAssetForQuery(symbol);
  if (known) {
    const quote = await cmcQuote(known, ctx);
    if (!isFresh(quote, ctx.now())) throw new Error("market_quote_stale");
    return { asset: known, quote };
  }
  const matches = (await cmcMap({ query: symbol }, ctx)).filter(item => item.is_active === 1 && normalize(item.symbol) === normalize(symbol));
  if (matches.length !== 1) throw new Error(matches.length ? "cmc_asset_ambiguous" : "cmc_asset_not_found");
  const asset = fromCmc(matches[0]);
  const quote = await cmcQuote(asset, ctx);
  if (!isFresh(quote, ctx.now())) throw new Error("market_quote_stale");
  return { asset, quote };
}
