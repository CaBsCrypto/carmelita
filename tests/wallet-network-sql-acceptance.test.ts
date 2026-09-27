import assert from "node:assert/strict";
import test from "node:test";
import { buildWalletPersistenceStatements, type WalletPersistenceStatement } from "../app/multichain-account";
import { buildWalletNetworkConcurrencyFixture, buildWalletNetworkSqlFixtures } from "./wallet-network-sql-fixtures";
import { quotedWalletSqlSchema, runWalletNetworkSqlAcceptance, sanitizedWalletSqlError, walletSqlAcceptanceEnabled, walletSqlConcurrencyEvidence, walletSqlFixtureSchema, walletSqlSchemaCleanup, type WalletSqlAcceptanceDependencies } from "../scripts/wallet-network-sql-acceptance";

const uuid = "01234567-89ab-4cde-8123-0123456789ab";
const schema = walletSqlFixtureSchema(uuid);
const env = {
  CARMELITA_PREVIEW_ISOLATED: "true",
  CARMELITA_PREVIEW_DATABASE_HOST: "ep-qa.example.neon.tech",
  CARMELITA_PREVIEW_ORIGIN: "https://wallet-qa.example.vercel.app",
  CARMELITA_PREVIEW_DEPLOYMENT: "dpl_fixture",
  CARMELITA_PREVIEW_DATABASE_URL: "postgresql://qa:fixture@ep-qa-pooler.example.neon.tech/qa?sslmode=require",
  CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: "postgresql://qa:fixture@ep-qa.example.neon.tech/qa?sslmode=require",
};
const evidence = (id: string, start: string, finish: string) => [[], [{ transaction_id: id, started_at: start }], [], [{ finished_at: finish }]];

test("SQL acceptance is disabled without --execute and rejects isolation before constructing a database client", async () => {
  const dependencies: WalletSqlAcceptanceDependencies = {
    connect: async () => assert.fail("No client may be constructed"),
    buildFixtures: async () => assert.fail("No fixtures may be built"),
    buildConcurrencyFixture: async () => assert.fail("No concurrency fixtures may be built"),
    randomId: () => assert.fail("No namespace may be generated"),
  };
  assert.equal(walletSqlAcceptanceEnabled([]), false);
  assert.equal(walletSqlAcceptanceEnabled(["--execute"]), true);
  assert.throws(() => walletSqlAcceptanceEnabled(["--execute", "--production"]), /unknown_argument/);
  const disabled = await runWalletNetworkSqlAcceptance({ execute: false, env: {} }, dependencies);
  assert.equal(disabled.status, "DISABLED");
  await assert.rejects(runWalletNetworkSqlAcceptance({ execute: true, env: {} }, dependencies), /preview_isolation_not_enabled/);
});

test("fixture cleanup accepts only a quoted private UUID namespace and requires its ownership marker", () => {
  assert.equal(schema, "carmelita_evm_qa_0123456789ab4cde81230123456789ab");
  assert.equal(quotedWalletSqlSchema(schema), `"${schema}"`);
  for (const invalid of ["public", "drizzle", "carmelita_evm_qa_", `${schema}\"; DROP SCHEMA public CASCADE; --`, `${schema}.public`]) assert.throws(() => walletSqlSchemaCleanup(invalid), /invalid_fixture_schema/);
  assert.throws(() => walletSqlFixtureSchema("not-a-uuid"), /invalid_run_id/);
  const cleanup = walletSqlSchemaCleanup(schema);
  assert.equal(cleanup[0].text, `SET LOCAL search_path = "${schema}"`);
  assert.match(cleanup[1].text, /pg_catalog\.obj_description/);
  assert.deepEqual(cleanup[1].parameters, [schema, `carmelita-wallet-sql-acceptance:${schema}`]);
  assert.equal(cleanup[2].text, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});

test("concurrency evidence requires distinct database transactions with overlapping execution intervals", () => {
  const first = evidence("10", "2026-09-08T12:00:00.000Z", "2026-09-08T12:00:01.000Z");
  const second = evidence("11", "2026-09-08T12:00:00.100Z", "2026-09-08T12:00:01.500Z");
  assert.equal(walletSqlConcurrencyEvidence([first, second]).length, 2);
  assert.throws(() => walletSqlConcurrencyEvidence([first, first]), /not_distinct/);
  assert.throws(() => walletSqlConcurrencyEvidence([first, evidence("11", "2026-09-08T12:00:02Z", "2026-09-08T12:00:03Z")]), /did_not_overlap/);
  assert.throws(() => walletSqlConcurrencyEvidence([first, []]), /evidence_missing/);
});

test("SQL runner batches all nine fixtures separately, checks expected SQLSTATEs and waits for both concurrent transactions before exact cleanup", async () => {
  const fixtures = await buildWalletNetworkSqlFixtures();
  const concurrency = await buildWalletNetworkConcurrencyFixture();
  assert.equal(fixtures.length, 9);
  const calls: WalletPersistenceStatement[][] = [];
  let fixtureIndex = 0;
  let concurrentStarted = 0;
  let concurrentFinished = 0;
  let releaseFirst: () => void = () => {};
  const firstWaiting = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const dependencies: WalletSqlAcceptanceDependencies = {
    randomId: () => uuid,
    buildFixtures: async () => fixtures,
    buildConcurrencyFixture: async () => concurrency,
    connect: async (url) => {
      assert.equal(url, env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED);
      return { transaction: async (statements) => {
        calls.push(statements);
        if (fixtureIndex < fixtures.length) {
          const fixture = fixtures[fixtureIndex++];
          assert.equal(statements[0].text, "SET LOCAL search_path = pg_temp");
          assert.deepEqual(statements.slice(1), fixture.statements);
          if (fixture.expectedErrorCode) throw Object.assign(new Error("sensitive-driver-message"), { code: fixture.expectedErrorCode });
          return [];
        }
        if (statements.some(({ text }) => text.includes("txid_current()"))) {
          const number = ++concurrentStarted;
          assert.equal(statements[0].text, `SET LOCAL search_path = "${schema}"`);
          assert.deepEqual(statements.slice(3, -1), buildWalletPersistenceStatements(concurrency.input));
          if (number === 1) await firstWaiting;
          else releaseFirst();
          concurrentFinished++;
          return evidence(String(number), `2026-09-08T12:00:00.${number}00Z`, "2026-09-08T12:00:01Z");
        }
        if (statements.some(({ text }) => text.startsWith("DROP SCHEMA"))) {
          assert.equal(concurrentFinished, 2);
          assert.deepEqual(statements, walletSqlSchemaCleanup(schema));
        }
        return [];
      } };
    },
  };
  const report = await runWalletNetworkSqlAcceptance({ execute: true, env }, dependencies);
  assert.equal(report.status, "PASS");
  assert.equal(report.passed, 13);
  assert.equal(report.failed, 0);
  assert.equal(concurrentStarted, 2);
  assert.equal(calls.length, 14);
  assert.doesNotMatch(JSON.stringify(report), /postgres|fixture@|sensitive-driver-message|did:privy:|fixture-evm-a/);
  const setup = calls[9];
  assert.match(setup[0].text, /fixture_schema_absent/);
  assert.equal(setup[1].text, `CREATE SCHEMA "${schema}"`);
  assert.ok(setup[2].text.includes(`carmelita-wallet-sql-acceptance:${schema}`));
  assert.equal(setup[3].text, `SET LOCAL search_path = "${schema}"`);
});

test("an unexpected SQL error cannot masquerade as expected rejection and cleanup still follows concurrency failure", async () => {
  const calls: WalletPersistenceStatement[][] = [];
  let concurrencyCalls = 0;
  const concurrency = await buildWalletNetworkConcurrencyFixture();
  const report = await runWalletNetworkSqlAcceptance({ execute: true, env }, {
    randomId: () => uuid,
    buildFixtures: async () => [{ name: "Fixture rejection", statements: [], expectedErrorCode: "23505" }],
    buildConcurrencyFixture: async () => concurrency,
    connect: async () => ({ transaction: async (statements) => {
      calls.push(statements);
      if (calls.length === 1) throw Object.assign(new Error(env.CARMELITA_PREVIEW_DATABASE_URL), { code: "23503" });
      if (statements.some(({ text }) => text.includes("txid_current()"))) {
        concurrencyCalls++;
        throw new Error(`connection failed ${env.CARMELITA_PREVIEW_DATABASE_URL}`);
      }
      return [];
    } }),
  });
  assert.equal(report.status, "FAIL");
  assert.equal(report.checks[0].status, "FAIL");
  assert.equal(report.checks[0].actualErrorCode, "23503");
  assert.equal(concurrencyCalls, 2);
  assert.deepEqual(calls.at(-1), walletSqlSchemaCleanup(schema));
  assert.doesNotMatch(JSON.stringify(report), /postgres|fixture@|connection failed/);
  assert.equal(sanitizedWalletSqlError({ code: env.CARMELITA_PREVIEW_DATABASE_URL }), "wallet_sql_request_failed");
});
