import assert from "node:assert/strict";
import { mock } from "node:test";

const dbModule = await import("../db/index");
const walletModule = await import("../app/multichain-account");
const stellarModule = await import("../app/privy-stellar");
const memoryModule = await import("../app/agent-memory-store");
const writes: Array<{ userId?: string; role?: string; content?: string }> = [];
const query = () => Object.assign(Promise.resolve([]), {
  from: () => query(), where: () => query(), limit: () => query(),
  set: () => query(), onConflictDoUpdate: () => query(),
  values: (row: { userId?: string; role?: string; content?: string }) => { writes.push(row); return query(); },
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: { ...dbModule, hasDatabase: () => true, getDb: () => ({ insert: query, select: query, update: query }) },
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
  namedExports: { ...memoryModule, retrieveRelevantAgentMemory: async () => ({ items: [], domains: [] }) },
});
const reads: string[] = [];
mock.module(new URL("../app/agent-chat-balances.ts", import.meta.url).href, {
  namedExports: { readChatNativeBalance: async (_network: string, address: string) => {
    reads.push(address);
    if (address === "own-stellar") throw new Error("rpc_unavailable");
    return "0 SOL";
  } },
});
const { sendAgentMessage } = await import("../app/agent-chat-store");
const listing = await sendAgentMessage("owner", "Dame mis wallets");
assert.match(listing.assistantMessage.content, /own-stellar/);
assert.match(listing.assistantMessage.content, /own-solana/);
assert.doesNotMatch(listing.assistantMessage.content, /foreign-secret/);
assert.deepEqual(reads, []);
assert.equal(listing.wallet, null);
const balances = await sendAgentMessage("owner", "Muéstrame mis saldos");
assert.match(balances.assistantMessage.content, /Saldo no disponible/);
assert.match(balances.assistantMessage.content, /0 SOL/);
assert.deepEqual(reads, ["own-stellar", "own-solana"]);
assert.equal(balances.wallet, null);
assert.ok(writes.some(row => row.role === "assistant" && row.content === balances.assistantMessage.content));
assert.ok(writes.every(row => row.userId === "owner"));
