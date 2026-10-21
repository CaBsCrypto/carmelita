import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/db";
import { outcomeState, PREPARATION_LEASE_SECONDS, type PreparationFamily, type PreparationStatus, type FamilyOutcome } from "./preparation-state";
function connection() { const url = getDatabaseUrl(); if (!url) throw new Error("database_not_configured"); return neon(url); }
export type PreparationClaim = { jobId: string; userId: string; catalog: string; family: PreparationFamily; token: string; attempt: number; fence: number; leaseExpiresAt: string };
export type PreparationFamilyState = { family: PreparationFamily; status: PreparationStatus; attempts: number; retryable: boolean; errorCode: string | null; nextAttemptAt: string | null; leaseExpiresAt: string | null };
export type PreparationJobState = { id: string; userId: string; catalog: string; source: string; families: PreparationFamilyState[] };
function validateCatalog(catalog: string) { if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(catalog)) throw new Error("preparation_catalog_invalid"); }
export async function enqueue(userId: string, catalog: string, source: "normal_login" | "backfill") {
  validateCatalog(catalog);
  const id = createHash("sha256").update(`${userId}\0${catalog}`).digest("hex");
  const db = connection();
  // Both the deterministic ID and user/catalog are unique. Untargeted conflict
  // handling tolerates either index winning a concurrent insertion race.
  await db.query(`INSERT INTO wallet_preparation_jobs(id,user_id,catalog,source) SELECT $1,$2,$3,$4 FROM agent_users WHERE id=$2 AND status='active'
    ON CONFLICT DO NOTHING`, [id,userId,catalog,source]);
  // A fresh statement sees a concurrent winner after INSERT has waited for it.
  // Repeating this step recovers an interrupted enqueue without reopening work.
  await db.query(`INSERT INTO wallet_preparation_families(job_id,family)
    SELECT j.id,family FROM wallet_preparation_jobs j CROSS JOIN unnest(ARRAY['stellar','evm','solana']) AS family
    WHERE j.id=$1 AND j.user_id=$2 AND j.catalog=$3
    AND EXISTS(SELECT 1 FROM agent_users u WHERE u.id=j.user_id AND u.status='active')
    ON CONFLICT(job_id,family) DO NOTHING`, [id,userId,catalog]);
  return (await getStatus(userId,catalog))[0];
}
/** Operator-only fixed-inventory enrollment. Existing tasks are never reopened. */
export async function enqueueBackfill(userId: string, catalog: string, states: Record<PreparationFamily, "pending" | "complete" | "conflict">) {
  validateCatalog(catalog);
  if (!userId.startsWith("did:privy:") || !["stellar","evm","solana"].every(f => ["pending","complete","conflict"].includes(states[f as PreparationFamily]))) throw new Error("preparation_inventory_invalid");
  const id = createHash("sha256").update(`${userId}\0${catalog}`).digest("hex");
  await connection().query(`WITH job AS (
    INSERT INTO wallet_preparation_jobs(id,user_id,catalog,source)
    SELECT $1,$2,$3,'backfill' FROM agent_users u WHERE u.id=$2 AND u.status='active'
    AND (EXISTS(SELECT 1 FROM agent_wallets w WHERE w.user_id=u.id) OR EXISTS(SELECT 1 FROM wallet_preparation_jobs p WHERE p.user_id=u.id AND p.source='normal_login'))
    ON CONFLICT DO NOTHING RETURNING id
  ) INSERT INTO wallet_preparation_families(job_id,family,status,retryable,error_code,next_attempt_at)
    SELECT job.id,f.family,f.status,f.status='pending',CASE WHEN f.status='conflict' THEN 'identity_conflict' ELSE NULL END,
      CASE WHEN f.status='pending' THEN now() ELSE NULL END
    FROM job CROSS JOIN jsonb_to_recordset($4::jsonb) AS f(family text,status text)
    ON CONFLICT(job_id,family) DO NOTHING`, [id,userId,catalog,JSON.stringify(Object.entries(states).map(([family,status])=>({family,status})))]);
  return (await getStatus(userId,catalog))[0];
}
async function recoverExpired(userId?: string, catalog?: string) {
  await connection().query(`UPDATE wallet_preparation_families f SET status=CASE WHEN attempts>=6 THEN 'review' ELSE 'pending' END,
    retryable=true,error_code='lease_expired',lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=CASE WHEN attempts>=6 THEN NULL ELSE now()+make_interval(mins => (ARRAY[1,5,15,60,240])[attempts]) END,updated_at=now()
    FROM wallet_preparation_jobs j WHERE j.id=f.job_id AND f.status='running' AND f.lease_expires_at<=now()
    AND ($1::text IS NULL OR j.user_id=$1) AND ($2::text IS NULL OR j.catalog=$2)`, [userId ?? null,catalog ?? null]);
}
export async function claimJob(userId?: string, catalog?: string): Promise<PreparationClaim | null> {
  await recoverExpired(userId,catalog);
  const rows = await connection().query(`WITH candidate AS (
    SELECT f.job_id,f.family FROM wallet_preparation_families f JOIN wallet_preparation_jobs j ON j.id=f.job_id JOIN agent_users u ON u.id=j.user_id
    WHERE u.status='active' AND f.status='pending' AND f.attempts<6 AND f.next_attempt_at<=now()
    AND ($1::text IS NULL OR j.user_id=$1) AND ($2::text IS NULL OR j.catalog=$2)
    ORDER BY f.next_attempt_at,f.job_id,f.family FOR UPDATE OF f SKIP LOCKED LIMIT 1
  ), claimed AS (UPDATE wallet_preparation_families f SET status='running',attempts=attempts+1,fence=fence+1,
    lease_token=$3,lease_expires_at=now()+make_interval(secs => $4),updated_at=now()
    FROM candidate c WHERE f.job_id=c.job_id AND f.family=c.family RETURNING f.*)
    SELECT c.job_id AS "jobId",j.user_id AS "userId",j.catalog,c.family,c.lease_token AS token,c.attempts AS attempt,c.fence,c.lease_expires_at AS "leaseExpiresAt"
    FROM claimed c JOIN wallet_preparation_jobs j ON j.id=c.job_id`,[userId ?? null,catalog ?? null,randomUUID(),PREPARATION_LEASE_SECONDS]);
  return rows[0] as PreparationClaim ?? null;
}
export async function finishFamily(token: string, family: PreparationFamily, outcome: FamilyOutcome): Promise<boolean> {
  const db = connection();
  const rows = await db.query(`SELECT attempts FROM wallet_preparation_families WHERE lease_token=$1 AND family=$2 AND status='running' AND lease_expires_at>clock_timestamp()`,[token,family]);
  if (!rows[0]) return false;
  const next = outcomeState(rows[0].attempts as number,outcome);
  const result=await db.query(`UPDATE wallet_preparation_families SET status=$3,retryable=$4,error_code=$5,
    next_attempt_at=CASE WHEN $6::integer IS NULL THEN NULL ELSE now()+make_interval(secs => $6) END,
    lease_token=NULL,lease_expires_at=NULL,updated_at=now()
    WHERE lease_token=$1 AND family=$2 AND status='running' AND lease_expires_at>clock_timestamp() RETURNING job_id`,[token,family,next.status,next.retryable,next.code,next.delaySeconds]);
  return result.length===1;
}
export async function getStatus(userId: string, catalog?: string): Promise<PreparationJobState[]> {
  const rows=await connection().query(`SELECT j.id,j.user_id AS "userId",j.catalog,j.source,
    jsonb_agg(jsonb_build_object('family',f.family,'status',f.status,'attempts',f.attempts,'retryable',f.retryable,'errorCode',f.error_code,'nextAttemptAt',f.next_attempt_at,'leaseExpiresAt',f.lease_expires_at) ORDER BY f.family) AS families
    FROM wallet_preparation_jobs j JOIN wallet_preparation_families f ON f.job_id=j.id WHERE j.user_id=$1 AND ($2::text IS NULL OR j.catalog=$2)
    GROUP BY j.id ORDER BY j.created_at DESC`,[userId,catalog ?? null]);
  return rows as PreparationJobState[];
}
export async function retryTransient(userId: string,catalog: string) {
  const rows=await connection().query(`UPDATE wallet_preparation_families f SET status='pending',attempts=0,next_attempt_at=now(),error_code=NULL,updated_at=now()
    FROM wallet_preparation_jobs j WHERE j.id=f.job_id AND j.user_id=$1 AND j.catalog=$2 AND EXISTS (SELECT 1 FROM agent_users u WHERE u.id=j.user_id AND u.status='active') AND f.retryable=true AND f.status IN ('pending','review') RETURNING f.family`,[userId,catalog]);
  return rows.length;
}
export async function listDueUsers(catalog: string,limit=5): Promise<string[]> {
  validateCatalog(catalog); await recoverExpired(undefined,catalog);
  const rows=await connection().query(`SELECT j.user_id FROM wallet_preparation_jobs j JOIN wallet_preparation_families f ON f.job_id=j.id
    WHERE EXISTS (SELECT 1 FROM agent_users u WHERE u.id=j.user_id AND u.status='active') AND j.catalog=$1 AND f.status='pending' AND f.attempts<6 AND f.next_attempt_at<=now() GROUP BY j.user_id ORDER BY min(f.next_attempt_at) LIMIT $2`,[catalog,Number.isFinite(limit) ? Math.max(1,Math.min(5,Math.floor(limit))) : 5]);
  return rows.map(row=>String(row.user_id));
}
// Execute this condition within the SAME transaction as identity writes, locking the family row first.
export const PREPARATION_FENCE_LOCK_SQL = `SELECT job_id FROM wallet_preparation_families WHERE job_id=$1 AND family=$2 AND lease_token=$3 AND fence=$4 AND status='running' AND lease_expires_at>clock_timestamp() FOR UPDATE`;


