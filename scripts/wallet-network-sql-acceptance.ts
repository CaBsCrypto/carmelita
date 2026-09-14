import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPreviewIsolation, type PreviewIsolationEnvironment } from "../app/preview-isolation";
import { buildWalletPersistenceStatements, type WalletPersistenceStatement } from "../app/multichain-account";
import { buildWalletNetworkConcurrencyFixture, buildWalletNetworkSqlFixtures } from "../tests/wallet-network-sql-fixtures";

export type WalletSqlAcceptanceDatabase = {
  transaction(statements: WalletPersistenceStatement[]): Promise<unknown>;
};
export type WalletSqlAcceptanceDependencies = {
  connect(url: string): Promise<WalletSqlAcceptanceDatabase>;
  buildFixtures: typeof buildWalletNetworkSqlFixtures;
  buildConcurrencyFixture: typeof buildWalletNetworkConcurrencyFixture;
  randomId(): string;
};
export type SqlAcceptanceCheck = {
  name: string;
  status: "PASS" | "FAIL" | "PENDING";
  durationMs: number;
  expectedErrorCode: string | null;
  actualErrorCode: string | null;
  detail: string;
};
type TransactionEvidence = { transactionId: string; startedAt: string; finishedAt: string };

const defaultDependencies: WalletSqlAcceptanceDependencies = {
  connect: async (url) => {
    const { neon } = await import("@neondatabase/serverless");
    const client = neon(url);
    return { transaction: (statements) => client.transaction(
      statements.map(({ text, parameters }) => client.query(text, parameters)),
      { isolationLevel: "ReadCommitted" },
    ) };
  },
  buildFixtures: buildWalletNetworkSqlFixtures,
  buildConcurrencyFixture: buildWalletNetworkConcurrencyFixture,
  randomId: randomUUID,
};

const statement = (text: string, parameters: unknown[] = []): WalletPersistenceStatement => ({ text, parameters });
export function walletSqlAcceptanceEnabled(args: string[]) {
  if (args.some((arg) => arg !== "--execute")) throw new Error("wallet_sql_unknown_argument");
  return args.includes("--execute");
}
export function walletSqlFixtureSchema(uuid: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uuid)) throw new Error("wallet_sql_invalid_run_id");
  return `carmelita_evm_qa_${uuid.replace(/-/g, "")}`;
}
export function quotedWalletSqlSchema(schema: string) {
  if (!/^carmelita_evm_qa_[a-f0-9]{32}$/.test(schema)) throw new Error("wallet_sql_invalid_fixture_schema");
  return `"${schema}"`;
}
function fixtureSearchPath(schema: string) {
  return statement(`SET LOCAL search_path = ${quotedWalletSqlSchema(schema)}`);
}
function schemaMarker(schema: string) {
  quotedWalletSqlSchema(schema);
  return `carmelita-wallet-sql-acceptance:${schema}`;
}
export function walletSqlSchemaCleanup(schema: string): WalletPersistenceStatement[] {
  const quoted = quotedWalletSqlSchema(schema);
  // A lost create response must not justify dropping a schema we cannot identify.
  return [
    fixtureSearchPath(schema),
    statement(`SELECT 1 / CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace
      WHERE nspname = $1 AND pg_catalog.obj_description(oid, 'pg_namespace') = $2
    ) THEN 1 ELSE 0 END AS exclusive_fixture_schema_owned`, [schema, schemaMarker(schema)]),
    statement(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`),
  ];
}
export function sanitizedWalletSqlError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^(preview_isolation_|wallet_sql_)[a-zA-Z0-9_]+$/.test(error.message)) return error.message;
  return "wallet_sql_request_failed";
}
function rowAt(results: unknown, index: number) {
  if (!Array.isArray(results) || !Array.isArray(results[index]) || !results[index][0] || typeof results[index][0] !== "object") throw new Error("wallet_sql_transaction_evidence_missing");
  return results[index][0] as Record<string, unknown>;
}
export function walletSqlConcurrencyEvidence(results: unknown[]) {
  if (results.length !== 2) throw new Error("wallet_sql_two_transactions_required");
  const evidence = results.map((result): TransactionEvidence => {
    if (!Array.isArray(result)) throw new Error("wallet_sql_transaction_evidence_missing");
    const start = rowAt(result, 1);
    const finish = rowAt(result, result.length - 1);
    if (typeof start.transaction_id !== "string" || !/^\d+$/.test(start.transaction_id)
      || typeof start.started_at !== "string" || typeof finish.finished_at !== "string"
      || !Number.isFinite(Date.parse(start.started_at)) || !Number.isFinite(Date.parse(finish.finished_at))
      || Date.parse(finish.finished_at) < Date.parse(start.started_at)) throw new Error("wallet_sql_transaction_evidence_invalid");
    return { transactionId: start.transaction_id, startedAt: start.started_at, finishedAt: finish.finished_at };
  });
  if (evidence[0].transactionId === evidence[1].transactionId) throw new Error("wallet_sql_transactions_not_distinct");
  if (Math.max(...evidence.map((item) => Date.parse(item.startedAt))) >= Math.min(...evidence.map((item) => Date.parse(item.finishedAt)))) throw new Error("wallet_sql_transactions_did_not_overlap");
  return evidence;
}

/** No dotenv, migrations journal, production tables, user wallets or financial actions. */
export async function runWalletNetworkSqlAcceptance(
  input: { execute: boolean; env?: PreviewIsolationEnvironment },
  dependencies: WalletSqlAcceptanceDependencies = defaultDependencies,
) {
  const generatedAt = new Date().toISOString();
  const checks: SqlAcceptanceCheck[] = [];
  if (!input.execute) return {
    generatedAt, status: "DISABLED", passed: 0, failed: 0, pending: 0, checks,
    detail: "Database fixture mutations are disabled. Supply --execute with explicit isolated Preview configuration.",
  };
  // Validate the resource before constructing a database client or generating SQL.
  const isolation = assertPreviewIsolation(input.env ?? process.env);
  const schema = walletSqlFixtureSchema(dependencies.randomId());
  const database = await dependencies.connect(isolation.migrationDatabaseUrl);
  const runCheck = async (name: string, operation: () => Promise<void>, expectedErrorCode?: string) => {
    const started = performance.now();
    try {
      await operation();
      checks.push({ name, status: expectedErrorCode ? "FAIL" : "PASS", durationMs: Math.round(performance.now() - started), expectedErrorCode: expectedErrorCode ?? null, actualErrorCode: null, detail: expectedErrorCode ? "Expected database rejection did not occur." : "Database assertions completed." });
      return !expectedErrorCode;
    } catch (error) {
      const code = sanitizedWalletSqlError(error);
      const matched = expectedErrorCode !== undefined && code === expectedErrorCode;
      checks.push({ name, status: matched ? "PASS" : "FAIL", durationMs: Math.round(performance.now() - started), expectedErrorCode: expectedErrorCode ?? null, actualErrorCode: code, detail: matched ? "Database rejected the operation with the expected SQLSTATE; its transaction rolled back." : "Database check failed; raw driver details are omitted." });
      return matched;
    }
  };

  const fixtures = await dependencies.buildFixtures();
  for (const fixture of fixtures) {
    await runCheck(fixture.name, async () => {
      // One transaction per fixture: TEMP tables disappear on commit or rollback.
      await database.transaction([statement("SET LOCAL search_path = pg_temp"), ...fixture.statements]);
    }, fixture.expectedErrorCode);
  }

  const concurrency = await dependencies.buildConcurrencyFixture();
  let concurrencyEvidence: TransactionEvidence[] = [];
  let schemaAttempted = false;
  try {
    schemaAttempted = true;
    const ready = await runCheck("Exclusive empty schema and migration fixture", async () => {
      await database.transaction([
        statement("SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1) THEN 1 ELSE 0 END AS fixture_schema_absent", [schema]),
        statement(`CREATE SCHEMA ${quotedWalletSqlSchema(schema)}`),
        statement(`COMMENT ON SCHEMA ${quotedWalletSqlSchema(schema)} IS '${schemaMarker(schema)}'`),
        fixtureSearchPath(schema),
        ...concurrency.setup,
      ]);
    });
    if (ready) {
      await runCheck("Two overlapping transactions persist the same owner and EVM identity", async () => {
        const statements = [
          fixtureSearchPath(schema),
          statement("SELECT txid_current()::text AS transaction_id, clock_timestamp()::text AS started_at"),
          statement("SELECT pg_sleep(1)"),
          ...buildWalletPersistenceStatements(concurrency.input),
          statement("SELECT clock_timestamp()::text AS finished_at"),
        ];
        // Await both terminal outcomes before inspecting or cleaning their schema.
        const outcomes = await Promise.allSettled([database.transaction(statements), database.transaction(statements)]);
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        concurrencyEvidence = walletSqlConcurrencyEvidence(outcomes.map((outcome) => outcome.status === "fulfilled" ? outcome.value : null));
      });
      await runCheck("One identity, three network bindings and unchanged canonical fields after concurrency", async () => {
        await database.transaction([fixtureSearchPath(schema), ...concurrency.assertions]);
      });
    } else checks.push({ name: "Concurrent wallet persistence", status: "PENDING", durationMs: 0, expectedErrorCode: null, actualErrorCode: null, detail: "Not invoked because exclusive schema setup failed." });
  } finally {
    if (schemaAttempted) await runCheck("Cleanup of this run's verified exclusive schema", async () => {
      await database.transaction(walletSqlSchemaCleanup(schema));
    });
  }
  const passed = checks.filter((check) => check.status === "PASS").length;
  const failed = checks.filter((check) => check.status === "FAIL").length;
  const pending = checks.filter((check) => check.status === "PENDING").length;
  return { generatedAt, status: failed ? "FAIL" : pending ? "PENDING" : "PASS", passed, failed, pending, concurrencySchema: schema, concurrencyEvidence, checks };
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    const report = await runWalletNetworkSqlAcceptance({ execute: walletSqlAcceptanceEnabled(process.argv.slice(2)) });
    console.log(JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), status: "FAIL", code: sanitizedWalletSqlError(error) }, null, 2));
    process.exitCode = 1;
  }
}
