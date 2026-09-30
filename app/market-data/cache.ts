import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import type { MarketOptions } from "./types";

type Entry = { expiresAt: number; value: Promise<unknown> };
const publicProcessCache = new Map<string, Entry>();
let testCaches = new WeakMap<typeof fetch, Map<string, Entry>>();

function cacheFor(options: MarketOptions) {
  if (!options.fetcher || options.fetcher === fetch) return publicProcessCache;
  let cache = testCaches.get(options.fetcher);
  if (!cache) { cache = new Map(); testCaches.set(options.fetcher, cache); }
  return cache;
}

/** Raw provider catalogs exceed the Vercel Data Cache item limit. Keep these
 * bounded catalogs in process; their compact public search results use Data Cache. */
export async function processMarketCache<T>(
  key: string, ttlSeconds: number, loader: () => Promise<T>, options: MarketOptions = {},
): Promise<{ value: T; fromCache: boolean }> {
  const cache = cacheFor(options);
  const now = options.now?.() ?? Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return { value: structuredClone(await existing.value) as T, fromCache: true };
  }
  const value = loader();
  const entry = { expiresAt: now + ttlSeconds * 1_000, value };
  cache.set(key, entry);
  try { return { value: structuredClone(await value), fromCache: false }; }
  catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}

/** Only public market metadata enters this cache. Never pass user IDs or tokens. */
export async function publicMarketCache<T>(
  key: string, ttlSeconds: number, loader: () => Promise<T>, options: MarketOptions = {},
): Promise<{ value: T; fromCache: boolean }> {
  if (options.fetcher && options.fetcher !== fetch) {
    return processMarketCache(`public:${key}`, ttlSeconds, loader, options);
  }
  const now = options.now?.() ?? Date.now();
  const bucket = Math.floor(now / (ttlSeconds * 1_000));
  let generated: string | undefined;
  const cached = unstable_cache(async () => {
    const value = await loader(); generated = randomUUID();
    return { value, cachedAt: options.now?.() ?? Date.now(), generation: generated };
  }, ["carmelita-public-market-v2", key, String(bucket)], { revalidate: ttlSeconds * 2 });
  try {
    const envelope = await cached();
    const age = (options.now?.() ?? Date.now()) - envelope.cachedAt;
    // Bucketed keys prevent Next's stale-while-revalidate path from serving an
    // expired quote/catalog. The envelope is an additional clock/integrity gate.
    if (age < 0 || age >= ttlSeconds * 1_000) {
      return processMarketCache(`refresh:${key}:${bucket}`, ttlSeconds, loader, options);
    }
    return { value: structuredClone(envelope.value), fromCache: envelope.generation !== generated };
  }
  catch (error) {
    // Read-only diagnostics can run outside a Next request without an IncrementalCache.
    if (error instanceof Error && /incrementalCache missing|incremental cache.*missing/i.test(error.message)) {
      return processMarketCache(`public:${key}`, ttlSeconds, loader, options);
    }
    throw error;
  }
}

export function clearMarketTestCache(fetcher?: typeof fetch) {
  if (fetcher) testCaches.delete(fetcher);
  else { testCaches = new WeakMap(); publicProcessCache.clear(); }
}
