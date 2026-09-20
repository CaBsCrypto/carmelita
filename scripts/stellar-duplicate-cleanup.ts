export type StellarDuplicateCleanup = {
  userId: string;
  keepId: string;
  keepAddress: string;
  removeId: string;
  removeAddress: string;
  expectedPublicTables: number;
};

/** SQL only. Operator must verify destination, Privy, network, backup and maintenance. */
export function buildStellarDuplicateCleanup(input: StellarDuplicateCleanup, mode: "rehearse" | "apply" = "rehearse") {
  if (mode !== "rehearse" && mode !== "apply") throw new Error("cleanup_invalid_mode");
  if (!/^did:privy:[a-zA-Z0-9_-]+$/.test(input.userId) ||
    ![input.keepId,input.removeId].every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
    ![input.keepAddress,input.removeAddress].every(address => /^G[A-Z2-7]{55}$/.test(address)) ||
    input.keepId === input.removeId || input.keepAddress === input.removeAddress ||
    !Number.isSafeInteger(input.expectedPublicTables) || input.expectedPublicTables < 1) throw new Error("cleanup_invalid_identity");
  const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(1729361921,1886545261);
CREATE TEMP TABLE cleanup_expected(schema_name text,table_name text,rows bigint,digest text) ON COMMIT DROP;
DO $cleanup$
DECLARE t record; n bigint; affected bigint; observed_digest text; baseline record;
BEGIN
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')<>${input.expectedPublicTables}
  THEN RAISE EXCEPTION 'cleanup_table_inventory_changed'; END IF;
  FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE' ORDER BY table_schema,table_name LOOP
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',t.table_schema,t.table_name);
  END LOOP;
  IF (SELECT count(*) FROM public.agent_wallets WHERE user_id=${q(input.userId)} AND network='stellar:testnet')<>2 OR
    NOT EXISTS(SELECT 1 FROM public.agent_wallets WHERE id=${q(input.keepId)} AND user_id=${q(input.userId)} AND address=${q(input.keepAddress)} AND chain_type='stellar' AND network='stellar:testnet' AND status='active') OR
    NOT EXISTS(SELECT 1 FROM public.agent_wallets WHERE id=${q(input.removeId)} AND user_id=${q(input.userId)} AND address=${q(input.removeAddress)} AND chain_type='stellar' AND network='stellar:testnet' AND status='pending')
  THEN RAISE EXCEPTION 'cleanup_identity_changed'; END IF;
  FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE' ORDER BY table_schema,table_name LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I t WHERE position(%L in to_jsonb(t)::text)>0 OR position(%L in to_jsonb(t)::text)>0',t.table_schema,t.table_name,${q(input.removeId)},${q(input.removeAddress)}) INTO n;
    IF t.table_schema='public' AND t.table_name='agent_activities' THEN
      IF n<>1 OR (SELECT count(*) FROM public.agent_activities a WHERE (position(${q(input.removeId)} in to_jsonb(a)::text)>0 OR position(${q(input.removeAddress)} in to_jsonb(a)::text)>0) AND event_type='wallet.created' AND user_id=${q(input.userId)})<>1
      THEN RAISE EXCEPTION 'cleanup_activity_changed'; END IF;
    ELSIF t.table_schema='public' AND t.table_name='agent_wallets' THEN
      IF n<>1 THEN RAISE EXCEPTION 'cleanup_wallet_references'; END IF;
    ELSIF n<>0 THEN RAISE EXCEPTION 'cleanup_unexpected_reference'; END IF;
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t %s',t.table_schema,t.table_name,
      CASE WHEN t.table_schema='public' AND t.table_name='agent_wallets' THEN format('WHERE id<>%L',${q(input.removeId)}) ELSE '' END) INTO n,observed_digest;
    INSERT INTO cleanup_expected VALUES(t.table_schema,t.table_name,n,observed_digest);
  END LOOP;
  DELETE FROM public.agent_wallets WHERE id=${q(input.removeId)} AND user_id=${q(input.userId)} AND address=${q(input.removeAddress)} AND chain_type='stellar' AND network='stellar:testnet' AND status='pending';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'cleanup_delete_count'; END IF;
  FOR baseline IN SELECT * FROM cleanup_expected LOOP
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t',baseline.schema_name,baseline.table_name) INTO n,observed_digest;
    IF n<>baseline.rows OR observed_digest IS DISTINCT FROM baseline.digest THEN RAISE EXCEPTION 'cleanup_unexpected_data_change'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.agent_wallets WHERE user_id=${q(input.userId)} AND network='stellar:testnet')<>1 THEN RAISE EXCEPTION 'cleanup_final_identity_count'; END IF;
END $cleanup$;
SELECT 'exactly_one_wallet_removed_other_rows_unchanged' AS result,${q(mode)} AS mode,(SELECT count(*) FROM cleanup_expected) AS tables_verified,(SELECT count(*) FROM public.agent_wallets) AS wallets;
${mode === "apply" ? "COMMIT" : "ROLLBACK"};`;
}
