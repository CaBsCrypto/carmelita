-- LOCAL CANDIDATE ONLY. Separate operator transaction; never run by app/migrator.
-- Existing 0022 signer table (14 columns/10 constraints) remains unchanged.
-- CREATE without IF NOT EXISTS deliberately fails closed for an existing table.
BEGIN;
CREATE TABLE public.agent_bazaar_pilot_handoff (
  operation_id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.agent_users(id) ON DELETE RESTRICT,
  wallet_id text NOT NULL,
  intent_hash text NOT NULL,
  connection_hash text NOT NULL,
  state text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  nonce_hash text NOT NULL,
  approval_expires_at timestamptz NOT NULL,
  payload_encrypted text NOT NULL,
  payload_hash text,
  recovery_count integer NOT NULL DEFAULT 0 CHECK (recovery_count BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (wallet_id,user_id) REFERENCES public.agent_wallets(id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (operation_id,user_id) REFERENCES public.agent_bazaar_pilot_signer(operation_id,user_id) ON DELETE RESTRICT,
  CHECK (operation_id='ed6c4530-e76f-49e0-8f39-5ec8578820e2'::uuid AND intent_hash='668880738c6be6fde10b371a47c26c7474cc02dde964a1329116b6e15f88c6c5'),
  CHECK (connection_hash~'^[a-f0-9]{64}$' AND nonce_hash~'^[a-f0-9]{64}$' AND (payload_hash IS NULL OR payload_hash~'^[a-f0-9]{64}$')),
  CHECK (state IN ('approved','simulation-claimed','submit-claimed','observed','recovery-approved','recovery-claimed')),
  CHECK ((state IN ('approved','simulation-claimed') AND payload_hash IS NULL AND recovery_count=0) OR (state IN ('submit-claimed','observed','recovery-approved','recovery-claimed') AND payload_hash IS NOT NULL)),
  CHECK (state NOT IN ('recovery-approved','recovery-claimed') OR recovery_count=1),
  CHECK (payload_encrypted~'^bh1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND octet_length(payload_encrypted)<=262144)
);
COMMIT;
-- No rows, grants, role changes, signing flag or handoff flag are installed.
