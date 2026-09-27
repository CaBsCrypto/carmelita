import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readMigrationFiles, type MigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";
import { assertPreviewIsolation, type PreviewIsolationEnvironment } from "../app/preview-isolation";

export type PreviewMigrationStatement = { text: string; parameters?: unknown[] };
export type PreviewMigrationMeta = MigrationMeta & { acceptedHashes?: string[] };
export type PreviewMigrationJournalEntry = { hash: string; created_at: string };
export type PreviewMigrationDatabase = {
  readJournal(): Promise<unknown>;
  transaction(statements: PreviewMigrationStatement[]): Promise<void>;
};

const journalTable = '"drizzle"."__drizzle_migrations"';
const migrationLock = "SELECT pg_advisory_xact_lock(1729361921, 1886545261)";
const readJournal = `SELECT hash, created_at::text AS created_at FROM ${journalTable} AS journal ORDER BY journal.created_at, journal.id`;
const assertJournalSnapshot = `SELECT 1 / CASE WHEN (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('hash', hash, 'created_at', created_at::text) ORDER BY created_at, id), '[]'::jsonb)
  FROM ${journalTable}
) = $1::jsonb THEN 1 ELSE 0 END AS journal_unchanged`;

/** Canonical LF hashes match Git/Linux; historical CRLF hashes remain valid without rewriting them. */
export function readPreviewMigrationFiles(config: MigrationConfig = {
  migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
}): PreviewMigrationMeta[] {
  return readMigrationFiles(config).map((migration) => {
    // Drizzle splits on this exact literal; joining restores the original file text byte-for-byte.
    const raw = migration.sql.join("--> statement-breakpoint");
    const lf = raw.replace(/\r\n/g, "\n");
    const hash = (source: string) => createHash("sha256").update(source).digest("hex");
    const canonicalHash = hash(lf);
    return {
      ...migration,
      hash: canonicalHash,
      acceptedHashes: [...new Set([migration.hash, canonicalHash, hash(lf.replace(/\n/g, "\r\n"))])],
    };
  });
}

function validateJournal(value: unknown): PreviewMigrationJournalEntry[] {
  if (!Array.isArray(value)) throw new Error("preview_migration_invalid_journal");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("hash" in row) || !("created_at" in row) ||
      typeof row.hash !== "string" || typeof row.created_at !== "string" ||
      !/^[a-f0-9]{64}$/.test(row.hash) || !/^\d+$/.test(row.created_at)) {
      throw new Error("preview_migration_invalid_journal");
    }
    return { hash: row.hash, created_at: row.created_at };
  });
}

/** Only execute an unapplied suffix; journal hashes may differ solely by checkout line endings. */
export function pendingPreviewMigrationStatements(
  migrations: PreviewMigrationMeta[],
  journal: PreviewMigrationJournalEntry[],
): PreviewMigrationStatement[] {
  let previousTimestamp = 0;
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.folderMillis) || migration.folderMillis <= previousTimestamp ||
      !/^[a-f0-9]{64}$/.test(migration.hash) ||
      migration.acceptedHashes?.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
      throw new Error("preview_migration_invalid_files");
    }
    previousTimestamp = migration.folderMillis;
  }
  if (journal.length > migrations.length || journal.some((entry, index) =>
    ![migrations[index].hash, ...(migrations[index].acceptedHashes ?? [])].includes(entry.hash) ||
    entry.created_at !== String(migrations[index].folderMillis))) {
    throw new Error("preview_migration_journal_drift");
  }

  return migrations.slice(journal.length).flatMap((migration) => [
    ...migration.sql.map((statement) => statement.trim()).filter(Boolean).map((text) => ({ text })),
    {
      text: `INSERT INTO ${journalTable} (hash, created_at) VALUES ($1, $2)`,
      parameters: [migration.hash, migration.folderMillis],
    },
  ]);
}

/** Schema changes and journal entries share one transaction; no automatic retry on uncertainty. */
export async function applyPreviewMigrations(
  database: PreviewMigrationDatabase,
  migrations: PreviewMigrationMeta[],
): Promise<void> {
  pendingPreviewMigrationStatements(migrations, []);
  // Journal bootstrap is separately atomic and safe to repeat on an empty Preview database.
  await database.transaction([
    { text: migrationLock },
    { text: 'CREATE SCHEMA IF NOT EXISTS "drizzle"' },
    { text: `CREATE TABLE IF NOT EXISTS ${journalTable} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)` },
  ]);
  const journal = validateJournal(await database.readJournal());
  const pending = pendingPreviewMigrationStatements(migrations, journal);
  if (pending.length === 0) return;

  await database.transaction([
    { text: migrationLock },
    { text: `LOCK TABLE ${journalTable} IN ACCESS EXCLUSIVE MODE` },
    // HTTP transactions cannot branch on query results. Reject a stale read atomically instead.
    { text: assertJournalSnapshot, parameters: [JSON.stringify(journal)] },
    ...pending,
  ]);
}

/** The caller supplies Preview configuration explicitly; no dotenv or production fallback. */
export async function migratePreview(env: PreviewIsolationEnvironment = process.env): Promise<void> {
  const { migrationDatabaseUrl } = assertPreviewIsolation(env);
  const migrations = readPreviewMigrationFiles();
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(migrationDatabaseUrl);
  await applyPreviewMigrations({
    readJournal: () => sql.query(readJournal),
    transaction: async (statements) => {
      await sql.transaction(statements.map(({ text, parameters }) => sql.query(text, parameters)), { isolationLevel: "ReadCommitted" });
    },
  }, migrations);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migratePreview().then(() => {
    console.log("Preview migrations completed.");
  }).catch((error: unknown) => {
    // Driver errors can contain a connection string. Only our safe guard codes are reported.
    const code = error instanceof Error && /^preview_isolation_[A-Za-z0-9_]+$/.test(error.message)
      ? error.message
      : "preview_migration_failed";
    console.error(code);
    process.exitCode = 1;
  });
}
