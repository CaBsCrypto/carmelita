-- One atomic operator-only statement. No normal migration runner, rows or grants.
DO $schema$
DECLARE
  definition text := $definition$(
  operation_id uuid CONSTRAINT agent_bazaar_pilot_signer_pkey PRIMARY KEY,
  user_id text NOT NULL CONSTRAINT agent_bazaar_pilot_signer_user_id_fkey REFERENCES public.agent_users(id) ON DELETE RESTRICT,
  wallet_id text NOT NULL,
  intent_hash text NOT NULL,
  connection_hash text NOT NULL,
  state text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  nonce_hash text NOT NULL,
  approval_expires_at timestamptz NOT NULL,
  payload_encrypted text NOT NULL,
  dispatch_digest text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT agent_bazaar_pilot_signer_owner_unique UNIQUE (operation_id, user_id),
  CONSTRAINT agent_bazaar_pilot_signer_wallet_owner_fk FOREIGN KEY (wallet_id,user_id)
    REFERENCES public.agent_wallets(id,user_id) ON DELETE RESTRICT,
  CONSTRAINT agent_bazaar_pilot_signer_intent CHECK
    (operation_id='ed6c4530-e76f-49e0-8f39-5ec8578820e2'::uuid AND
     intent_hash='668880738c6be6fde10b371a47c26c7474cc02dde964a1329116b6e15f88c6c5'),
  CONSTRAINT agent_bazaar_pilot_signer_hashes CHECK
    (connection_hash ~ '^[a-f0-9]{64}$' AND nonce_hash ~ '^[a-f0-9]{64}$' AND
     (dispatch_digest IS NULL OR dispatch_digest ~ '^[a-f0-9]{64}$')),
  CONSTRAINT agent_bazaar_pilot_signer_states CHECK
    (state IN ('review','challenge-claimed','challenge-bound','dispatch-claimed','signed','uncertain')),
  CONSTRAINT agent_bazaar_pilot_signer_revision CHECK (revision >= 0),
  CONSTRAINT agent_bazaar_pilot_signer_cipher CHECK
    (payload_encrypted ~ '^bp1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' AND
     octet_length(payload_encrypted) <= 131072),
  CONSTRAINT agent_bazaar_pilot_signer_dispatch CHECK
    ((state IN ('dispatch-claimed','signed') AND dispatch_digest IS NOT NULL AND claimed_at IS NOT NULL)
     OR state NOT IN ('dispatch-claimed','signed'))
)$definition$;
  canonical text; actual jsonb; expected jsonb;
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.agent_bazaar_pilot_signer ' || definition;
  -- Canonical independent definition, never LIKE/copy of the observed table.
  -- PostgreSQL forbids TEMP -> permanent foreign keys. Remove only these two
  -- literal declarations from the independent definition, then verify both
  -- permanent FKs separately by catalog identity/keys/actions below.
  canonical := replace(definition,
    ' CONSTRAINT agent_bazaar_pilot_signer_user_id_fkey REFERENCES public.agent_users(id) ON DELETE RESTRICT','');
  canonical := replace(canonical,
    E'  CONSTRAINT agent_bazaar_pilot_signer_wallet_owner_fk FOREIGN KEY (wallet_id,user_id)\n    REFERENCES public.agent_wallets(id,user_id) ON DELETE RESTRICT,\n','');
  EXECUTE 'CREATE TEMP TABLE _carmelita_pilot_signer_expected ' || canonical || ' ON COMMIT DROP';
  SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::regcollation::text,
    'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO actual
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.agent_bazaar_pilot_signer'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::regcollation::text,
    'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO expected
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='pg_temp._carmelita_pilot_signer_expected'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'pilot_signer_columns_or_defaults_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid,true),
    'validated',convalidated,'deferrable',condeferrable,'deferred',condeferred) ORDER BY conname) INTO actual
    FROM pg_constraint WHERE conrelid='public.agent_bazaar_pilot_signer'::regclass AND contype<>'f';
  SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid,true),
    'validated',convalidated,'deferrable',condeferrable,'deferred',condeferred) ORDER BY conname) INTO expected
    FROM pg_constraint WHERE conrelid='pg_temp._carmelita_pilot_signer_expected'::regclass;
  IF jsonb_array_length(actual)<>8 OR actual IS DISTINCT FROM expected
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.agent_bazaar_pilot_signer'::regclass)<>10
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_bazaar_pilot_signer'::regclass
      AND conname='agent_bazaar_pilot_signer_user_id_fkey' AND contype='f' AND confrelid='public.agent_users'::regclass
      AND conkey=ARRAY[2]::smallint[] AND confkey=ARRAY[1]::smallint[] AND confdeltype='r' AND confupdtype='a' AND confmatchtype='s'
      AND convalidated AND NOT condeferrable AND NOT condeferred)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_bazaar_pilot_signer'::regclass
      AND conname='agent_bazaar_pilot_signer_wallet_owner_fk' AND contype='f' AND confrelid='public.agent_wallets'::regclass
      AND conkey=ARRAY[3,2]::smallint[] AND confkey=ARRAY[1,2]::smallint[] AND confdeltype='r' AND confupdtype='a' AND confmatchtype='s'
      AND convalidated AND NOT condeferrable AND NOT condeferred)
  THEN RAISE EXCEPTION 'pilot_signer_constraints_mismatch'; END IF;
  IF (SELECT relpersistence<>'p' OR relkind<>'r' OR relrowsecurity OR relforcerowsecurity
      FROM pg_class WHERE oid='public.agent_bazaar_pilot_signer'::regclass)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.agent_bazaar_pilot_signer'::regclass AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid='public.agent_bazaar_pilot_signer'::regclass
      OR inhparent='public.agent_bazaar_pilot_signer'::regclass)
  THEN RAISE EXCEPTION 'pilot_signer_table_behavior_mismatch'; END IF;
END $schema$;
