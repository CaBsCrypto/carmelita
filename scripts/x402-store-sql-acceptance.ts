import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPreviewIsolation } from "../app/preview-isolation";
import { buildClaimX402Execution, type X402StoreStatement } from "../app/x402/store";
import { buildX402StoreSqlFixtures } from "../tests/x402-store-sql-fixtures";
import { walletSqlAcceptanceEnabled, walletSqlConcurrencyEvidence } from "./wallet-network-sql-acceptance";

const sql = (text: string, parameters: unknown[] = []): X402StoreStatement => ({ text, parameters });
export function quoteX402FixtureSchema(schema: string) {
  if (!/^carmelita_x402_qa_[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}$/.test(schema)) throw new Error("x402_sql_invalid_fixture_schema");
  return `"${schema}"`;
}
function marker(schema: string) { quoteX402FixtureSchema(schema); return `carmelita-x402-store-acceptance:${schema}`; }
export function x402FixtureCleanup(schema: string) {
  const quoted = quoteX402FixtureSchema(schema);
  return [sql(`SET LOCAL search_path = ${quoted}`), sql(`SELECT 1 / CASE WHEN NOT EXISTS
    (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1) OR EXISTS
    (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1 AND pg_catalog.obj_description(oid,'pg_namespace')=$2)
    THEN 1 ELSE 0 END AS exclusively_owned_schema`, [schema, marker(schema)]), sql(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`)];
}
function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^(x402_sql_|wallet_sql_|preview_isolation_)[a-z0-9_]+$/.test(error.message)) return error.message;
  return "x402_sql_check_failed";
}

export async function runX402StoreSqlAcceptance(execute: boolean) {
  const generatedAt = new Date().toISOString();
  if (!execute) return { generatedAt, status: "DISABLED", failed: 0, detail: "Use --execute only with explicit isolated Preview configuration. No database connection was created." };
  const isolation = assertPreviewIsolation();
  const schema = `carmelita_x402_qa_${randomUUID().replace(/-/g, "")}`;
  const quoted = quoteX402FixtureSchema(schema);
  const { neon } = await import("@neondatabase/serverless");
  const client = neon(isolation.migrationDatabaseUrl);
  const transaction = (statements: X402StoreStatement[]) => client.transaction(statements.map(item => client.query(item.text, item.parameters)), { isolationLevel: "ReadCommitted" });
  const localPath = sql(`SET LOCAL search_path = ${quoted}`);
  const fixtures = await buildX402StoreSqlFixtures();
  const checks: { name: string; status: "PASS" | "FAIL" | "PENDING"; expectedErrorCode: string | null; actualErrorCode: string | null; durationMs: number }[] = [];
  let concurrencyEvidence: ReturnType<typeof walletSqlConcurrencyEvidence> = [];
  async function check(name: string, operation: () => Promise<unknown>, expectedErrorCode?: string) {
    const started = performance.now();
    try {
      await operation();
      checks.push({ name, status: expectedErrorCode ? "FAIL" : "PASS", expectedErrorCode: expectedErrorCode ?? null, actualErrorCode: null, durationMs: Math.round(performance.now() - started) });
      return !expectedErrorCode;
    } catch (error) {
      const actualErrorCode = errorCode(error);
      const matched = actualErrorCode === expectedErrorCode;
      checks.push({ name, status: matched ? "PASS" : "FAIL", expectedErrorCode: expectedErrorCode ?? null, actualErrorCode, durationMs: Math.round(performance.now() - started) });
      return matched;
    }
  }
  try {
    const setupReady = await check("Exclusive schema, synthetic legacy table and migration 0021", () => transaction([
      sql("SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1) THEN 1 ELSE 0 END AS schema_absent", [schema]),
      sql(`CREATE SCHEMA ${quoted}`), sql(`COMMENT ON SCHEMA ${quoted} IS '${marker(schema)}'`), localPath, ...fixtures.setup,
    ]));
    if (setupReady) {
      await check("Two overlapping claims have one durable execution winner", async () => {
        const candidates = [0, 1].map(index => ({ ...fixtures.concurrency, execution: { ...fixtures.concurrency.execution, signedTransaction: `fixture-non-submittable-xdr-${index}` } }));
        const settled = await Promise.allSettled(candidates.map(input => transaction([
          localPath, sql("SELECT txid_current()::text AS transaction_id, clock_timestamp()::text AS started_at"),
          sql("SELECT pg_sleep(1)"), buildClaimX402Execution(input), sql("SELECT clock_timestamp()::text AS finished_at"),
        ])));
        const failure = settled.find(item => item.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        const results = settled.map(item => item.status === "fulfilled" ? item.value : []);
        concurrencyEvidence = walletSqlConcurrencyEvidence(results);
        const winners = results.map((result, index) => result[3]?.length === 1 ? index : -1).filter(index => index !== -1);
        if (winners.length !== 1) throw new Error("x402_sql_claim_winner_not_unique");
        const stored = await transaction([localPath, sql("SELECT execution,status FROM agent_x402_payments WHERE id=$1 AND user_id=$2", [fixtures.concurrency.paymentId, fixtures.concurrency.userId])]);
        if (stored[1]?.[0]?.status !== "signing" || !isDeepStrictEqual(stored[1]?.[0]?.execution, candidates[winners[0]].execution)) throw new Error("x402_sql_claim_execution_not_durable");
      });
      for (const fixture of fixtures.cases) await check(fixture.name, () => transaction([localPath, ...fixture.statements]), fixture.expectedErrorCode);
    } else checks.push({ name: "Store transition checks", status: "PENDING", expectedErrorCode: null, actualErrorCode: null, durationMs: 0 });
  } finally {
    await check("Cleanup of only this execution's verified schema", () => transaction(x402FixtureCleanup(schema)));
  }
  const failed = checks.filter(item => item.status === "FAIL").length;
  const pending = checks.filter(item => item.status === "PENDING").length;
  return { generatedAt, status: failed ? "FAIL" : pending ? "PENDING" : "PASS", failed, pending, passed: checks.length - failed - pending,
    deployment: isolation.deployment, schema, concurrencyEvidence, checks };
}
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    const report = await runX402StoreSqlAcceptance(walletSqlAcceptanceEnabled(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify({ generatedAt: new Date().toISOString(), status: "FAIL", code: errorCode(error) })); process.exitCode = 1; }
}
