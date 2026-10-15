import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import type { ProposalEmailMessage } from "./proposal-email";

export const PROPOSAL_EMAIL_MAX_ATTEMPTS = 8;
export const PROPOSAL_EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000;
type Snapshot = { from: string; to: string; reviewUrl: string };
export type ProposalEmailJob = Snapshot & {
  proposalId: string; leaseToken: string; attempts: number;
  firstAttemptAt: string; payload: ProposalEmailMessage | null;
};
type Result =
  | { status: "accepted"; providerId: string }
  | { status: "retry"; code: string; retryAfterMs?: number }
  | { status: "rejected"; code: string };

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await getDb().execute(query);
  return result.rows as T[];
}

let schemaPromise: Promise<void> | undefined;
export function ensureProposalEmailOutboxSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = (async () => {
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS carmelita_proposal_email_jobs (
      proposal_id text PRIMARY KEY REFERENCES integration_recommendations(id) ON DELETE CASCADE,
      state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','retry','accepted','needs_review')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      next_attempt_at timestamptz NOT NULL DEFAULT now(), first_attempt_at timestamptz,
      lease_token text, lease_expires_at timestamptz,
      mail_from text, mail_to text, review_url text, payload jsonb,
      provider_id text, error_code text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await getDb().execute(sql`CREATE INDEX IF NOT EXISTS carmelita_proposal_email_jobs_due_idx
      ON carmelita_proposal_email_jobs(state, next_attempt_at)`);
  })().catch(error => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

/** One SQL statement commits both records, or neither. Only enabled developer proposals call this. */
export async function createProposalWithEmailJob(input: {
  id: string; integrationName: string; email: string; useCase?: string; locale: string; source: string;
}): Promise<string | undefined> {
  await ensureProposalEmailOutboxSchema();
  const created = await rows<{ id: string }>(sql`WITH created AS (
    INSERT INTO integration_recommendations(id, integration_name, email, use_case, locale, source)
    VALUES (${input.id}, ${input.integrationName}, ${input.email}, ${input.useCase ?? null}, ${input.locale}, ${input.source})
    ON CONFLICT (email, integration_name) DO NOTHING RETURNING id
  ), queued AS (
    INSERT INTO carmelita_proposal_email_jobs(proposal_id) SELECT id FROM created RETURNING proposal_id
  ) SELECT id FROM created`);
  return created[0]?.id;
}

export async function claimProposalEmailJob(snapshot: Snapshot): Promise<ProposalEmailJob | null> {
  await ensureProposalEmailOutboxSchema();
  // A live worker must finish under its lease; expired uncertain attempts require review.
  await getDb().execute(sql`UPDATE carmelita_proposal_email_jobs SET
    state = 'needs_review', error_code = CASE WHEN attempts >= ${PROPOSAL_EMAIL_MAX_ATTEMPTS}
      THEN 'attempt_limit' ELSE 'idempotency_window_expired' END,
    lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE state IN ('pending','retry','sending')
      AND (state <> 'sending' OR lease_expires_at <= now())
      AND (attempts >= ${PROPOSAL_EMAIL_MAX_ATTEMPTS} OR first_attempt_at <= now() - interval '23 hours')`);
  const claimed = await rows<ProposalEmailJob>(sql`WITH candidate AS (
    SELECT proposal_id FROM carmelita_proposal_email_jobs
    WHERE ((state IN ('pending','retry') AND next_attempt_at <= now())
      OR (state = 'sending' AND lease_expires_at <= now()))
      AND attempts < ${PROPOSAL_EMAIL_MAX_ATTEMPTS}
      AND (first_attempt_at IS NULL OR first_attempt_at > now() - interval '23 hours')
    ORDER BY created_at, proposal_id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE carmelita_proposal_email_jobs AS job SET
    state = 'sending', attempts = job.attempts + 1, lease_token = ${randomUUID()},
    lease_expires_at = now() + interval '60 seconds', first_attempt_at = COALESCE(job.first_attempt_at, now()),
    mail_from = COALESCE(job.mail_from, ${snapshot.from}), mail_to = COALESCE(job.mail_to, ${snapshot.to}),
    review_url = COALESCE(job.review_url, ${snapshot.reviewUrl}), updated_at = now()
    FROM candidate WHERE job.proposal_id = candidate.proposal_id
    RETURNING job.proposal_id AS "proposalId", job.lease_token AS "leaseToken", job.attempts,
      job.first_attempt_at AS "firstAttemptAt", job.mail_from AS "from", job.mail_to AS "to",
      job.review_url AS "reviewUrl", job.payload`);
  if (!claimed[0]) return null;
  const job = claimed[0];
  return { ...job, firstAttemptAt: new Date(job.firstAttemptAt).toISOString() };
}

/** Freeze the full provider request before any external call, fenced by the current lease. */
export async function freezeProposalEmailMessage(job: ProposalEmailJob, message: ProposalEmailMessage): Promise<ProposalEmailMessage | null> {
  const saved = await rows<{ payload: ProposalEmailMessage }>(sql`UPDATE carmelita_proposal_email_jobs
    SET payload = COALESCE(payload, ${JSON.stringify(message)}::jsonb), updated_at = now()
    WHERE proposal_id = ${job.proposalId} AND lease_token = ${job.leaseToken} AND state = 'sending'
      AND lease_expires_at > now() RETURNING payload`);
  return saved[0]?.payload ?? null;
}

export async function completeProposalEmailJob(job: ProposalEmailJob, result: Result): Promise<void> {
  const safeCode = result.status === "accepted" ? null
    : /^[a-z0-9_]{1,80}$/.test(result.code) ? result.code : "provider_error";
  if (result.status === "accepted") {
    await getDb().execute(sql`UPDATE carmelita_proposal_email_jobs SET state = 'accepted',
      provider_id = ${result.providerId}, error_code = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE proposal_id = ${job.proposalId} AND lease_token = ${job.leaseToken} AND state = 'sending'`);
    return;
  }
  const backoff = Math.min(900_000, 30_000 * 2 ** Math.min(job.attempts - 1, 8));
  const retryAfter = result.status === "retry" && Number.isFinite(result.retryAfterMs)
    ? Math.max(0, Math.min(86_400_000, result.retryAfterMs!)) : 0;
  const delay = Math.max(backoff, retryAfter);
  await getDb().execute(sql`UPDATE carmelita_proposal_email_jobs SET
    state = CASE WHEN ${result.status === "rejected"} OR attempts >= ${PROPOSAL_EMAIL_MAX_ATTEMPTS}
      OR first_attempt_at <= now() - interval '23 hours' THEN 'needs_review' ELSE 'retry' END,
    error_code = ${safeCode}, next_attempt_at = now() + (${delay}::double precision * interval '1 millisecond'),
    lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE proposal_id = ${job.proposalId} AND lease_token = ${job.leaseToken} AND state = 'sending'`);
}

export async function listProposalEmailJobs(): Promise<{
  proposalId: string; state: string; attempts: number; errorCode: string | null; providerId: string | null; updatedAt: string;
}[]> {
  await ensureProposalEmailOutboxSchema();
  return rows(sql`SELECT proposal_id AS "proposalId", state, attempts, error_code AS "errorCode",
    provider_id AS "providerId", updated_at AS "updatedAt" FROM carmelita_proposal_email_jobs
    ORDER BY created_at DESC LIMIT 100`);
}
