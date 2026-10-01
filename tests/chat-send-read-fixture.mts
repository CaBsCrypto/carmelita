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
mock.module(new URL("../app/market-data/service.ts", import.meta.url).href, {
  namedExports: { ...marketModule, getMarketQuotes: async (assets: Array<{ query?: string; network?: string }>) => {
    quoteRequests.push(assets);
    return { results: assets.map(request => request.query === "FAIL"
      ? { request, status: "unavailable", error: "market_upstream_unavailable" }
      : { request, status: "ok", asset: { id: "coingecko:usd-coin", name: "USDC", symbol: "USDC", coingeckoId: "usd-coin", cmcId: null, network: request.network ?? null, address: "verified-usdc-mint", issuer: null, sourceUrl: "https://www.coingecko.com/en/coins/usd-coin" }, quote: { currency: "USD", price: 1, marketCap: 100, volume24h: 10, change24h: null, change7d: null, rank: null, source: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/usd-coin", updatedAt: quoteTimestamp, fetchedAt: quoteTimestamp, fromCache: false, dataScope: "mainnet_market_data" } }),
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
assert.deepEqual(quoteRequests, Array.from({ length: 3 }, () => [{ query: "USDC", network: "solana" }, { query: "FAIL" }]));
assert.deepEqual([...reads].sort(), ["own-solana", "own-stellar"]);
assert.ok(writes.every(row => row.userId === "owner"));
