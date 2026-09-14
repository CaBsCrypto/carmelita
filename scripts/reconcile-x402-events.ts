import { readPreviewMigrationFiles } from "./preview-migrate";

/** Generates an explicit operator-reviewed transaction. Never connects or executes. */
export function buildX402EventsReconciliation(mode: "rehearse" | "apply" = "rehearse") {
  if (mode !== "rehearse" && mode !== "apply") throw new Error("reconciliation_invalid_mode");
  const migrations = readPreviewMigrationFiles();
  const target = migrations[19];
  if (!target || target.folderMillis !== 1788825600000) throw new Error("reconciliation_migration_changed");
  const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  const history = migrations.slice(0, 19).map((m, i) => `(${i + 1}, ${m.folderMillis}::bigint, ARRAY[${(m.acceptedHashes ?? [m.hash]).map(literal).join(",")}])`).join(",\n");
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(1729361921,1886545261);
LOCK TABLE drizzle.__drizzle_migrations, public.agent_x402_events IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE reconciliation_before ON COMMIT DROP AS
SELECT count(*) AS n, md5(coalesce(string_agg(to_jsonb(e)::text,'|' ORDER BY id),'')) AS digest FROM public.agent_x402_events e;
DO $verify$
DECLARE actual jsonb; expected jsonb; rel record;
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 19 THEN RAISE EXCEPTION 'reconciliation_journal_count'; END IF;
  IF EXISTS (
    WITH expected(n,stamp,hashes) AS (VALUES ${history}),
    actual AS (SELECT row_number() OVER (ORDER BY created_at,id) AS n,created_at,hash FROM drizzle.__drizzle_migrations)
    SELECT 1 FROM expected e FULL JOIN actual a USING(n) WHERE a.created_at IS DISTINCT FROM e.stamp OR NOT(a.hash=ANY(e.hashes))
  ) THEN RAISE EXCEPTION 'reconciliation_journal_drift'; END IF;
  SELECT * INTO rel FROM pg_class WHERE oid='public.agent_x402_events'::regclass;
  IF rel.relkind <> 'r' OR rel.relpersistence <> 'p' OR rel.relrowsecurity OR rel.relforcerowsecurity
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=rel.oid AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=rel.oid OR inhparent=rel.oid)
  THEN RAISE EXCEPTION 'reconciliation_table_drift'; END IF;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attidentity,a.attgenerated) ORDER BY a.attnum)
  INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=rel.oid AND a.attnum>0 AND NOT a.attisdropped;
  expected := '[["id","text",true,"","",""],["payment_id","text",true,"","",""],["user_id","text",true,"","",""],["event_type","text",true,"","",""],["payload","jsonb",true,"''{}''::jsonb","",""],["created_at","timestamp with time zone",true,"now()","",""]]'::jsonb;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'reconciliation_column_drift'; END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE a.attrelid=rel.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attcollation<>t.typcollation)
  THEN RAISE EXCEPTION 'reconciliation_collation_drift'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=rel.oid)<>3 OR EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid=rel.oid AND (NOT convalidated OR condeferrable OR condeferred OR
      NOT ((contype='p' AND conkey=ARRAY[1]::smallint[]) OR
        (contype='f' AND confdeltype='c' AND confupdtype='a' AND confmatchtype='s' AND (
          (conkey=ARRAY[2]::smallint[] AND confrelid='public.agent_x402_payments'::regclass AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.agent_x402_payments'::regclass AND attname='id')]::smallint[]) OR
          (conkey=ARRAY[3]::smallint[] AND confrelid='public.agent_users'::regclass AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.agent_users'::regclass AND attname='id')]::smallint[])
        )))
    )
  ) THEN RAISE EXCEPTION 'reconciliation_constraint_drift'; END IF;
  SELECT jsonb_agg(jsonb_build_array(c.relname,i.indisunique,i.indisprimary,am.amname,i.indkey::text) ORDER BY c.relname) INTO actual
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam WHERE i.indrelid=rel.oid;
  expected := '[["agent_x402_events_payment_created_idx",false,false,"btree","2 6"],["agent_x402_events_pkey",true,true,"btree","1"],["agent_x402_events_type_idx",false,false,"btree","4"],["agent_x402_events_user_created_idx",false,false,"btree","3 6"]]'::jsonb;
  IF actual IS DISTINCT FROM expected OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=rel.oid AND (NOT indisvalid OR NOT indisready OR indpred IS NOT NULL OR indexprs IS NOT NULL OR indnatts<>indnkeyatts OR indoption::text !~ '^0( 0)*$'))
  THEN RAISE EXCEPTION 'reconciliation_index_drift'; END IF;
  IF EXISTS(SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indclass::oid[],i.indcollation::oid[],i.indkey::smallint[]) AS k(opclass,collation_oid,attnum)
    JOIN pg_opclass op ON op.oid=k.opclass JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
    WHERE i.indrelid=rel.oid AND (NOT op.opcdefault OR k.collation_oid<>a.attcollation))
  THEN RAISE EXCEPTION 'reconciliation_index_options'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=rel.oid AND conname='agent_x402_events_payment_id_fkey' AND conkey=ARRAY[2]::smallint[]) OR
    NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=rel.oid AND conname='agent_x402_events_user_id_fkey' AND conkey=ARRAY[3]::smallint[])
  THEN RAISE EXCEPTION 'reconciliation_constraint_names'; END IF;
END $verify$;
ALTER TABLE public.agent_x402_events RENAME CONSTRAINT agent_x402_events_payment_id_fkey TO agent_x402_events_payment_id_agent_x402_payments_id_fk;
ALTER TABLE public.agent_x402_events RENAME CONSTRAINT agent_x402_events_user_id_fkey TO agent_x402_events_user_id_agent_users_id_fk;
INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES (${literal(target.hash)},${target.folderMillis});
DO $verify$
BEGIN
  IF EXISTS(SELECT * FROM reconciliation_before EXCEPT SELECT count(*),md5(coalesce(string_agg(to_jsonb(e)::text,'|' ORDER BY id),'')) FROM public.agent_x402_events e)
  THEN RAISE EXCEPTION 'reconciliation_content_changed'; END IF;
END $verify$;
SELECT 'schema_verified_and_reconciled' AS result, ${literal(mode)} AS mode, (SELECT count(*) FROM drizzle.__drizzle_migrations) AS journal_count;
${mode === "apply" ? "COMMIT" : "ROLLBACK"};`;
}
