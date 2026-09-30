import assert from "node:assert/strict";
import { mock } from "node:test";
import type { AssetQuery, ChainComparisonInput, MarketAsset, MarketQuotes } from "../app/market-data/types";

const dbModule = await import("../db/index");
const walletModule = await import("../app/multichain-account");
const stellarModule = await import("../app/privy-stellar");
const memoryModule = await import("../app/agent-memory-store");
const marketModule = await import("../app/market-data/service");
const chainsModule = await import("../app/market-data/defillama");
const watchlistModule = await import("../app/connectors/coinmarketcap");
const writes: Array<{ userId?: string; role?: string; content?: string; metadata?: Record<string, unknown> }> = [];
const query = () => Object.assign(Promise.resolve([]), {
  from: () => query(), where: () => query(), limit: () => query(),
  set: () => query(), onConflictDoUpdate: () => query(),
  values: (row: typeof writes[number]) => { writes.push(row); return query(); },
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: { ...dbModule, hasDatabase: () => true, getDb: () => ({ insert: query, select: query, update: query }) },
});
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: { ...stellarModule, getStellarTestnetAccount: async () => { assert.fail("Market data must not read a wallet RPC"); } },
});
mock.module(new URL("../app/multichain-account.ts", import.meta.url).href, {
  namedExports: { ...walletModule, listPersistedUserWallets: async () => { assert.fail("Market data must not read or create wallets"); } },
});
mock.module(new URL("../app/agent-memory-store.ts", import.meta.url).href, {
  namedExports: { ...memoryModule, retrieveRelevantAgentMemory: async () => ({ items: [], domains: [] }) },
});
const assetsCalls: AssetQuery[][] = [];
const watchlistWrites: Array<{ userId: string; symbol: string }> = [];
mock.module(new URL("../app/connectors/coinmarketcap.ts", import.meta.url).href, {
  namedExports: { ...watchlistModule, listMarketWatchlist: async () => [], addToMarketWatchlist: async (userId: string, symbol: string) => { watchlistWrites.push({ userId, symbol }); return symbol; } },
});
const chainCalls: ChainComparisonInput[] = [];
const fetchedAt = "2026-09-30T08:00:00.000Z";
const candidate = (id: string): MarketAsset => ({ id: `coingecko:${id}`, name: id, symbol: "PEPE", coingeckoId: id, cmcId: null, network: null, address: null, issuer: null, sourceUrl: `https://www.coingecko.com/en/coins/${id}` });
mock.module(new URL("../app/market-data/service.ts", import.meta.url).href, {
  namedExports: { ...marketModule, getMarketQuotes: async (assets: AssetQuery[]): Promise<MarketQuotes> => {
    assetsCalls.push(assets);
    return { queriedAt: fetchedAt, fetchedAt, dataScope: "mainnet_market_data", results: assets.map(request => request.query === "pepe" ? {
      request, status: "ambiguous", candidates: [candidate("pepe-one"), candidate("pepe-two"), candidate("pepe-three"), candidate("pepe-four"), candidate("pepe-five"), { ...candidate("pepe-six"), id: "coinmarketcap:123456", coingeckoId: null, cmcId: 123456 }],
    } : { request, status: "ok", asset: { id: request.query === "XLM" ? "coingecko:stellar" : "coingecko:usd-coin", name: request.query === "XLM" ? "Stellar" : "USDC", symbol: request.query === "XLM" ? "XLM" : "USDC", coingeckoId: request.query === "XLM" ? "stellar" : "usd-coin", cmcId: request.query === "XLM" ? 512 : 3408, network: request.network ?? null, address: null, issuer: null, sourceUrl: "https://www.coingecko.com/en/coins/usd-coin" },
      quote: { currency: "USD", price: 1, marketCap: request.query === "XLM" ? null : 123, volume24h: 45, change24h: 0, change7d: null, rank: null, source: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/usd-coin", updatedAt: fetchedAt, fetchedAt, fromCache: false, dataScope: "mainnet_market_data" },
    }) };
  } },
});
mock.module(new URL("../app/market-data/defillama.ts", import.meta.url).href, {
  namedExports: { ...chainsModule, compareChains: async (input: ChainComparisonInput) => {
    chainCalls.push(input);
    return { rows: [{ name: "Base", chainId: 8453, tvl: 1000, associatedToken: null, gasTokenId: "ethereum", marketCap: null, quoteStatus: "no_associated_token", marketSource: null, tvlSourceUrl: "https://defillama.com/chain/Base" }], status: "ok", quotedChains: 0, unavailableChains: 0, failures: [], sortBy: input.sortBy, totalChains: 1, missingChains: [], queriedAt: fetchedAt, tvlFetchedAt: fetchedAt, tvlFromCache: false, tvlUpdatedAt: null, dataScope: "mainnet_market_data" };
  } },
});
const { sendAgentMessage } = await import("../app/agent-chat-store");
const quote = await sendAgentMessage("owner", "¿Cuál es el precio de USDC en Solana?", "es");
assert.deepEqual(assetsCalls[0], [{ query: "USDC", network: "solana" }]);
assert.match(quote.assistantMessage.content, /Datos de mercado Mainnet/);
assert.match(quote.assistantMessage.content, /CoinGecko/);
assert.match(quote.assistantMessage.content, /Fecha del dato/);
assert.equal(quote.wallet, null);
const comparison = await sendAgentMessage("owner", "Compara Stellar, Solana, Avalanche, Base y BNB por TVL y capitalización", "pt");
assert.deepEqual(chainCalls[0].chains, ["stellar", "solana", "avalanche", "base", "bsc"]);
assert.match(comparison.assistantMessage.content, /Dados de mercado Mainnet/);
assert.match(comparison.assistantMessage.content, /Sem token associado/);
assert.equal(comparison.wallet, null);
const ambiguous = await sendAgentMessage("owner", "Precio de pepe", "en");
assert.match(ambiguous.assistantMessage.content, /Several assets/);
assert.deepEqual(ambiguous.assistantMessage.actions?.map(action => action.draftOnly), [true, true, true, true, true, true]);
assert.deepEqual(ambiguous.assistantMessage.actions?.map(action => action.message), ["Price coingecko:pepe-one", "Price coingecko:pepe-two", "Price coingecko:pepe-three", "Price coingecko:pepe-four", "Price coingecko:pepe-five", "Price cmc:123456"]);
assert.match(ambiguous.assistantMessage.content, /coinmarketcap:123456/);
assert.match(ambiguous.assistantMessage.actions?.[5].label ?? "", /cmc:123456/);
const invalid = await sendAgentMessage("owner", "precio " + Array.from({ length: 11 }, (_, i) => `T${i}`).join(","), "es");
assert.match(invalid.assistantMessage.content, /hasta 10 activos/);
assert.equal(assetsCalls.length, 2);
const testnet = await sendAgentMessage("owner", "Precio SOL en Solana devnet", "es");
assert.match(testnet.assistantMessage.content, /No se asigna un precio a fondos Testnet/);
assert.equal(assetsCalls.length, 2);
for (const message of ["Agrega pepe a mi watchlist", "Agrega USDC 0x1234567890123456789012345678901234567890 a mi watchlist"]) {
  const watchlist = await sendAgentMessage("owner", message, "es");
  assert.match(watchlist.assistantMessage.content, /no se añadió ninguna entrada/);
}
assert.equal(assetsCalls.length, 2);
assert.deepEqual(watchlistWrites, []);
const emptyWatchlist = await sendAgentMessage("owner", "Muéstrame mi watchlist", "es");
assert.deepEqual(emptyWatchlist.assistantMessage.actions?.map(action => action.label), ["Añadir XLM", "Añadir BTC"]);
assert.deepEqual(emptyWatchlist.assistantMessage.actions?.map(action => action.message), ["Agrega XLM a mi watchlist", "Agrega BTC a mi watchlist"]);
const addWatchlist = await sendAgentMessage("owner", "Agrega XLM a mi watchlist", "es");
assert.deepEqual(watchlistWrites, [{ userId: "owner", symbol: "XLM" }]);
assert.deepEqual(addWatchlist.assistantMessage.actions?.map(action => action.label), ["Mostrar watchlist", "Consultar otro activo"]);
assert.deepEqual(addWatchlist.assistantMessage.actions?.map(action => action.message), ["Muéstrame mi watchlist de criptomonedas", "Consulta el precio de BTC e indica la fuente y la fecha."]);
assert.match(addWatchlist.assistantMessage.content, /Datos de mercado Mainnet/);
assert.match(addWatchlist.assistantMessage.content, /Capitalización del token: No disponible/);
assert.match(addWatchlist.assistantMessage.content, /Fecha del dato/);
assert.ok(writes.every(row => row.userId === "owner"));
assert.ok(writes.filter(row => row.role === "assistant").every(row => !row.metadata?.walletAction && !row.metadata?.defindexIntent && !row.metadata?.x402Intent && !row.metadata?.soroswapIntent));
