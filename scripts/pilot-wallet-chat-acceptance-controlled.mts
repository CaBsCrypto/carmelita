import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";

// Controlled integration regression: no connection/env files or real network calls.
const [targetArgument, expected] = process.argv.slice(2);
assert.ok(targetArgument && /^[a-f0-9]{40}$/.test(expected ?? ""), "target_and_full_commit_required");
const target = resolve(targetArgument);
const git = (...args: string[]) => execFileSync("git", args, { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const before = { source: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
assert.equal(before.source, expected, "candidate_source_mismatch");
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "candidate_source_dirty");
const moduleUrl = (file: string) => pathToFileURL(join(target, file)).href;
for (const key of Object.keys(process.env)) {
  if (/DATABASE|POSTGRES|NEON|STYTCH|PRIVY|API_KEY|ACCESS_TOKEN|CLIENT_SECRET/.test(key)) delete process.env[key];
}
process.env.VERCEL_ENV = "preview";
process.env.CARMELITA_PREVIEW_ISOLATED = "true";
process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED = "true";
let blockedNetworkAttempts = 0;
globalThis.fetch = async () => { blockedNetworkAttempts++; assert.fail("controlled_fixture_forbids_network"); };

const dbModule = await import(moduleUrl("db/index.ts"));
const schema = await import(moduleUrl("db/schema.ts"));
const writes: Array<{ userId?: string; role?: string; content?: string }> = [];
type ControlledQuery = Promise<unknown[]> & {
  from: () => ControlledQuery; where: () => ControlledQuery; limit: () => ControlledQuery;
  orderBy: () => ControlledQuery; set: () => ControlledQuery; onConflictDoUpdate: () => ControlledQuery;
  values: (row: { userId?: string; role?: string; content?: string }) => ControlledQuery;
};
const query = (): ControlledQuery => Object.assign(Promise.resolve([]), {
  from: () => query(), where: () => query(), limit: () => query(), orderBy: () => query(),
  set: () => query(), onConflictDoUpdate: () => query(),
  values: (row: { userId?: string; role?: string; content?: string }) => { writes.push(row); return query(); },
});
mock.module(moduleUrl("db/index.ts"), { namedExports: { ...dbModule, hasDatabase: () => true, getDb: () => ({
  insert: (table: unknown) => {
    assert.ok(table === schema.agentConversations || table === schema.agentMessages, "chat_may_persist_messages_only");
    return query();
  },
  select: query,
  update: (table: unknown) => { assert.equal(table, schema.agentConversations, "no_registry_or_financial_update"); return query(); },
}) } });

// Synthetic addresses: fixtures represent five associations of three identities.
const evm = "0x1111111111111111111111111111111111111111";
const solana = "11111111111111111111111111111111";
const stellar = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const row = (id: string, userId: string, address: string, chainType: string, network: string, status = "active") => ({
  id, walletId: id, userId, address, chainType, network, status, updatedAt: new Date("2026-10-04T00:00:00Z"),
});
const rows = [
  row("evm", "fixture-owner", evm, "ethereum", "avalanche:fuji"),
  row("evm", "fixture-owner", evm, "ethereum", "bnb:testnet"),
  row("evm", "fixture-owner", evm, "ethereum", "base:sepolia"),
  row("solana", "fixture-owner", solana, "solana", "solana:devnet"),
  row("stellar", "fixture-owner", stellar, "stellar", "stellar:testnet", "pending"),
  row("foreign", "fixture-foreign", "foreign-private-marker", "stellar", "stellar:testnet"),
  row("disabled", "fixture-owner", "disabled-mainnet-marker", "ethereum", "ethereum:mainnet"),
];
const ownerReads: string[] = [];
const sideReads = { stellar: 0, balance: 0, memory: 0 };
const walletModule = await import(moduleUrl("app/multichain-account.ts"));
mock.module(moduleUrl("app/multichain-account.ts"), { namedExports: { ...walletModule,
  listPersistedUserWallets: async (userId: string) => { ownerReads.push(userId); return rows; },
  setPersistedWalletNetworkStatus: async () => { assert.fail("registration_write_forbidden"); },
} });
const stellarModule = await import(moduleUrl("app/privy-stellar.ts"));
mock.module(moduleUrl("app/privy-stellar.ts"), { namedExports: { ...stellarModule,
  getStellarTestnetAccount: async () => { sideReads.stellar++; assert.fail("wallet_listing_must_not_read_horizon"); },
  fundStellarTestnetWallet: async () => { assert.fail("funding_forbidden"); },
} });
mock.module(moduleUrl("app/agent-chat-balances.ts"), { namedExports: {
  readChatNativeBalance: async () => { sideReads.balance++; assert.fail("wallet_listing_must_not_read_balance_rpc"); },
} });
const memoryModule = await import(moduleUrl("app/agent-memory-store.ts"));
mock.module(moduleUrl("app/agent-memory-store.ts"), { namedExports: { ...memoryModule,
  retrieveRelevantAgentMemory: async () => { sideReads.memory++; assert.fail("listing_must_not_prepare_memory"); },
  ensureAgentVaultSchema: async () => { assert.fail("schema_preparation_forbidden"); },
} });
const { parseChatReadRequest } = await import(moduleUrl("app/queries/chat.ts"));
const { sendAgentMessage } = await import(moduleUrl("app/agent-chat-store.ts"));
const networks = ["Avalanche Fuji", "BNB Smart Chain Testnet", "Base Sepolia", "Solana Devnet", "Stellar Testnet"];
const expectedLinks = [
  `https://explorer-test.avax.network/c-chain/address/${evm}`,
  `https://testnet.bscscan.com/address/${evm}`,
  `https://sepolia.basescan.org/address/${evm}`,
  `https://explorer.solana.com/address/${solana}?cluster=devnet`,
  `https://stellar.expert/explorer/testnet/account/${stellar}`,
];
const cases = [
  { locale: "es", message: "Mis billeteras", title: /Tus billeteras registradas/, pending: /pendiente de registro/, header: /Red.*Dirección.*Estado.*Explorador/ },
  { locale: "en", message: "My wallets", title: /Your registered wallets/, pending: /registration pending|pending registration/, header: /Network.*Address.*state.*Explorer/i },
  { locale: "pt", message: "Minhas carteiras", title: /Suas carteiras registradas/, pending: /registro pendente|pendente de registro/, header: /Rede.*Endereço.*Estado.*Explorador/ },
  { locale: "es", message: "Muéstrame mis billeteras", title: /Tus billeteras registradas/, pending: /pendiente de registro/, header: /Red.*Dirección.*Estado.*Explorador/ },
  { locale: "en", message: "Show my wallets", title: /Your registered wallets/, pending: /registration pending|pending registration/, header: /Network.*Address.*state.*Explorer/i },
  { locale: "pt", message: "Mostre minhas carteiras", title: /Suas carteiras registradas/, pending: /registro pendente|pendente de registro/, header: /Rede.*Endereço.*Estado.*Explorador/ },
] as const;
const checks: Array<{ case: string; passed: boolean; code?: string }> = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); checks.push({ case: name, passed: true }); }
  catch { checks.push({ case: name, passed: false, code: "controlled_assertion_failed" }); }
}
for (const item of cases) {
  await check(`route:${item.locale}:${item.message}`, () => assert.deepEqual(parseChatReadRequest(item.message), { id: "personal.wallets", input: {} }));
  await check(`send:${item.locale}:${item.message}`, async () => {
    const snapshot = { ...sideReads };
    const result = await sendAgentMessage("fixture-owner", item.message, item.locale);
    const assistant = result.assistantMessage;
    const content = assistant.content;
    assert.match(content, item.title);
    assert.match(content, item.header);
    assert.match(content, item.pending);
    const dataRows = content.split("\n").filter((line: string) => /^\|/.test(line) && networks.some(name => line.includes(name)));
    assert.equal(dataRows.length, 5, "five_network_rows_required");
    for (const name of networks) assert.equal(dataRows.filter((line: string) => line.includes(name)).length, 1, "each_network_once");
    for (const link of expectedLinks) assert.ok(content.includes(`](${link})`), "exact_testnet_explorer_required");
    assert.equal(dataRows.filter((line: string) => line.includes(evm)).length, 3, "evm_identity_has_three_network_associations");
    assert.doesNotMatch(content, /foreign-private-marker|fixture-foreign|disabled-mainnet-marker/);
    assert.doesNotMatch(content, /pendiente de activaci[oó]n|activation pending|ativa[cç][aã]o pendente|\b(?:[0-9]+(?:\.[0-9]+)?)\s+(?:XLM|SOL|AVAX|ETH|tBNB)\b/);
    assert.equal(result.wallet, null, "no_ancillary_balance_context");
    assert.deepEqual(assistant.actions, [], "no_financial_ctas");
    for (const key of ["defindexIntent", "x402Intent", "soroswapIntent", "decision", "planner", "workflow"]) assert.equal(assistant[key], undefined, "no_execution_or_planning_intent");
    assert.deepEqual(sideReads, snapshot, "metadata_listing_only");
  });
}
await check("owner_and_side_effect_boundary", () => {
  assert.ok(ownerReads.length > 0);
  assert.ok(ownerReads.every(userId => userId === "fixture-owner"));
  assert.ok(writes.every(value => value.userId === "fixture-owner"));
  assert.deepEqual(sideReads, { stellar: 0, balance: 0, memory: 0 });
  assert.equal(blockedNetworkAttempts, 0);
});
const after = { source: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
await check("source_unchanged", () => {
  assert.deepEqual(after, before);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
});
const utc = new Date().toISOString();
const receipt = {
  mode: "controlled_normal_wallet_chat_regression", utc, source: expected,
  sourceStayedPinned: before.source === after.source && before.tree === after.tree,
  checks, passed: checks.every(value => value.passed), syntheticFixture: true,
  realNetworkRequests: 0, blockedNetworkAttempts, realDatabaseWrites: 0, controlledChatPersistenceWrites: writes.length,
  humanAcceptanceEstablished: false, environmentFilesLoaded: false,
};
const work = resolve(target, "..", "..");
assert.equal(work, resolve("C:/Users/MGC/Documents/ChatGPT/Carmelita"), "workspace_required");
mkdirSync(join(work, "work"), { recursive: true });
const file = join(work, "work", `pilot-wallet-chat-controlled-${expected.slice(0, 7)}-${Date.now()}.json`);
const body = `${JSON.stringify(receipt, null, 2)}\n`;
writeFileSync(file, body, { flag: "wx" });
console.log(JSON.stringify({ ...receipt, file, sha256: createHash("sha256").update(body).digest("hex") }, null, 2));
if (!receipt.passed) process.exitCode = 1;
