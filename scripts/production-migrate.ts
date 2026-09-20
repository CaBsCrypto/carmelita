import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { applyPreviewMigrations, pendingPreviewMigrationStatements, readPreviewMigrationFiles, type PreviewMigrationJournalEntry } from "./preview-migrate";
import { firewallDependencies, verifyFirewallMaintenance } from "./production-firewall";

type Environment = Record<string, string | undefined>;
const liveOrigin = "https://carmelita-agent.vercel.app";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function required(env: Environment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`production_migration_missing_${key}`);
  return value;
}

export function productionMigrationConfig(env: Environment, head: string) {
  if (env.VERCEL_ENV !== "production" || env.VERCEL_TARGET_ENV === "preview" || Object.keys(env).some(key => key.startsWith("CARMELITA_PREVIEW_") && env[key] !== undefined)) throw new Error("production_migration_environment");
  const commit = required(env, "CARMELITA_RELEASE_COMMIT");
  if (!/^[a-f0-9]{40}$/.test(commit) || commit !== head) throw new Error("production_migration_commit");
  const runtimeValue = env.DATABASE_URL || env.DATABASE_URL_DATABASE_URL || env.DATABASE_URL_UNPOOLED;
  const migrationValue = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || env.DATABASE_URL_DATABASE_URL;
  function parse(value: string | undefined) {
    let url: URL;
    try { url = new URL(value ?? ""); } catch { throw new Error("production_migration_connection"); }
    if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.username || !url.password || url.hash || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) || (url.port && url.port !== "5432")) throw new Error("production_migration_connection");
    const allowed = new Set(["sslmode", "channel_binding", "connect_timeout", "application_name"]);
    if ([...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1) || !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) throw new Error("production_migration_connection_options");
    return url;
  }
  const runtime = parse(runtimeValue), migration = parse(migrationValue);
  const identity = (url: URL) => `${url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}${url.pathname}`;
  const fingerprint = sha(identity(runtime));
  if (fingerprint !== required(env, "CARMELITA_PRODUCTION_DATABASE_FINGERPRINT") || fingerprint === required(env, "CARMELITA_QA_DATABASE_FINGERPRINT")) throw new Error("production_migration_resource");
  if (identity(runtime) !== identity(migration) || runtime.username !== migration.username || runtime.password !== migration.password || migration.hostname.split(".")[0].endsWith("-pooler")) throw new Error("production_migration_connections_disagree");
  return { commit, fingerprint, migrationUrl: migration.toString() };
}

export function validateReleaseEvidence(value: unknown, fingerprint: string, commit: string, now = Date.now()) {
  const evidence = value as Record<string, unknown> | null;
  if (!evidence || evidence.databaseFingerprint !== fingerprint || evidence.commit !== commit || evidence.restoreVerified !== true || evidence.rollbackCompatible !== true || typeof evidence.backupId !== "string" || !evidence.backupId || typeof evidence.maintenanceCommit !== "string" || !/^[a-f0-9]{40}$/.test(evidence.maintenanceCommit)) throw new Error("production_migration_release_evidence");
  const date = typeof evidence.verifiedAt === "string" ? Date.parse(evidence.verifiedAt) : NaN;
  if (!Number.isFinite(date) || date > now || now - date > 60 * 60 * 1000) throw new Error("production_migration_stale_evidence");
  if (evidence.maintenanceMode !== undefined && !["application", "firewall"].includes(String(evidence.maintenanceMode))) throw new Error("production_migration_maintenance_mode");
  if (evidence.maintenanceMode === "firewall" &&
      (typeof evidence.firewallRuleId !== "string" || !/^rule_[\w-]+$/.test(evidence.firewallRuleId) ||
       typeof evidence.maintenanceDeploymentId !== "string" || !/^dpl_[\w]+$/.test(evidence.maintenanceDeploymentId))) throw new Error("production_migration_release_evidence");
  return evidence;
}

export async function runProductionMigration(args = process.argv.slice(2), env: Environment = process.env) {
  if (args.length > 1 || (args.length === 1 && !["inspect", "apply"].includes(args[0]))) throw new Error("production_migration_arguments");
  const applying = args[0] === "apply";
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
  const config = productionMigrationConfig(env, head);
  const sql = neon(config.migrationUrl);
  const migrations = readPreviewMigrationFiles();
  const journalQuery = 'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id';
  // An absent or inconsistent journal is a blocking inventory problem, never bootstrapped on production.
  const journal = await sql.query(journalQuery) as PreviewMigrationJournalEntry[];
  const statements = pendingPreviewMigrationStatements(migrations, journal);
  const conflicts = await sql.query(`SELECT
    (SELECT count(*)::int FROM (SELECT user_id FROM agent_wallets WHERE chain_type='ethereum' GROUP BY user_id HAVING count(*)>1) x) AS evm_owners,
    (SELECT count(*)::int FROM (SELECT lower(address) FROM agent_wallets WHERE chain_type='ethereum' GROUP BY lower(address) HAVING count(*)>1) x) AS evm_addresses,
    (SELECT count(*)::int FROM (SELECT user_id,network FROM agent_wallets GROUP BY user_id,network HAVING count(*)>1) x) AS network_owners,
    (SELECT count(*)::int FROM agent_wallets w LEFT JOIN agent_users u ON u.id=w.user_id WHERE u.id IS NULL) AS orphan_owners,
    (SELECT count(*)::int FROM agent_wallets WHERE NOT ((chain_type='stellar' AND network='stellar:testnet') OR (chain_type='ethereum' AND network IN ('avalanche:fuji','bnb:testnet','base:sepolia')) OR (chain_type='solana' AND network='solana:devnet'))) AS incompatible_networks`);
  if (Object.values(conflicts[0]).some(value => Number(value) !== 0)) throw new Error("production_migration_wallet_conflict");
  async function identitySnapshot() {
    const wallets = await sql.query('SELECT id,user_id,address,chain_type,network,status,created_at,updated_at FROM agent_wallets ORDER BY id');
    const payments = await sql.query('SELECT id,user_id,wallet_id,wallet_address,network,asset_contract,pay_to,amount_atomic,status,idempotency_key,transaction_hash,created_at FROM agent_x402_payments ORDER BY id');
    return { wallets: wallets.length, payments: payments.length, walletHash: sha(JSON.stringify(wallets)), paymentOwnerHash: sha(JSON.stringify(payments)) };
  }
  const before = await identitySnapshot();
  if (applying) {
    if (execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim()) throw new Error("production_migration_dirty_checkout");
    const evidence = validateReleaseEvidence(JSON.parse(readFileSync(required(env, "CARMELITA_RELEASE_EVIDENCE_FILE"), "utf8")), config.fingerprint, config.commit);
    if (evidence.maintenanceMode === "firewall") {
      await verifyFirewallMaintenance({
        ruleId: evidence.firewallRuleId as string,
        deploymentId: evidence.maintenanceDeploymentId as string,
        qaFingerprint: required(env, "CARMELITA_QA_DATABASE_FINGERPRINT"),
      }, firewallDependencies(required(env, "CARMELITA_VERCEL_CLI_PATH")));
    } else {
      const response = await fetch(`${liveOrigin}/api/health`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      const health = await response.json();
      if (!response.ok || health.maintenance !== true || health.deployment?.environment !== "production" || health.deployment?.gitCommitSha !== evidence.maintenanceCommit) throw new Error("production_migration_maintenance_unverified");
      for (const path of ["/agent", "/api/agent/wallets"]) {
        const blocked = await fetch(`${liveOrigin}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
        if (blocked.status !== 503) throw new Error("production_migration_maintenance_unverified");
        await blocked.body?.cancel();
      }
    }
    await applyPreviewMigrations({ readJournal: () => sql.query(journalQuery), transaction: async batch => {
      await sql.transaction(batch.map(item => sql.query(item.text, item.parameters)), { isolationLevel: "Serializable" });
    } }, migrations);
  }
  const after = await identitySnapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("production_migration_identity_changed");
  const finalJournal = await sql.query(journalQuery) as PreviewMigrationJournalEntry[];
  const remaining = pendingPreviewMigrationStatements(migrations, finalJournal).length;
  if (applying && remaining !== 0) throw new Error("production_migration_incomplete");
  return { date: new Date().toISOString(), mode: applying ? "apply" : "inspect", commit: config.commit, databaseFingerprint: config.fingerprint, journalBefore: journal.length, journalAfter: finalJournal.length, pendingStatementsBefore: statements.length, remainingStatements: remaining, identities: after, status: "PASS" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProductionMigration().then(result => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    console.error(error instanceof Error && /^(production_migration|preview_migration)_[A-Za-z0-9_]+$/.test(error.message) ? error.message : "production_migration_failed_inspect_before_retry");
    process.exitCode = 1;
  });
}
