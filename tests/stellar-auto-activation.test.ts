import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { getDb } from "../db";
import { fundStellarTestnetWallet, getStellarTestnetAccount, STELLAR_TESTNET_FRIENDBOT, STELLAR_TESTNET_HORIZON } from "../app/privy-stellar";
import { ensureStellarTestnetActivation, type StellarAccount, type StellarActivationDependencies } from "../app/wallets/stellar-activation";
import { createStellarActivationClaimStore, STELLAR_ACTIVATION_COOLDOWN_MS, type StellarActivationClaimStore, type StellarActivationLease } from "../app/wallets/stellar-activation-claim";
import type { UserWallet } from "../app/wallets/types";

const userId = "did:privy:activation-user";
const wallet: UserWallet = { id: "wallet-stellar", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  family: "stellar", chainType: "stellar", created: false, owner: "user" };
const absent: StellarAccount = { exists: false, sequence: null, balances: [] };
const active: StellarAccount = { exists: true, sequence: "123", balances: [{ asset: "XLM", issuer: null, balance: "10000.0000000" }] };
const hash = "a".repeat(64);
function fixture(overrides: Partial<StellarActivationDependencies> = {}) {
  let now = 1_800_000_000_000;
  let lease: StellarActivationLease | null = null;
  const writes: Array<{ status: string; transactionHash: string | null }> = [];
  const requests: string[] = [];
  const claims: StellarActivationClaimStore = {
    async acquire(input) {
      if (lease && input.now.getTime() - lease.updatedAt.getTime() < STELLAR_ACTIVATION_COOLDOWN_MS) {
        return { lease: null, retryAfterMs: STELLAR_ACTIVATION_COOLDOWN_MS - (input.now.getTime() - lease.updatedAt.getTime()) };
      }
      lease = { id: "claim", userId: input.userId, address: input.address, updatedAt: input.now };
      return { lease, retryAfterMs: null };
    },
    async write(expected, input) {
      if (!lease || expected.updatedAt.getTime() !== lease.updatedAt.getTime()) return false;
      writes.push({ status: input.status, transactionHash: input.transactionHash });
      if (input.status !== "funding") lease = { ...lease, updatedAt: input.now };
      return true;
    },
  };
  const deps: StellarActivationDependencies = {
    canonical: async () => ({ id: wallet.id, userId, address: wallet.address, chainType: "stellar" }),
    claims, now: () => now, budgetMs: 500, readBudgetMs: 100, fundBudgetMs: 100,
    read: async () => absent,
    fund: async address => { requests.push(address); return { funded: true, transactionHash: hash }; },
    ...overrides,
  };
  return { deps, writes, requests, advance: (milliseconds: number) => { now += milliseconds; } };
}

test("existing and unknown accounts never request Friendbot", async () => {
  for (const account of [active, null]) {
    const f = fixture({ claims: { acquire: async () => { throw new Error("unexpected claim"); }, write: async () => { throw new Error("unexpected write"); } },
      read: async () => { throw new Error("unexpected read"); } });
    const result = await ensureStellarTestnetActivation({ userId, wallet, account }, f.deps);
    assert.equal(result.activation, account ? "active" : "unknown");
    assert.equal(result.faucetRequested, false);
    assert.equal(result.fundsMoved, false);
    assert.deepEqual(f.requests, []);
  }
});

test("confirmed absence activates only the same address and requires fresh Horizon plus a valid hash for confirmed funds", async () => {
  let reads = 0;
  const f = fixture({ read: async address => { assert.equal(address, wallet.address); return reads++ === 0 ? absent : active; } });
  const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(result.activation, "active");
  assert.equal(result.fundsMoved, true);
  assert.equal(result.transactionHash, hash);
  assert.deepEqual(f.requests, [wallet.address]);
  assert.deepEqual(f.writes.map(value => value.status), ["funding", "confirmed"]);
});

test("a lost faucet response is reconciled from Horizon without issuing a second request", async () => {
  let activated = false;
  let requests = 0;
  const f = fixture({ read: async () => activated ? active : absent,
    fund: async () => { requests++; activated = true; throw new Error("private-faucet-response-lost"); } });
  const first = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(first.activation, "active");
  assert.equal(first.fundsMoved, null);
  assert.equal(first.transactionHash, null);
  const retry = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(retry.activation, "active");
  assert.equal(retry.faucetRequested, false);
  assert.equal(requests, 1);
});

test("malformed faucet success never substitutes for fresh Horizon existence", async () => {
  const f = fixture({ fund: async () => ({ funded: true, transactionHash: "not-a-transaction-hash" }) });
  const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(result.activation, "pending");
  assert.equal(result.fundsMoved, null);
  assert.equal(result.transactionHash, null);
  assert.equal(result.error, "stellar_activation_unconfirmed");
  assert.equal(result.retryAfterMs, STELLAR_ACTIVATION_COOLDOWN_MS);
});

test("faucet failure stays pending, respects durable cooldown and retries the same address", async () => {
  let requests = 0;
  const f = fixture({ fund: async address => { assert.equal(address, wallet.address); requests++; throw new Error("private-faucet-failure"); } });
  const first = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(first.activation, "pending");
  assert.equal(first.fundsMoved, null);
  assert.equal(first.error, "stellar_activation_faucet_unavailable");
  assert.doesNotMatch(JSON.stringify(first), /private-faucet/);
  const second = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(second.fundsMoved, false);
  assert.equal(second.faucetRequested, false);
  assert.equal(second.error, "stellar_activation_pending");
  assert.equal(requests, 1);
  f.advance(STELLAR_ACTIVATION_COOLDOWN_MS);
  await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(requests, 2);
});

test("concurrent activation claims allow exactly one faucet request", async () => {
  let activated = false;
  let requests = 0;
  const f = fixture({ read: async () => activated ? active : absent,
    fund: async () => { requests++; await new Promise(resolve => setTimeout(resolve, 10)); activated = true; return { funded: true, transactionHash: hash }; } });
  const results = await Promise.all(Array.from({ length: 8 }, () => ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps)));
  assert.equal(requests, 1);
  assert.equal(results.filter(result => result.faucetRequested).length, 1);
  assert.ok(results.some(result => result.activation === "active"));
});

test("owner, address, wallet ID, family and malformed DID mismatches cannot fund", async () => {
  const otherAddress = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
  const canonical = { id: wallet.id, userId, address: wallet.address, chainType: "stellar" };
  for (const mismatch of [{ ...canonical, userId: "did:privy:other" }, { ...canonical, id: "other-wallet" },
    { ...canonical, address: otherAddress }, { ...canonical, chainType: "ethereum" }, null]) {
    const f = fixture({ canonical: async () => mismatch });
    const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
    assert.equal(result.error, "wallet_identity_conflict");
    assert.equal(result.faucetRequested, false);
    assert.deepEqual(f.requests, []);
  }
  const f = fixture();
  for (const input of [{ userId: "invalid", wallet }, { userId, wallet: { ...wallet, address: "invalid" } },
    { userId, wallet: { ...wallet, family: "evm" as const } }]) {
    assert.equal((await ensureStellarTestnetActivation({ ...input, account: absent }, f.deps)).error, "wallet_identity_conflict");
  }
  assert.deepEqual(f.requests, []);
});

test("claim storage or initial fresh Horizon failure prevents faucet emission and hides provider details", async () => {
  for (const overrides of [
    { canonical: async () => { throw new Error("private-db-canonical"); } },
    { claims: { acquire: async () => { throw new Error("private-db-claim"); }, write: async () => true } },
    { claims: { acquire: fixture().deps.claims.acquire, write: async () => { throw new Error("private-db-write"); } } },
    { read: async () => { throw new Error("private-horizon"); } },
  ]) {
    const f = fixture(overrides);
    const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
    assert.equal(result.faucetRequested, false);
    assert.equal(result.fundsMoved, false);
    assert.equal(result.retryable, true);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
    assert.deepEqual(f.requests, []);
  }
});

test("faucet timeout still reconciles Horizon and never trusts a late hash", async () => {
  let complete!: () => void;
  let activated = false;
  const f = fixture({ fundBudgetMs: 5, fund: async () => {
    await new Promise<void>(resolve => { complete = resolve; });
    return { funded: true, transactionHash: hash };
  }, read: async () => activated ? active : absent });
  const pending = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(pending.activation, "pending");
  assert.equal(pending.fundsMoved, null);
  assert.equal(pending.transactionHash, null);
  activated = true;
  complete();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.writes.filter(value => value.status === "confirmed").length, 0);
  const recovered = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(recovered.activation, "active");
  assert.equal(recovered.faucetRequested, false);
});

test("global deadlines bound transports ignoring AbortSignal and prevent late confirmation writes", async () => {
  let finishRead!: () => void;
  let calls = 0;
  const f = fixture({ budgetMs: 15, readBudgetMs: 100, read: async () => {
    if (calls++ === 0) return absent;
    await new Promise<void>(resolve => { finishRead = resolve; });
    return active;
  } });
  const started = Date.now();
  const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.ok(Date.now() - started < 300);
  assert.equal(result.activation, "unknown");
  assert.equal(result.fundsMoved, null);
  assert.equal(f.writes.filter(value => value.status === "confirmed").length, 0);
  finishRead();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.writes.filter(value => value.status === "confirmed").length, 0);
});

test("a superseded lease is fenced before Friendbot and cannot overwrite a newer claim", async () => {
  const f = fixture();
  f.deps.claims.write = async () => false;
  const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
  assert.equal(result.error, "stellar_activation_claim_superseded");
  assert.equal(result.faucetRequested, false);
  assert.deepEqual(f.requests, []);
});

/** Exercise the production Drizzle store against atomic conflict/update behavior.
 * Generated SQL parameters enforce the same fence as PostgreSQL would. */
function durableClaimFixture() {
  type Row = { id: string; userId: string; walletAddress: string; asset: string; amount: string;
    claimWindow: string; status: string; transactionHash?: string | null; error?: string | null; updatedAt: Date };
  let row: Row | null = null;
  const dialect = new PgDialect();
  const database = {
    insert: () => ({ values: (input: Row) => ({ onConflictDoNothing: (options: { target: Array<{ name: string }> }) => {
      assert.deepEqual(options.target.map(column => column.name), ["user_id", "asset", "claim_window"]);
      return { returning: async () => { if (row) return []; row = structuredClone(input); return [structuredClone(row)]; } };
    } }) }),
    select: () => ({ from: () => ({ where: (condition: SQL) => ({ limit: async () => {
      const query = dialect.sqlToQuery(condition);
      assert.ok(query.sql.includes('"user_id"') && query.sql.includes('"asset"') && query.sql.includes('"claim_window"'));
      return row && row.userId === query.params[0] && row.asset === query.params[1] && row.claimWindow === query.params[2] ? [structuredClone(row)] : [];
    } }) }) }),
    update: () => ({ set: (values: Partial<Row>) => ({ where: (condition: SQL) => ({ returning: async () => {
      if (!row) return [];
      const query = dialect.sqlToQuery(condition);
      assert.ok(query.sql.includes('"updated_at"'), "Every replacement and terminal write must fence the previous timestamp");
      const params = query.params;
      const expectedDate = Date.parse(String(params[params.length - 1]));
      const takeover = params.length === 5;
      const match = takeover
        ? row.userId === params[0] && row.asset === params[1] && row.claimWindow === params[2] && row.id === params[3]
        : row.id === params[0] && row.userId === params[1] && row.walletAddress === params[2] && row.asset === params[3] && row.claimWindow === params[4];
      if (!match || row.updatedAt.getTime() !== expectedDate) return [];
      row = { ...row, ...structuredClone(values) };
      return [structuredClone(row)];
    } }) }) }),
  };
  const store = createStellarActivationClaimStore(() => database as unknown as ReturnType<typeof getDb>);
  return { store, row: () => row };
}

test("durable production claims atomically reserve XLM activation once and preserve the zero amount marker", async () => {
  const f = durableClaimFixture();
  const now = new Date(1_800_000_000_000);
  const reservations = await Promise.all(Array.from({ length: 8 }, () => f.store.acquire({ userId, address: wallet.address, now })));
  assert.equal(reservations.filter(claim => claim.lease).length, 1);
  assert.ok(reservations.filter(claim => !claim.lease).every(claim => claim.retryAfterMs === STELLAR_ACTIVATION_COOLDOWN_MS));
  assert.equal(f.row()?.asset, "XLM");
  assert.equal(Number(f.row()?.amount), 0);
  assert.equal(f.row()?.claimWindow, `stellar-activation:${wallet.address}`);
});

test("durable production claim cooldown and CAS permit one takeover; stale workers cannot finish a newer lease", async () => {
  const f = durableClaimFixture();
  const now = new Date(1_800_000_000_000);
  const first = await f.store.acquire({ userId, address: wallet.address, now });
  assert.ok(first.lease);
  assert.equal((await f.store.acquire({ userId, address: wallet.address, now: new Date(now.getTime() + 59_999) })).retryAfterMs, 1);
  const later = new Date(now.getTime() + STELLAR_ACTIVATION_COOLDOWN_MS);
  const takeover = await Promise.all(Array.from({ length: 4 }, () => f.store.acquire({ userId, address: wallet.address, now: later })));
  assert.equal(takeover.filter(claim => claim.lease).length, 1);
  assert.equal(await f.store.write(first.lease, { status: "confirmed", transactionHash: hash, error: null, now: later }), false);
  assert.equal(f.row()?.status, "pending");
  const lease = takeover.find(claim => claim.lease)!.lease!;
  assert.equal(await f.store.write(lease, { status: "funding", transactionHash: null, error: null, now: later }), true);
  assert.equal(f.row()?.updatedAt.getTime(), lease.updatedAt.getTime());
  assert.equal(await f.store.write({ ...lease, userId: "did:privy:other" }, { status: "confirmed", transactionHash: hash, error: null, now: later }), false);
  assert.equal(await f.store.write({ ...lease, address: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey() }, { status: "confirmed", transactionHash: hash, error: null, now: later }), false);
  assert.equal(await f.store.write(lease, { status: "confirmed", transactionHash: hash, error: null, now: new Date(later.getTime() + 10) }), true);
  assert.equal(f.row()?.status, "confirmed");
});

const horizonPayload = { account_id: wallet.address, sequence: "123", balances: [{ asset_type: "native", balance: "10000.0000000" }] };
test("Horizon accepts only an account for the exact requested address with valid sequence and native balance; only 404 proves absence", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      assert.equal(String(input), `${STELLAR_TESTNET_HORIZON}/accounts/${wallet.address}`);
      return Response.json(horizonPayload);
    };
    assert.deepEqual(await getStellarTestnetAccount(wallet.address), active);
    for (const malformed of [
      {}, [], { ...horizonPayload, account_id: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey() },
      { ...horizonPayload, sequence: null }, { ...horizonPayload, sequence: "invalid" },
      { ...horizonPayload, balances: [] }, { ...horizonPayload, balances: {} },
      { ...horizonPayload, balances: [null] }, { ...horizonPayload, balances: [{ asset_type: "native", balance: "NaN" }] },
      { ...horizonPayload, balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: wallet.address, balance: "1.0000000" }] },
      { ...horizonPayload, balances: [...horizonPayload.balances, { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "invalid", balance: "1" }] },
    ]) {
      globalThis.fetch = async () => Response.json(malformed);
      await assert.rejects(getStellarTestnetAccount(wallet.address), /^Error: horizon_account_lookup_failed$/);
    }
    for (const status of [429, 500, 503]) {
      globalThis.fetch = async () => Response.json({ detail: "private-horizon-error" }, { status });
      await assert.rejects(getStellarTestnetAccount(wallet.address), /^Error: horizon_account_lookup_failed$/);
    }
    globalThis.fetch = async () => Response.json({ detail: "not found" }, { status: 404 });
    assert.deepEqual(await getStellarTestnetAccount(wallet.address), absent);
    globalThis.fetch = async () => Response.json({ ...horizonPayload, balances: [...horizonPayload.balances,
      { asset_type: "liquidity_pool_shares", liquidity_pool_id: "b".repeat(64), balance: "1.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: wallet.address, balance: "2.0000000" }] });
    assert.equal((await getStellarTestnetAccount(wallet.address)).balances.length, 3);
  } finally { globalThis.fetch = previousFetch; }
});

test("raw malformed fresh Horizon responses cannot activate or request Friendbot before confirmed absence", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({});
    const f = fixture({ read: getStellarTestnetAccount });
    const result = await ensureStellarTestnetActivation({ userId, wallet, account: absent }, f.deps);
    assert.equal(result.activation, "unknown");
    assert.equal(result.faucetRequested, false);
    assert.equal(result.fundsMoved, false);
    assert.deepEqual(f.requests, []);
  } finally { globalThis.fetch = previousFetch; }
});

test("404 followed by faucet hash and malformed final Horizon body stays unknown with uncertain funds", async () => {
  const previousFetch = globalThis.fetch;
  let reads = 0;
  let faucetRequests = 0;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.origin === STELLAR_TESTNET_FRIENDBOT) {
        assert.equal(url.searchParams.get("addr"), wallet.address);
        faucetRequests++;
        return Response.json({ hash });
      }
      assert.equal(url.origin, STELLAR_TESTNET_HORIZON);
      return reads++ < 2 ? Response.json({}, { status: 404 }) : Response.json({});
    };
    const initial = await getStellarTestnetAccount(wallet.address);
    const f = fixture({ read: getStellarTestnetAccount, fund: fundStellarTestnetWallet });
    const result = await ensureStellarTestnetActivation({ userId, wallet, account: initial }, f.deps);
    assert.equal(result.activation, "unknown");
    assert.equal(result.faucetRequested, true);
    assert.equal(result.transactionHash, hash);
    assert.equal(result.fundsMoved, null);
    assert.equal(faucetRequests, 1);
    assert.equal(f.writes.filter(value => value.status === "confirmed").length, 0);
  } finally { globalThis.fetch = previousFetch; }
});
