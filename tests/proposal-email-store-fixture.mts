import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

type QueryResult = { rows: Record<string, unknown>[] };
type LocalPostgres = {
  waitReady: Promise<unknown>;
  query: (query: string, params?: unknown[]) => Promise<QueryResult>;
  exec: (query: string) => Promise<unknown>;
  close: () => Promise<void>;
};

const qaDirectory = fileURLToPath(new URL("../work/proposal-email-qa/", import.meta.url));
const engineUrl = new URL("../work/proposal-email-qa/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url);
const { PGlite } = await import(engineUrl.href) as { PGlite: new (directory: string) => LocalPostgres };
const restartMode = process.argv[2] === "--reopen";
await mkdir(qaDirectory, { recursive: true });
const dataDirectory = restartMode ? resolve(process.argv[3]) : await mkdtemp(join(qaDirectory, "postgres-"));
assert.equal(dataDirectory.startsWith(resolve(qaDirectory) + "\\") || dataDirectory.startsWith(resolve(qaDirectory) + "/"), true);
let postgres = new PGlite(dataDirectory);
await postgres.waitReady;
const dialect = new PgDialect();
let networkRequests = 0;
mock.method(globalThis, "fetch", async () => {
  networkRequests++;
  throw new Error("No network access is permitted in the SQL fixture");
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: {
    hasDatabase: () => true,
    getDb: () => ({
      execute: async (statement: SQL) => {
        const query = dialect.sqlToQuery(statement);
        return postgres.query(query.sql, query.params);
      },
    }),
  },
});

// This base table matches the existing proposal storage schema; the outbox DDL
// and every outbox mutation below come from the real production store module.
await postgres.exec(`CREATE TABLE IF NOT EXISTS integration_recommendations (
  id text PRIMARY KEY, integration_name text NOT NULL, email text NOT NULL,
  use_case text, locale text NOT NULL DEFAULT 'en', source text NOT NULL DEFAULT 'landing',
  status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_recommendations_email_name_uidx
  ON integration_recommendations(email, integration_name);`);

const store = await import("../app/integrations/proposal-email-store");
await store.ensureProposalEmailOutboxSchema();
const snapshot = { from: "notices@example.test", to: "reviewer@example.test", reviewUrl: "https://carmelita.example.test/admin/integrations" };
const changedSnapshot = { from: "new-notices@example.test", to: "new-reviewer@example.test", reviewUrl: "https://changed.example.test/admin/integrations" };
function proposal(integrationName = "Synthetic service") {
  return { id: randomUUID(), integrationName, email: "developer@example.test", useCase: "Read synthetic account data.", locale: "en", source: "developers" };
}
function message(proposalId: string) {
  return { from: snapshot.from, to: [snapshot.to], subject: "New Carmelita service proposal", text: `Synthetic frozen body for proposal ${proposalId}.` };
}
async function requiredClaim(config = snapshot) {
  const job = await store.claimProposalEmailJob(config);
  assert.ok(job, "Expected one eligible email job");
  return job;
}
async function queueRow(id: string) {
  const result = await postgres.query("SELECT * FROM carmelita_proposal_email_jobs WHERE proposal_id = $1", [id]);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
async function expireLease(id: string) {
  await postgres.query("UPDATE carmelita_proposal_email_jobs SET lease_expires_at = now() - interval '1 minute' WHERE proposal_id = $1", [id]);
}
async function makeDue(id: string) {
  await postgres.query("UPDATE carmelita_proposal_email_jobs SET next_attempt_at = now() - interval '1 minute' WHERE proposal_id = $1", [id]);
}

if (restartMode) {
  const id = process.argv[4];
  const row = await queueRow(id);
  assert.equal(row.state, "retry");
  const persistedFirstAttempt = String(row.first_attempt_at);
  const job = await requiredClaim(changedSnapshot);
  assert.equal(job.proposalId, id);
  assert.equal(job.attempts, 2);
  assert.equal(String((await queueRow(id)).first_attempt_at), persistedFirstAttempt);
  assert.deepEqual({ from: job.from, to: job.to, reviewUrl: job.reviewUrl }, snapshot);
  assert.deepEqual(job.payload, message(id));
  const changedMessage = { ...message(id), subject: "A changed template", text: "A changed body after restart." };
  assert.deepEqual(await store.freezeProposalEmailMessage(job, changedMessage), message(id));
  await store.completeProposalEmailJob(job, { status: "accepted", providerId: "synthetic-delivery-after-restart" });
  assert.equal(networkRequests, 0);
  await postgres.close();
} else {
  beforeEach(async () => {
    await postgres.exec("TRUNCATE carmelita_proposal_email_jobs, integration_recommendations CASCADE");
  });
  after(async () => {
    await postgres.close();
    assert.equal(networkRequests, 0);
    await rm(dataDirectory, { recursive: true, force: true });
  });

  test("a queue constraint failure rolls back the entire new proposal statement", async () => {
    const input = proposal();
    await postgres.exec("ALTER TABLE carmelita_proposal_email_jobs ADD CONSTRAINT synthetic_queue_failure CHECK (false)");
    try {
      await assert.rejects(store.createProposalWithEmailJob(input));
      assert.equal((await postgres.query("SELECT count(*)::int AS count FROM integration_recommendations")).rows[0].count, 0);
      assert.equal((await postgres.query("SELECT count(*)::int AS count FROM carmelita_proposal_email_jobs")).rows[0].count, 0);
    } finally {
      await postgres.exec("ALTER TABLE carmelita_proposal_email_jobs DROP CONSTRAINT synthetic_queue_failure");
    }
  });

  test("a duplicate preserves the original proposal and has exactly one email job", async () => {
    const input = proposal();
    assert.equal(await store.createProposalWithEmailJob(input), input.id);
    assert.equal(await store.createProposalWithEmailJob({ ...input, id: randomUUID(), useCase: "Changed duplicate" }), undefined);
    const proposals = (await postgres.query("SELECT id, use_case FROM integration_recommendations")).rows;
    assert.deepEqual(proposals, [{ id: input.id, use_case: input.useCase }]);
    assert.equal((await store.listProposalEmailJobs()).length, 1);
  });

  test("simultaneous claim calls return one winner while the durable lease is live", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    // PGlite serializes one PostgreSQL connection. This checks atomic claim/lease
    // exclusion, not multi-connection transaction blocking with SKIP LOCKED.
    const claims = await Promise.all(Array.from({ length: 6 }, () => store.claimProposalEmailJob(snapshot)));
    const winners = claims.filter(claim => claim !== null);
    assert.equal(winners.length, 1);
    assert.equal(winners[0]?.proposalId, input.id);
    assert.equal((await queueRow(input.id)).attempts, 1);
  });

  test("an expired lease is reclaimed with the original routing, body and first attempt time", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const original = await requiredClaim();
    assert.deepEqual(await store.freezeProposalEmailMessage(original, message(input.id)), message(input.id));
    const initialRow = await queueRow(input.id);
    await expireLease(input.id);
    const replacement = await requiredClaim(changedSnapshot);
    assert.notEqual(replacement.leaseToken, original.leaseToken);
    assert.equal(replacement.attempts, 2);
    assert.deepEqual({ from: replacement.from, to: replacement.to, reviewUrl: replacement.reviewUrl }, snapshot);
    assert.deepEqual(replacement.payload, message(input.id));
    assert.equal(String((await queueRow(input.id)).first_attempt_at), String(initialRow.first_attempt_at));
    assert.equal(await store.freezeProposalEmailMessage(original, { ...message(input.id), text: "Late worker body" }), null);
    await store.completeProposalEmailJob(original, { status: "accepted", providerId: "late-worker-provider-id" });
    assert.equal((await queueRow(input.id)).state, "sending");
    await store.completeProposalEmailJob(replacement, { status: "retry", code: "provider_unavailable" });
    await store.completeProposalEmailJob(original, { status: "rejected", code: "late-worker-rejection" });
    const fenced = await queueRow(input.id);
    assert.equal(fenced.state, "retry");
    assert.equal(fenced.error_code, "provider_unavailable");
    assert.equal(fenced.provider_id, null);
  });

  test("provider acceptance persists once and prevents any automatic resend", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const job = await requiredClaim();
    await store.freezeProposalEmailMessage(job, message(input.id));
    await store.completeProposalEmailJob(job, { status: "accepted", providerId: "synthetic-provider-id" });
    await makeDue(input.id);
    await expireLease(input.id);
    assert.equal(await store.claimProposalEmailJob(changedSnapshot), null);
    assert.equal((await queueRow(input.id)).provider_id, "synthetic-provider-id");
    assert.equal((await store.listProposalEmailJobs())[0].state, "accepted");
  });

  test("permanent provider rejection remains in the private queue for manual review", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const job = await requiredClaim();
    await store.completeProposalEmailJob(job, { status: "rejected", code: "provider_credentials_rejected" });
    await makeDue(input.id);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
    const row = await queueRow(input.id);
    assert.equal(row.state, "needs_review");
    assert.equal(row.error_code, "provider_credentials_rejected");
    assert.equal((await store.listProposalEmailJobs()).length, 1);
  });

  test("retry backoff and a provider Retry-After survive as database deadlines", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const job = await requiredClaim();
    await store.completeProposalEmailJob(job, { status: "retry", code: "provider_rate_limited", retryAfterMs: 120_000 });
    const result = await postgres.query("SELECT EXTRACT(EPOCH FROM next_attempt_at - updated_at)::int AS delay FROM carmelita_proposal_email_jobs WHERE proposal_id = $1", [input.id]);
    assert.ok(Number(result.rows[0].delay) >= 120);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
  });

  test("retry state and frozen complete payload recover in an independent process", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const job = await requiredClaim();
    await store.freezeProposalEmailMessage(job, message(input.id));
    await store.completeProposalEmailJob(job, { status: "retry", code: "provider_timeout" });
    await makeDue(input.id);
    await postgres.close();
    const result = spawnSync(process.execPath, [
      "--experimental-test-module-mocks", "--import", "tsx",
      fileURLToPath(import.meta.url), "--reopen", dataDirectory, input.id,
    ], { encoding: "utf8", timeout: 45000 });
    postgres = new PGlite(dataDirectory);
    await postgres.waitReady;
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    const row = await queueRow(input.id);
    assert.equal(row.state, "accepted");
    assert.equal(row.attempts, 2);
    assert.equal(row.provider_id, "synthetic-delivery-after-restart");
  });

  test("the idempotency retry window is measured from first attempt, not creation or latest retry", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    await postgres.query("UPDATE carmelita_proposal_email_jobs SET created_at = now() - interval '3 days' WHERE proposal_id = $1", [input.id]);
    const job = await requiredClaim();
    await store.completeProposalEmailJob(job, { status: "retry", code: "provider_timeout" });
    await postgres.query("UPDATE carmelita_proposal_email_jobs SET first_attempt_at = now() - interval '22 hours 59 minutes', next_attempt_at = now() - interval '1 minute' WHERE proposal_id = $1", [input.id]);
    const stillWithinWindow = await requiredClaim();
    await store.completeProposalEmailJob(stillWithinWindow, { status: "retry", code: "provider_timeout" });
    await postgres.query("UPDATE carmelita_proposal_email_jobs SET first_attempt_at = now() - interval '23 hours 1 minute', next_attempt_at = now() - interval '1 minute' WHERE proposal_id = $1", [input.id]);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
    const row = await queueRow(input.id);
    assert.equal(row.state, "needs_review");
    assert.equal(row.attempts, 2);
  });

  test("ageing does not overwrite an active lease and exhausted attempts require manual review", async () => {
    const input = proposal();
    await store.createProposalWithEmailJob(input);
    const job = await requiredClaim();
    await postgres.query("UPDATE carmelita_proposal_email_jobs SET first_attempt_at = now() - interval '24 hours' WHERE proposal_id = $1", [input.id]);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
    assert.equal((await queueRow(input.id)).state, "sending");
    await store.completeProposalEmailJob(job, { status: "retry", code: "provider_timeout" });
    await makeDue(input.id);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
    assert.equal((await queueRow(input.id)).state, "needs_review");
    await postgres.exec("TRUNCATE carmelita_proposal_email_jobs, integration_recommendations CASCADE");
    const exhausted = proposal("Exhausted synthetic service");
    await store.createProposalWithEmailJob(exhausted);
    await postgres.query("UPDATE carmelita_proposal_email_jobs SET attempts = 8 WHERE proposal_id = $1", [exhausted.id]);
    assert.equal(await store.claimProposalEmailJob(snapshot), null);
    assert.equal((await queueRow(exhausted.id)).state, "needs_review");
  });
}
