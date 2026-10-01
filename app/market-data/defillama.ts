import { z } from "zod";
import { publicMarketCache } from "./cache";
import { getMarketQuotes } from "./service";
import { chainComparisonInputSchema } from "./types";
import type { ChainComparison, ChainComparisonInput, ChainRow, MarketAsset, MarketOptions, MarketResult } from "./types";

const CHAINS_URL = "https://api.llama.fi/v2/chains";
const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 20_000;
const coinIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const chainsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(80),
  tvl: z.number().finite().nonnegative().nullable(),
  gecko_id: coinIdSchema.nullable().optional(),
  gasTokenGeckoId: coinIdSchema.nullable().optional(),
  tokenSymbol: z.string().max(120).nullable().optional(),
  cmcId: z.union([z.string().regex(/^[1-9]\d{0,14}$/), z.number().int().positive().safe()]).nullable().optional(),
  chainId: z.union([z.string().min(1).max(80), z.number().int().nonnegative()]).nullable().optional(),
})).min(1).max(5000);
type ProviderChain = z.infer<typeof chainsSchema>[number];

function normalizedChain(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    avax: "avalanche", bnb: "bsc", bnbchain: "bsc", bnbsmartchain: "bsc",
    binance: "bsc", binancesmartchain: "bsc", sol: "solana", xlm: "stellar", eth: "ethereum",
  };
  return aliases[key] ?? key;
}

function abortedError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error && signal.reason.message === "market_data_deadline_exceeded") return new Error("market_data_deadline_exceeded");
  return new Error(signal.reason instanceof Error && signal.reason.name === "TimeoutError" ? "defillama_timeout" : "market_request_aborted");
}

function withinDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortedError(signal));
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(abortedError(signal));
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function readChains(options: MarketOptions, signal: AbortSignal): Promise<ProviderChain[]> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
  const response = await withinDeadline((options.fetcher ?? fetch)(CHAINS_URL, {
    method: "GET", headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit", redirect: "error", signal,
  }), signal);
  if (!response.ok) throw new Error(response.status === 429 ? "defillama_rate_limited" : "defillama_unavailable");
  if (!/application\/(?:[^;]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error("defillama_invalid_response");
  }
  const length = Number(response.headers.get("content-length"));
  if (length > RESPONSE_LIMIT_BYTES) throw new Error("defillama_response_too_large");
  const reader = response.body?.getReader();
  let bytes = 0;
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await withinDeadline(reader.read(), signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > RESPONSE_LIMIT_BYTES) throw new Error("defillama_response_too_large");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      if (signal.aborted || bytes > RESPONSE_LIMIT_BYTES) void reader.cancel().catch(() => undefined);
      try { reader.releaseLock(); } catch { /* A cancelled read may still be settling. */ }
    }
  } else {
    text = await withinDeadline(response.text(), signal);
    if (new TextEncoder().encode(text).byteLength > RESPONSE_LIMIT_BYTES) throw new Error("defillama_response_too_large");
  }
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new Error("defillama_invalid_response"); }
  const parsed = chainsSchema.safeParse(payload);
  if (!parsed.success) throw new Error("defillama_invalid_response");
  const uniqueNames = new Map<string, ProviderChain>();
  for (const chain of parsed.data) {
    const key = normalizedChain(chain.name);
    if (!uniqueNames.has(key)) uniqueNames.set(key, chain);
  }
  return [...uniqueNames.values()];
}

function associatedToken(chain: ProviderChain): MarketAsset | null {
  if (!chain.gecko_id) return null;
  return {
    id: `coingecko:${chain.gecko_id}`, name: chain.tokenSymbol || chain.gecko_id,
    symbol: chain.tokenSymbol || "", coingeckoId: chain.gecko_id,
    cmcId: chain.cmcId ? Number(chain.cmcId) : null,
    network: null, address: null, issuer: null,
    sourceUrl: `https://www.coingecko.com/en/coins/${encodeURIComponent(chain.gecko_id)}`,
  };
}

function descendingNullable(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

function tvlOrder(a: ProviderChain, b: ProviderChain): number {
  return descendingNullable(a.tvl, b.tvl) || a.name.localeCompare(b.name, "en");
}

async function chainQuotes(chains: ProviderChain[], options: MarketOptions, signal: AbortSignal): Promise<Map<string, MarketResult>> {
  const ids = [...new Set(chains.flatMap(chain => chain.gecko_id ? [chain.gecko_id] : []))];
  const batches = Array.from({ length: Math.ceil(ids.length / 10) }, (_, index) => ids.slice(index * 10, index * 10 + 10));
  const results = new Map<string, MarketResult>();
  let nextBatch = 0;
  const worker = async () => {
    while (nextBatch < batches.length && !signal.aborted) {
      const batch = batches[nextBatch++];
      try {
        const quotes = await withinDeadline(getMarketQuotes(batch.map(coingeckoId => ({ coingeckoId })), { ...options, signal }), signal);
        for (const result of quotes.results) {
          const id = result.request.coingeckoId;
          if (id && batch.includes(id)) results.set(id, result);
        }
      } catch (error) {
        for (const coingeckoId of batch) {
          results.set(coingeckoId, {
            request: { coingeckoId }, status: "unavailable",
            error: signal.aborted ? abortedError(signal).message : safeError(error, "market_data_unavailable"),
          });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));
  for (const coingeckoId of ids) {
    if (!results.has(coingeckoId)) results.set(coingeckoId, {
      request: { coingeckoId }, status: "unavailable",
      error: signal.aborted ? abortedError(signal).message : "market_data_unavailable",
    });
  }
  return results;
}

function safeError(error: unknown, fallback: string): string {
  const known = new Set([
    "defillama_rate_limited", "defillama_unavailable", "defillama_invalid_response", "defillama_response_too_large",
    "market_data_deadline_exceeded", "market_request_aborted", "market_data_unavailable",
    "defillama_timeout",
  ]);
  return error instanceof Error && known.has(error.message) ? error.message : fallback;
}

/** TVL and associated-token capitalization are separate mainnet metrics; gas tokens are never substitutes. */
export async function compareChains(input: ChainComparisonInput, options: MarketOptions = {}): Promise<ChainComparison> {
  const parsed = chainComparisonInputSchema.safeParse(input);
  const fetchedAt = () => new Date((options.now ?? Date.now)()).toISOString();
  const empty = (error: string): ChainComparison => ({
    rows: [], sortBy: parsed.success ? parsed.data.sortBy : "tvl", totalChains: 0,
    missingChains: parsed.success ? parsed.data.chains ?? [] : [], tvlFetchedAt: fetchedAt(),
    queriedAt: fetchedAt(),
    quotedChains: 0, unavailableChains: 0, failures: [], status: "unavailable",
    tvlFromCache: false, tvlUpdatedAt: null, dataScope: "mainnet_market_data", error,
  });
  if (!parsed.success) return empty("invalid_chain_comparison_input");
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("market_data_deadline_exceeded")), DEADLINE_MS);
  timer.unref?.();
  try {
    if (controller.signal.aborted) return empty(abortedError(controller.signal).message);
    const cached = await withinDeadline(publicMarketCache("defillama:chains:v1", 300, async () => ({
      chains: await readChains(options, controller.signal), fetchedAt: fetchedAt(),
    }), options), controller.signal);
    const requested = parsed.data.chains ? new Set(parsed.data.chains.map(normalizedChain)) : null;
    const chains = cached.value.chains.filter(chain => !requested || requested.has(normalizedChain(chain.name)));
    const present = new Set(chains.map(chain => normalizedChain(chain.name)));
    const missingChains = [...new Set(parsed.data.chains ?? [])].filter(chain => !present.has(normalizedChain(chain)));
    const selected = parsed.data.sortBy === "tvl" ? [...chains].sort(tvlOrder).slice(0, parsed.data.limit) : chains;
    const quotes = await chainQuotes(selected, options, controller.signal);
    const rows: ChainRow[] = selected.map(chain => {
      const token = associatedToken(chain);
      const result = chain.gecko_id ? quotes.get(chain.gecko_id) : undefined;
      const cap = result?.status === "ok" ? result.quote?.marketCap : null;
      return {
        name: chain.name, chainId: chain.chainId ?? null, tvl: chain.tvl,
        associatedToken: result?.asset ?? token, gasTokenId: chain.gasTokenGeckoId ?? null,
        marketCap: typeof cap === "number" && Number.isFinite(cap) && cap >= 0 ? cap : null,
        quoteStatus: token ? result?.status ?? "unavailable" : "no_associated_token",
        ...(result?.error ? { quoteError: result.error } : {}),
        marketSource: result?.quote ?? null,
        tvlSourceUrl: `https://defillama.com/chain/${encodeURIComponent(chain.name)}`,
      };
    });
    // Coverage belongs to the entire quoted universe, before a global ranking is truncated.
    const quotedChains = rows.filter(row => row.associatedToken && row.quoteStatus === "ok" && row.marketCap !== null).length;
    const failures: ChainComparison["failures"] = rows.filter(row => row.associatedToken && row.marketCap === null).map(row => ({
      chain: row.name,
      status: row.quoteStatus === "ok" ? "missing_market_cap" : row.quoteStatus as MarketResult["status"],
      ...(row.quoteError ? { error: row.quoteError } : {}),
    }));
    const unavailableChains = failures.length;
    const usableData = rows.some(row => row.tvl !== null || row.marketCap !== null);
    const status: ChainComparison["status"] = !usableData ? "unavailable"
      : unavailableChains || missingChains.length || controller.signal.aborted ? "partial" : "ok";
    if (parsed.data.sortBy === "marketCap") rows.sort((a, b) => descendingNullable(a.marketCap, b.marketCap) || a.name.localeCompare(b.name, "en"));
    return {
      rows: rows.slice(0, parsed.data.limit), sortBy: parsed.data.sortBy, totalChains: chains.length, missingChains,
      tvlFetchedAt: cached.value.fetchedAt, tvlFromCache: cached.fromCache, tvlUpdatedAt: null,
      queriedAt: fetchedAt(),
      quotedChains, unavailableChains, failures, status,
      dataScope: "mainnet_market_data",
      ...(controller.signal.aborted ? { error: abortedError(controller.signal).message } : {}),
    };
  } catch (error) {
    return empty(controller.signal.aborted ? abortedError(controller.signal).message : safeError(error, "defillama_unavailable"));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
