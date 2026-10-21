CREATE TABLE "wallet_preparation_jobs" (
 "id" text PRIMARY KEY,
 "user_id" text NOT NULL REFERENCES "agent_users"("id") ON DELETE CASCADE,
 "catalog" text NOT NULL,
 "source" text NOT NULL CHECK (source IN ('normal_login','backfill')),
 "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_preparation_jobs_user_catalog_uidx" ON "wallet_preparation_jobs" (user_id,catalog);
--> statement-breakpoint
CREATE TABLE "wallet_preparation_families" (
 "job_id" text NOT NULL REFERENCES "wallet_preparation_jobs"("id") ON DELETE CASCADE,
 "family" text NOT NULL CHECK (family IN ('stellar','evm','solana')),
 "status" text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','review','conflict')),
 "attempts" integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 6),
 "fence" integer NOT NULL DEFAULT 0,
 "lease_token" text,
 "lease_expires_at" timestamptz,
 "next_attempt_at" timestamptz DEFAULT now(),
 "retryable" boolean NOT NULL DEFAULT true,
 "error_code" text,
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,family),
 CHECK ((status='running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_preparation_token_uidx" ON "wallet_preparation_families" (lease_token) WHERE lease_token IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "wallet_preparation_due_idx" ON "wallet_preparation_families" (status,next_attempt_at);
