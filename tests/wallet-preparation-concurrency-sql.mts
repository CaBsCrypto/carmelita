// Opt-in QA only. Shared exclusive fixture schema permits real concurrent sessions.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mock } from "node:test";
import * as neonModule from "@neondatabase/serverless";
import ws from "ws";
import { assertPreviewIsolation } from "../app/preview-isolation";

if (!process.argv.includes("--execute")) throw new Error("explicit_execute_required");
const isolation = assertPreviewIsolation();
neonModule.neonConfig.webSocketConstructor = ws;
const pool = new neonModule.Pool({ connectionString: isolation.migrationDatabaseUrl });
const a = await pool.connect();
const b = await pool.connect();
const schema = `carmelita_preparation_qa_${randomUUID().replaceAll("-", "")}`;
assert.match(schema, /^carmelita_preparation_qa_[a-f0-9]{32}$/);
const owner = `exclusive-preparation-test:${schema}`;
const session = new AsyncLocalStorage<typeof a>();
const user = "did:privy:fixture-concurrency";
let created = false;
let stage = "setup";
try {
  await a.query(`CREATE SCHEMA "${schema}"`); created = true;
  await a.query(`COMMENT ON SCHEMA "${schema}" IS '${owner}'`);
  for (const client of [a, b]) {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query("SET statement_timeout = '8s'");
  }
  await a.query("CREATE TABLE agent_users(id text PRIMARY KEY,status text NOT NULL)");
  for (const sql of readFileSync(new URL("../drizzle/0022_wallet_preparation.sql", import.meta.url), "utf8").split("--> statement-breakpoint").filter(s => s.trim())) await a.query(sql);
  await a.query("CREATE TABLE fixture_writes(id text PRIMARY KEY)");
  await a.query("INSERT INTO agent_users VALUES ($1,'active')", [user]);
  mock.module("@neondatabase/serverless", { namedExports: { ...neonModule, neon: () => ({ query: async (sql: string, parameters: unknown[]) => (await (session.getStore() ?? a).query(sql, parameters)).rows }) } });
  const store = await import("../app/wallets/preparation-store");
  const { buildWalletPersistenceStatements } = await import("../app/multichain-account");
  stage = "concurrent enqueue";
  await Promise.all([session.run(a, () => store.enqueue(user, "v1", "normal_login")), session.run(b, () => store.enqueue(user, "v1", "backfill"))]);
  assert.equal((await a.query("SELECT count(*)::int n FROM wallet_preparation_jobs")).rows[0].n, 1);
  await a.query("UPDATE wallet_preparation_families SET status='complete' WHERE family!='evm'");
  const claims = await Promise.all([session.run(a, () => store.claimJob(user, "v1")), session.run(b, () => store.claimJob(user, "v1"))]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claim = claims.find(Boolean)!;
  assert.equal(claim.attempt, 1);
  const guard = buildWalletPersistenceStatements({ userId: user, email: null, wallet: { id: "fixture-wallet", address: `0x${"1".repeat(40)}`, chainType: "ethereum", family: "evm", owner: "user", created: false }, networks: ["avalanche:fuji"], preparationClaim: claim })[0];
  await a.query("BEGIN");
  await a.query(guard.text, guard.parameters);
  // The real persistence guard holds the family lock; another claimant cannot steal it.
  assert.equal(await session.run(b, () => store.claimJob(user, "v1")), null);
  await a.query("ROLLBACK");
  await a.query("UPDATE wallet_preparation_families SET lease_expires_at=clock_timestamp()+interval '0.4 seconds' WHERE family='evm'");
  await a.query("BEGIN");
  await a.query("SELECT pg_sleep(0.6)");
  let rejected = false;
  try { await a.query(guard.text, guard.parameters); await a.query("INSERT INTO fixture_writes VALUES ('stale')"); }
  catch (error) { assert.equal((error as {code?: string}).code, "22012"); rejected = true; }
  await a.query("ROLLBACK");
  assert.equal(rejected, true, "real guard must use wall clock, not transaction-start now()");
  assert.equal((await a.query("SELECT count(*)::int n FROM fixture_writes")).rows[0].n, 0);
  assert.equal(await store.finishFamily(claim.token, "evm", {status: "complete"}), false);
  await store.listDueUsers("v1");
  await a.query("UPDATE wallet_preparation_families SET next_attempt_at=now()-interval '1 minute' WHERE family='evm'");
  const replacement = await store.claimJob(user, "v1");
  assert.ok(replacement); assert.equal(replacement.fence, claim.fence + 1);
  assert.equal(await store.finishFamily(claim.token, "evm", {status: "complete"}), false);
  console.log(JSON.stringify({at: new Date().toISOString(), status: "PASS", checks: ["concurrent enqueue deduplicated", "simultaneous claim has one winner", "real persistence guard locks family", "expired lease rejected inside older transaction", "stale completion rejected", "replacement fence increases"], limitations: ["No Privy calls; full identity persistence covered separately"]}));
} catch (error) {
  console.error({stage});
  console.error(JSON.stringify({status: "FAIL", code: (error as {code?:string}).code ?? "preparation_concurrency_failed", constraint: (error as {constraint?:string}).constraint, location: (error as Error).stack?.split("\n").find(line => line.includes("wallet-preparation-concurrency-sql.mts:"))})); process.exitCode = 1;
} finally {
  await a.query("ROLLBACK"); await b.query("ROLLBACK");
  if (created) {
    const mark = await a.query("SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname=$1", [schema]);
    assert.equal(mark.rows[0]?.marker, owner);
    await a.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  a.release(true); b.release(true); await pool.end();
}
