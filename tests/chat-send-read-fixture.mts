import assert from "node:assert/strict";
import { mock } from "node:test";

const dbModule = await import("../db/index");
const walletModule = await import("../app/multichain-account");
const stellarModule = await import("../app/privy-stellar");
const memoryModule = await import("../app/agent-memory-store");
const marketModule = await import("../app/market-data/service");
const schema = await import("../db/schema");
const writes: Array<{ userId?: string; role?: string; content?: string }> = [];
const query = () => Object.assign(Promise.resolve([]), {
  from: () => query(), where: () => query(), limit: () => query(), orderBy: () => query(),
  set: () => query(), onConflictDoUpdate: () => query(),
  values: (row: { userId?: string; role?: string; content?: string }) => { writes.push(row); return query(); },
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: { ...dbModule, hasDatabase: () => true, getDb: () => ({
    insert: (table: unknown) => {
      assert.ok(table === schema.agentConversations || table === schema.agentMessages, "Read chat may persist messages, never wallet/permission/connection records");
      return query();
    },
    select: query,
    update: (table: unknown) => { assert.equal(table, schema.agentConversations); return query(); },
  }) },
});
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: { ...stellarModule, getStellarTestnetAccount: async () => { assert.fail("RPC context must not run around read-only chat replies"); } },
});
mock.module(new URL("../app/multichain-account.ts", import.meta.url).href, {
  namedExports: { ...walletModule, listPersistedUserWallets: async () => [
    { id: "s", userId: "owner", address: "own-stellar", network: "stellar:testnet", status: "pending", chainType: "stellar" },
    { id: "o", userId: "owner", address: "own-solana", network: "solana:devnet", status: "active", chainType: "solana" },
    { id: "f", userId: "foreign", address: "foreign-secret", network: "stellar:testnet", status: "active", chainType: "stellar" },
  ] },
});
mock.module(new URL("../app/agent-memory-store.ts", import.meta.url).href, {
  namedExports: { ...memoryModule,
    retrieveRelevantAgentMemory: async () => { assert.fail("Read chat must not trigger ancillary memory/schema preparation"); },
    ensureAgentVaultSchema: async () => { assert.fail("Read chat must not provision a schema"); },
  },
});
const reads: string[] = [];
mock.module(new URL("../app/agent-chat-balances.ts", import.meta.url).href, {
  namedExports: { readChatNativeBalance: async (_network: string, address: string) => {
    reads.push(address);
    if (address === "own-stellar") throw new Error("rpc_unavailable");
    return "0 SOL";
  } },
});
const quoteRequests: unknown[] = [];
const quoteTimestamp = "2026-10-01T00:00:00Z";
const catalogAsset = (cmcId: number, symbol: string, name: string, slug: string) => ({
  id: `coinmarketcap:${cmcId}`, name, symbol, coingeckoId: null, cmcId, network: null,
  address: null, issuer: null, sourceUrl: `https://coinmarketcap.com/currencies/${slug}/`,
});
mock.module(new URL("../app/market-data/service.ts", import.meta.url).href, {
  namedExports: { ...marketModule, getMarketQuotes: async (assets: Array<{ query?: string; network?: string }>) => {
    quoteRequests.push(assets);
    return { results: assets.map(request => {
      if (request.query === "FAIL") return { request, status: "unavailable", error: "market_upstream_unavailable" };
      if (request.query === "PAY") return { request, status: "unavailable", reason: "inactive", error: "market_upstream_http_503",
        inactiveCandidates: [catalogAsset(1758, "PAY", "TenX", "tenx")] };
      if (request.query === "AI") return { request, status: "ambiguous",
        candidates: [catalogAsset(101, "AI", "Alpha AI", "alpha-ai"), catalogAsset(102, "AI", "Beta AI", "beta-ai")] };
      if (request.query === "unknown-pilot-token") return { request, status: "not_found" };
      return { request, status: "ok", asset: { id: "coingecko:usd-coin", name: "USDC", symbol: "USDC", coingeckoId: "usd-coin", cmcId: null, network: request.network ?? null, address: "verified-usdc-mint", issuer: null, sourceUrl: "https://www.coingecko.com/en/coins/usd-coin" }, quote: { currency: "USD", price: 1, marketCap: 100, volume24h: 10, change24h: null, change7d: null, rank: null, source: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/usd-coin", updatedAt: quoteTimestamp, fetchedAt: quoteTimestamp, fromCache: false, dataScope: "mainnet_market_data" } };
    }),
      dataScope: "mainnet_market_data", queriedAt: quoteTimestamp, fetchedAt: quoteTimestamp };
  } },
});
globalThis.fetch = async () => { assert.fail("Fixture must use controlled services, never a network or unrelated Stellar query"); };
const { sendAgentMessage } = await import("../app/agent-chat-store");
const listing = await sendAgentMessage("owner", "Dame mis wallets");
assert.match(listing.assistantMessage.content, /own-stellar/);
assert.match(listing.assistantMessage.content, /own-solana/);
assert.doesNotMatch(listing.assistantMessage.content, /foreign-secret/);
assert.deepEqual(reads, []);
assert.equal(listing.wallet, null);
const balances = await sendAgentMessage("owner", "Muéstrame mis saldos");
assert.match(balances.assistantMessage.content, /stellar:testnet: Saldo no disponible/);
assert.doesNotMatch(balances.assistantMessage.content, /stellar:testnet: 0/);
assert.match(balances.assistantMessage.content, /0 SOL/);
assert.deepEqual([...reads].sort(), ["own-solana", "own-stellar"]);
assert.equal(balances.wallet, null);
assert.ok(writes.some(row => row.role === "assistant" && row.content === balances.assistantMessage.content));
assert.ok(writes.every(row => row.userId === "owner"));

const naturalRequests: unknown[] = [];
const naturalStart = quoteRequests.length;
for (const [locale, question, usdcQuestion, scopeLabel, inactive, partial, ambiguous, absent] of [
  ["es", "¿Cuál es el precio de", "¿Cuál es el precio de USDC en Solana?", /Datos de mercado Mainnet/, /inactivos/, /Consulta parcial/, /varios activos/i, /catálogos consultados/],
  ["en", "What is the price of", "What is the price of USDC on Solana?", /Mainnet market data/, /inactive/, /Partial query/, /Several assets/, /catalogs consulted/],
  ["pt", "Qual é o preço de", "Qual é o preço de USDC na Solana?", /Dados de mercado Mainnet/, /inativos/, /Consulta parcial/, /Vários ativos/, /catálogos consultados/],
] as const) {
  for (const asset of ["PAY", "AI", "unknown-pilot-token", "USDC"] as const) {
    const result = await sendAgentMessage("owner", asset === "USDC" ? usdcQuestion : `${question} ${asset}?`, locale);
    naturalRequests.push([{ query: asset, ...(asset === "USDC" ? { network: "solana" } : {}) }]);
    const response = result.assistantMessage.content;
    assert.match(response, scopeLabel);
    assert.match(response, /2026-10-01T00:00:00Z/);
    if (asset === "PAY") {
      assert.match(response, inactive);
      assert.match(response, partial);
      assert.match(response, /coinmarketcap:1758/);
      assert.match(response, /CoinMarketCap/);
      assert.doesNotMatch(response, /\*\*\$|1\.00/);
    } else if (asset === "AI") {
      assert.match(response, ambiguous);
      assert.match(response, /coinmarketcap:101/);
      assert.match(response, /coinmarketcap:102/);
      assert.doesNotMatch(response, /\*\*\$|1\.00/);
    } else if (asset === "unknown-pilot-token") {
      assert.match(response, absent);
      assert.match(response, /unknown-pilot-token/);
      assert.doesNotMatch(response, /\*\*\$|1\.00/);
    } else {
      assert.match(response, /coingecko:usd-coin/);
      assert.match(response, /solana/);
      assert.match(response, /CoinGecko/);
    }
    assert.equal(result.wallet, null);
    assert.deepEqual(result.assistantMessage.actions, []);
    for (const intent of ["defindexIntent", "x402Intent", "soroswapIntent", "decision", "planner"]) {
      assert.equal(result.assistantMessage[intent as keyof typeof result.assistantMessage], undefined, `Natural market question populated ${intent}`);
    }
  }
}
assert.deepEqual(quoteRequests.slice(naturalStart), naturalRequests);
const inferredSpanish = await sendAgentMessage("owner", "¿Cuál es el precio de PAY?");
assert.match(inferredSpanish.assistantMessage.content, /Datos de mercado Mainnet/);
const selectedSpanish = await sendAgentMessage("owner", "What is the price of PAY?", "es");
assert.match(selectedSpanish.assistantMessage.content, /Datos de mercado Mainnet/);
for (const [message, scope] of [["PAY price", /Mainnet market data/], ["PAY precio", /Datos de mercado Mainnet/], ["PAY preço", /Dados de mercado Mainnet/]] as const) {
  const result = await sendAgentMessage("owner", message);
  assert.match(result.assistantMessage.content, scope);
  assert.match(result.assistantMessage.content, /coinmarketcap:1758/);
  assert.equal(result.wallet, null);
  assert.deepEqual(result.assistantMessage.actions, []);
  for (const intent of ["defindexIntent", "x402Intent", "soroswapIntent", "decision", "planner"]) {
    assert.equal(result.assistantMessage[intent as keyof typeof result.assistantMessage], undefined);
  }
}
assert.deepEqual([...reads].sort(), ["own-solana", "own-stellar"]);
assert.ok(writes.every(row => row.userId === "owner"));
const explicitStart = quoteRequests.length;
for (const [locale, scopeLabel, missing] of [
  ["es", "Datos de mercado Mainnet", "La fuente no pudo devolver un dato verificado"],
  ["en", "Mainnet market data", "The source could not return verified data"],
  ["pt", "Dados de mercado Mainnet", "A fonte não retornou um dado verificado"],
] as const) {
  const market = await sendAgentMessage("owner", '/query get_market_quotes {"assets":[{"query":"USDC","network":"solana"},{"query":"FAIL"}]}', locale);
  assert.match(market.assistantMessage.content, new RegExp(scopeLabel));
  assert.match(market.assistantMessage.content, new RegExp(missing));
  assert.match(market.assistantMessage.content, /coingecko:usd-coin/);
  assert.match(market.assistantMessage.content, /solana/);
  assert.match(market.assistantMessage.content, /CoinGecko/);
  assert.match(market.assistantMessage.content, /2026-10-01T00:00:00Z/);
  assert.equal(market.wallet, null);
  assert.deepEqual(market.assistantMessage.actions, []);
  assert.equal(market.assistantMessage.defindexIntent, undefined);
  assert.equal(market.assistantMessage.x402Intent, undefined);
}
assert.deepEqual(quoteRequests.slice(explicitStart), Array.from({ length: 3 }, () => [{ query: "USDC", network: "solana" }, { query: "FAIL" }]));
assert.deepEqual([...reads].sort(), ["own-solana", "own-stellar"]);
assert.ok(writes.every(row => row.userId === "owner"));
