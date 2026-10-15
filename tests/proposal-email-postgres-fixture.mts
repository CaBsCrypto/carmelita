import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { localProposalPostgresConfig, proposalPostgresSchema } from "../scripts/proposal-email-postgres-config.mjs";
import type { ProposalEmailJob } from "../app/integrations/proposal-email-store";

type QueryResult = { rows: Record<string, unknown>[] };
type Client = {
  connect: () => Promise<void>; end: () => Promise<void>;
  query: (query: string, params?: unknown[]) => Promise<QueryResult>;
};
type Driver = { Client: new (config: ReturnType<typeof localProposalPostgresConfig>) => Client };
const config = localProposalPostgresConfig(process.env.CARMELITA_PROPOSAL_PG_URL);
const driverUrl = new URL("../work/proposal-email-postgres-runtime/node_modules/pg/lib/index.js", import.meta.url);
const { default: driver } = await import(driverUrl.href) as { default: Driver };
const resume = process.argv[2] === "--resume";
const schema = resume ? process.argv[3] : `carmelita_proposal_qa_${randomUUID().replaceAll("-", "")}`;
const quotedSchema = proposalPostgresSchema(schema);
const marker = resume ? process.env.CARMELITA_PROPOSAL_PG_MARKER : randomUUID();
assert.ok(marker && /^[a-f0-9-]{36}$/.test(marker), "proposal_pg_marker_invalid");
const activeClients = new Set<Client>();
const connection = new AsyncLocalStorage<Client>();
const dialect = new PgDialect();
let networkRequests = 0;
let schemaOwned = false;
let first: Client;
let second: Client;
mock.method(globalThis, "fetch", async () => {
  networkRequests++;
  throw new Error("proposal_pg_external_fetch_forbidden");
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: {
    hasDatabase: () => true,
    getDb: () => ({ execute: async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      const selected = connection.getStore();
      assert.ok(selected, "proposal_pg_explicit_connection_required");
      return selected.query(query.sql, query.params);
    } }),
  },
});
const store = await import("../app/integrations/proposal-email-store");
const snapshot = { from: "notices@example.test", to: "reviewer@example.test", reviewUrl: "https://carmelita.example.test/admin/integrations" };
const changedSnapshot = { from: "changed@example.test", to: "other@example.test", reviewUrl: "https://changed.example.test/admin/integrations" };
const receipt: { name: string; passed: boolean }[] = [];
let currentCase = "connect and prepare owned schema";
function using<T>(client: Client, action: () => Promise<T>) { return connection.run(client, action); }
function proposal(name = "Synthetic PostgreSQL service") {
  return { id: randomUUID(), integrationName: name, email: "developer@example.test", useCase: "Synthetic proposal only", locale: "en", source: "developers" };
}
function message(id: string) {
  return { from: snapshot.from, to: [snapshot.to], subject: "Synthetic proposal", text: `Frozen synthetic body ${id}` };
}
async function client() {
  const value = new driver.Client(config);
  activeClients.add(value);
  await value.connect();
  await value.query(`SET statement_timeout = '5s'`);
  await value.query(`SET lock_timeout = '3s'`);
  await value.query(`SET search_path TO ${quotedSchema}`);
  return value;
}
async function row(id: string) {
  const result = await second.query("SELECT * FROM carmelita_proposal_email_jobs WHERE proposal_id = $1", [id]);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
async function claim(client: Client, current = snapshot): Promise<ProposalEmailJob> {
  const job = await using(client, () => store.claimProposalEmailJob(current));
  assert.ok(job, "proposal_pg_expected_job");
  return job;
}
async function close(client: Client) { await client.end(); activeClients.delete(client); }
async function scenario(name: string, action: () => Promise<void>) {
  currentCase = name;
  await second.query("TRUNCATE carmelita_proposal_email_jobs, integration_recommendations CASCADE");
  await action();
  receipt.push({ name, passed: true });
}
async function freshProcess(id: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-test-module-mocks", "--import", "tsx", fileURLToPath(import.meta.url), "--resume", schema, id,
    ], { env: { ...process.env, CARMELITA_PROPOSAL_PG_MARKER: marker }, stdio: "ignore" });
    const deadline = setTimeout(() => { child.kill(); reject(new Error("proposal_pg_resume_timeout")); }, 15000);
    child.once("error", () => { clearTimeout(deadline); reject(new Error("proposal_pg_resume_process_failed")); });
    child.once("exit", code => {
      clearTimeout(deadline);
      if (code === 0) resolve(); else reject(new Error("proposal_pg_resume_failed"));
    });
  });
}

try {
  first = await client();
  second = await client();
  const backendA = (await first.query("SELECT pg_backend_pid() AS pid, host(inet_server_addr()) AS host, version() AS version")).rows[0];
  const backendB = (await second.query("SELECT pg_backend_pid() AS pid, host(inet_server_addr()) AS host")).rows[0];
  assert.notEqual(backendA.pid, backendB.pid, "proposal_pg_independent_backends_required");
  assert.ok(["127.0.0.1", "::1"].includes(String(backendA.host)));
  assert.equal(backendA.host, backendB.host);
  assert.equal((await first.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0].rolsuper, false, "proposal_pg_non_superuser_required");
  if (resume) {
    const ownership = await first.query("SELECT marker FROM acceptance_owner");
    assert.deepEqual(ownership.rows, [{ marker }], "proposal_pg_schema_ownership_required");
    await using(first, () => store.ensureProposalEmailOutboxSchema());
    const id = process.argv[4];
    assert.match(id, /^[a-f0-9-]{36}$/);
    const persisted = await row(id);
    assert.equal(persisted.state, "retry");
    const job = await claim(second, changedSnapshot);
    assert.equal(job.proposalId, id);
    assert.equal(job.attempts, 2);
    const firstAttempt = persisted.first_attempt_at instanceof Date
      ? persisted.first_attempt_at.getTime() : Date.parse(String(persisted.first_attempt_at));
    assert.equal(new Date(job.firstAttemptAt).getTime(), firstAttempt);
    assert.deepEqual({ from: job.from, to: job.to, reviewUrl: job.reviewUrl }, snapshot);
    assert.deepEqual(job.payload, message(id));
    assert.deepEqual(await using(second, () => store.freezeProposalEmailMessage(job, { ...message(id), text: "Changed after process restart" })), message(id));
    await using(first, () => store.completeProposalEmailJob(job, { status: "accepted", providerId: "synthetic-resumed-provider-id" }));
  } else {
    currentCase = "prepare owned schema and production outbox DDL";
    // CREATE without IF NOT EXISTS ensures this process never adopts somebody else's schema.
    await first.query(`CREATE SCHEMA ${quotedSchema}`);
    schemaOwned = true;
    await first.query("CREATE TABLE acceptance_owner (marker text PRIMARY KEY)");
    await first.query("INSERT INTO acceptance_owner(marker) VALUES ($1)", [marker]);
    await first.query(`CREATE TABLE integration_recommendations (
      id text PRIMARY KEY, integration_name text NOT NULL, email text NOT NULL,
      use_case text, locale text NOT NULL DEFAULT 'en', source text NOT NULL DEFAULT 'landing',
      status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(email, integration_name)
    )`);
    await using(first, () => store.ensureProposalEmailOutboxSchema());

    await scenario("atomic proposal/outbox rollback", async () => {
      await first.query("ALTER TABLE carmelita_proposal_email_jobs ADD CONSTRAINT synthetic_failure CHECK(false)");
      try {
        await assert.rejects(using(first, () => store.createProposalWithEmailJob(proposal())));
        const counts = await second.query("SELECT (SELECT count(*)::int FROM integration_recommendations) AS proposals, (SELECT count(*)::int FROM carmelita_proposal_email_jobs) AS jobs");
        assert.deepEqual(counts.rows, [{ proposals: 0, jobs: 0 }]);
      } finally { await first.query("ALTER TABLE carmelita_proposal_email_jobs DROP CONSTRAINT synthetic_failure"); }
    });

    await scenario("duplicate proposal across independent connections", async () => {
      const input = proposal();
      const ids = await Promise.all([
        using(first, () => store.createProposalWithEmailJob(input)),
        using(second, () => store.createProposalWithEmailJob({ ...input, id: randomUUID() })),
      ]);
      assert.equal(ids.filter(Boolean).length, 1);
      assert.equal((await second.query("SELECT count(*)::int AS count FROM integration_recommendations")).rows[0].count, 1);
      assert.equal((await using(first, () => store.listProposalEmailJobs())).length, 1);
    });

    await scenario("simultaneous claims have exactly one independent winner", async () => {
      const input = proposal();
      await using(first, () => store.createProposalWithEmailJob(input));
      const jobs = await Promise.all([
        using(first, () => store.claimProposalEmailJob(snapshot)),
        using(second, () => store.claimProposalEmailJob(snapshot)),
      ]);
      assert.equal(jobs.filter(Boolean).length, 1);
      assert.equal(jobs.find(Boolean)?.proposalId, input.id);
      assert.equal((await row(input.id)).attempts, 1);
    });

    await scenario("SKIP LOCKED selects another job while oldest is transaction-locked", async () => {
      const oldest = proposal("Oldest synthetic service");
      const newer = proposal("Newer synthetic service");
      await using(first, () => store.createProposalWithEmailJob(oldest));
      await using(first, () => store.createProposalWithEmailJob(newer));
      await first.query("UPDATE carmelita_proposal_email_jobs SET created_at = now() - interval '1 day' WHERE proposal_id = $1", [oldest.id]);
      await first.query("BEGIN");
      try {
        await first.query("SELECT proposal_id FROM carmelita_proposal_email_jobs WHERE proposal_id = $1 FOR UPDATE", [oldest.id]);
        assert.equal((await claim(second)).proposalId, newer.id);
      } finally { await first.query("ROLLBACK"); }
      assert.equal((await claim(first)).proposalId, oldest.id);
    });

    await scenario("expired lease fences late payload, success and rejection", async () => {
      const input = proposal();
      await using(first, () => store.createProposalWithEmailJob(input));
      const old = await claim(first);
      await using(first, () => store.freezeProposalEmailMessage(old, message(input.id)));
      await second.query("UPDATE carmelita_proposal_email_jobs SET lease_expires_at = now() - interval '1 minute' WHERE proposal_id = $1", [input.id]);
      const replacement = await claim(second, changedSnapshot);
      assert.notEqual(old.leaseToken, replacement.leaseToken);
      assert.equal(replacement.attempts, 2);
      assert.deepEqual({ from: replacement.from, to: replacement.to, reviewUrl: replacement.reviewUrl }, snapshot);
      assert.deepEqual(replacement.payload, message(input.id));
      assert.equal(await using(first, () => store.freezeProposalEmailMessage(old, { ...message(input.id), text: "Late payload" })), null);
      await using(first, () => store.completeProposalEmailJob(old, { status: "accepted", providerId: "late-worker" }));
      assert.equal((await row(input.id)).state, "sending");
      await using(second, () => store.completeProposalEmailJob(replacement, { status: "retry", code: "provider_unavailable" }));
      await using(first, () => store.completeProposalEmailJob(old, { status: "rejected", code: "late_rejection" }));
      const fenced = await row(input.id);
      assert.equal(fenced.state, "retry");
      assert.equal(fenced.error_code, "provider_unavailable");
      assert.equal(fenced.provider_id, null);
    });

    await scenario("durable recovery in a fresh process with fresh backend connections", async () => {
      const input = proposal();
      await using(first, () => store.createProposalWithEmailJob(input));
      const job = await claim(first);
      await using(first, () => store.freezeProposalEmailMessage(job, message(input.id)));
      await using(first, () => store.completeProposalEmailJob(job, { status: "retry", code: "provider_unavailable" }));
      await second.query("UPDATE carmelita_proposal_email_jobs SET next_attempt_at = now() - interval '1 minute' WHERE proposal_id = $1", [input.id]);
      await close(first);
      await close(second);
      await freshProcess(input.id);
      first = await client();
      second = await client();
      const restored = await row(input.id);
      assert.equal(restored.state, "accepted");
      assert.equal(restored.provider_id, "synthetic-resumed-provider-id");
      assert.deepEqual(restored.payload, message(input.id));
      assert.equal(await using(first, () => store.claimProposalEmailJob(snapshot)), null);
    });
    assert.equal(networkRequests, 0);
    console.log(JSON.stringify({ status: "passed", engine: String(backendA.version), independentConnections: true, cases: receipt, externalFetches: 0 }));
  }
} catch {
  // No connection string, provider token, SQL text or raw PostgreSQL error is emitted.
  console.log(JSON.stringify({ status: "failed", code: "proposal_pg_acceptance_failed", failedCase: currentCase, completedCases: receipt }));
  process.exitCode = 1;
} finally {
  if (schemaOwned) {
    try {
      const cleaner = await client();
      const ownership = await cleaner.query("SELECT marker FROM acceptance_owner");
      assert.deepEqual(ownership.rows, [{ marker }], "proposal_pg_schema_ownership_required");
      await cleaner.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
    } catch { process.exitCode = 1; console.log("proposal_pg_owned_schema_cleanup_failed"); }
  }
  await Promise.allSettled([...activeClients].map(value => value.end()));
  assert.equal(networkRequests, 0);
}
