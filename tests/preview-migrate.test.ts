import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import {
  applyPreviewMigrations,
  pendingPreviewMigrationStatements,
  readPreviewMigrationFiles,
  type PreviewMigrationDatabase,
  type PreviewMigrationJournalEntry,
  type PreviewMigrationStatement,
} from "../scripts/preview-migrate";

const migrations: MigrationMeta[] = [
  { folderMillis: 1000, hash: "a".repeat(64), bps: true, sql: ["CREATE TABLE first_table (id integer);", " \n\t "] },
  { folderMillis: 2000, hash: "b".repeat(64), bps: true, sql: ["CREATE TABLE second_table (id integer);", ""] },
];

class TransactionalDatabase implements PreviewMigrationDatabase {
  journal: PreviewMigrationJournalEntry[] = [];
  tables: string[] = [];
  transactions: PreviewMigrationStatement[][] = [];
  failOn?: string;
  raceBeforeApply = false;

  async readJournal() {
    return structuredClone(this.journal);
  }

  async transaction(statements: PreviewMigrationStatement[]) {
    this.transactions.push(statements);
    if (this.raceBeforeApply && statements.some((statement) => statement.text.includes("journal_unchanged"))) {
      this.journal = migrations.map((migration) => ({ hash: migration.hash, created_at: String(migration.folderMillis) }));
    }
    const nextJournal = structuredClone(this.journal);
    const nextTables = [...this.tables];
    for (const statement of statements) {
      if (statement.text.includes("journal_unchanged")) {
        assert.deepEqual(JSON.parse(String(statement.parameters?.[0])), this.journal, "journal snapshot changed");
      }
      if (this.failOn && statement.text.includes(this.failOn)) throw new Error("simulated transaction failure");
      if (statement.text.startsWith("CREATE TABLE first_") || statement.text.startsWith("CREATE TABLE second_")) nextTables.push(statement.text);
      if (statement.text.startsWith('INSERT INTO "drizzle".')) {
        nextJournal.push({ hash: String(statement.parameters?.[0]), created_at: String(statement.parameters?.[1]) });
      }
    }
    this.journal = nextJournal;
    this.tables = nextTables;
  }
}

test("migration execution filters empty SQL while retaining the original migration hash", () => {
  const pending = pendingPreviewMigrationStatements(migrations, []);
  assert.equal(pending.length, 4);
  assert.equal(pending.some((statement) => !statement.text.trim()), false);
  assert.deepEqual(pending[1].parameters, ["a".repeat(64), 1000]);
  const historical = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)) });
  assert.ok(historical.some((migration) => migration.sql.some((statement) => !statement.trim())), "real trailing chunk remains present in source files");
  assert.equal(pendingPreviewMigrationStatements(historical, []).some((statement) => !statement.text.trim()), false);
});

test("pending migrations apply as one locked transaction with their journal and become idempotent", async () => {
  const database = new TransactionalDatabase();
  await applyPreviewMigrations(database, migrations);
  assert.equal(database.transactions.length, 2);
  const application = database.transactions[1];
  assert.match(application[0].text, /pg_advisory_xact_lock/);
  assert.match(application[1].text, /LOCK TABLE.*ACCESS EXCLUSIVE MODE/);
  assert.match(application[2].text, /journal_unchanged/);
  assert.equal(database.tables.length, 2);
  assert.equal(database.journal.length, 2);
  await applyPreviewMigrations(database, migrations);
  assert.equal(database.transactions.length, 3, "replay only repeats safe journal bootstrap");
  assert.equal(database.tables.length, 2);
  assert.equal(database.journal.length, 2);
});

test("a failed later migration leaves both earlier DDL and journal entries uncommitted", async () => {
  const database = new TransactionalDatabase();
  database.failOn = "CREATE TABLE second_table";
  await assert.rejects(applyPreviewMigrations(database, migrations), /simulated transaction failure/);
  assert.deepEqual(database.journal, []);
  assert.deepEqual(database.tables, []);
  assert.equal(database.transactions.length, 2, "ambiguous failures are not retried automatically");
});

test("a concurrent migration invalidates the snapshot before any pending DDL executes", async () => {
  const database = new TransactionalDatabase();
  database.raceBeforeApply = true;
  await assert.rejects(applyPreviewMigrations(database, migrations), /journal snapshot changed/);
  assert.deepEqual(database.tables, []);
  assert.equal(database.journal.length, 2, "the winning migration journal remains intact");
});

test("migration journal drift, missing historical entries and reordered files fail closed", () => {
  for (const journal of [
    [{ hash: "c".repeat(64), created_at: "1000" }],
    [{ hash: "b".repeat(64), created_at: "2000" }],
    [{ hash: "a".repeat(64), created_at: "999" }],
  ]) {
    assert.throws(() => pendingPreviewMigrationStatements(migrations, journal), /preview_migration_journal_drift/);
  }
  assert.throws(() => pendingPreviewMigrationStatements([...migrations].reverse(), []), /preview_migration_invalid_files/);
  const suffix = pendingPreviewMigrationStatements(migrations, [{ hash: "a".repeat(64), created_at: "1000" }]);
  assert.equal(suffix.length, 2);
  assert.match(suffix[0].text, /second_table/);
});

test("migration loader accepts LF and CRLF history while inserting only canonical LF hashes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "carmelita-migration-line-endings-"));
  const lf = "CREATE TABLE first_table (\n  id integer\n);\n--> statement-breakpoint\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    mkdirSync(join(directory, "meta"));
    writeFileSync(join(directory, "meta", "_journal.json"), JSON.stringify({
      entries: [{ tag: "0000_example", when: 1000, breakpoints: true }],
    }));
    for (const source of [lf, crlf]) {
      writeFileSync(join(directory, "0000_example.sql"), source);
      const loaded = readPreviewMigrationFiles({ migrationsFolder: directory });
      assert.equal(loaded[0].hash, hash(lf));
      assert.deepEqual(new Set(loaded[0].acceptedHashes), new Set([hash(lf), hash(crlf)]));
      const pending = pendingPreviewMigrationStatements(loaded, []);
      assert.deepEqual(pending.at(-1)?.parameters, [hash(lf), 1000]);
      for (const historicalHash of [hash(lf), hash(crlf)]) {
        const database = new TransactionalDatabase();
        database.journal = [{ hash: historicalHash, created_at: "1000" }];
        await applyPreviewMigrations(database, loaded);
        assert.equal(database.transactions.length, 1, "replay creates no DDL or journal updates");
        assert.deepEqual(database.journal, [{ hash: historicalHash, created_at: "1000" }]);
      }
      for (const changedSource of [source.replace("integer", "bigint"), source.replace("  id", "   id")]) {
        assert.throws(() => pendingPreviewMigrationStatements(loaded, [{ hash: hash(changedSource), created_at: "1000" }]),
          /preview_migration_journal_drift/, "content and whitespace edits other than line endings remain rejected");
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
