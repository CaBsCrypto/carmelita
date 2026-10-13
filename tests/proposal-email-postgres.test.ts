import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { localProposalPostgresConfig, proposalPostgresSchema } from "../scripts/proposal-email-postgres-config.mjs";

test("proposal PostgreSQL acceptance only permits explicit disposable loopback databases", () => {
  const config = localProposalPostgresConfig("postgresql://qa:synthetic@127.0.0.1:55439/carmelita_proposal_qa");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.database, "carmelita_proposal_qa");
  assert.equal(config.ssl, false);
  assert.equal(localProposalPostgresConfig("postgres://qa@[::1]:55439/carmelita_proposal_qa_run").host, "::1");
  for (const value of [
    "postgresql://qa@db.example.test/carmelita_proposal_qa",
    "postgresql://qa@localhost/carmelita_proposal_qa",
    "postgresql://qa@127.0.0.1/production",
    "postgresql://qa@127.0.0.1/carmelita_proposal_qa?host=db.example.test",
    "postgresql://qa@127.0.0.1/carmelita_proposal_qa?options=-csearch_path=public",
    "postgresql://qa@127.0.0.1/carmelita_proposal_qa#fragment",
    "https://qa@127.0.0.1/carmelita_proposal_qa",
    "postgresql://127.0.0.1/carmelita_proposal_qa",
    "postgresql://qa@127.0.0.1:80/carmelita_proposal_qa",
    undefined,
  ]) assert.throws(() => localProposalPostgresConfig(value), /^Error: proposal_pg_/);
  assert.equal(proposalPostgresSchema(`carmelita_proposal_qa_${"a".repeat(32)}`), `"carmelita_proposal_qa_${"a".repeat(32)}"`);
  assert.throws(() => proposalPostgresSchema("public"), /proposal_pg_schema_invalid/);
  assert.throws(() => proposalPostgresSchema("carmelita_proposal_qa_x; DROP SCHEMA public"), /proposal_pg_schema_invalid/);
});

/**
 * Opt in only against a fresh local PostgreSQL server/database:
 * npm install --prefix work/proposal-email-postgres-runtime --save-exact --ignore-scripts pg@8.16.3
 * CARMELITA_PROPOSAL_PG_ACCEPTANCE=true
 * CARMELITA_PROPOSAL_PG_URL=postgresql://qa@127.0.0.1:55439/carmelita_proposal_qa
 * node --import tsx --test tests/proposal-email-postgres.test.ts
 * No application .env, remote Neon or Resend connection is used.
 */
test("proposal outbox passes independent-connection PostgreSQL acceptance", {
  skip: process.env.CARMELITA_PROPOSAL_PG_ACCEPTANCE === "true" ? false : "Explicit disposable local PostgreSQL acceptance opt-in required",
}, () => {
  localProposalPostgresConfig(process.env.CARMELITA_PROPOSAL_PG_URL);
  const driver = new URL("../work/proposal-email-postgres-runtime/node_modules/pg/lib/index.js", import.meta.url);
  assert.equal(existsSync(driver), true, "Install the pinned local QA driver shown in this test's instructions");
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./proposal-email-postgres-fixture.mts", import.meta.url)),
  ], { encoding: "utf8", timeout: 90000 });
  // Raw database errors can contain credentials; the fixture reports safe codes only.
  assert.equal(result.status, 0, result.stdout || "proposal_pg_acceptance_failed");
  process.stdout.write(result.stdout);
});
