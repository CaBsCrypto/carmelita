import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("journal migrations cover every runtime table, column and named index", async () => {
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const migrations = (await Promise.all(journal.entries.map(({ tag }) =>
    readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8"),
  ))).join("\n");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const tables = new Map([...migrations.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)" \(([\s\S]*?)\n\);/g)]
    .map((match) => [match[1], new Set([...match[2].matchAll(/^\s*"([^"]+)"/gm)].map((column) => column[1]))]));
  for (const match of migrations.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN(?: IF NOT EXISTS)? "([^"]+)"/g)) {
    tables.get(match[1])?.add(match[2]);
  }
  const indexes = new Set([...migrations.matchAll(/CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? "([^"]+)"/g)]
    .map((match) => match[1]));
  const definitions = [...schema.matchAll(/pgTable\("([^"]+)",\{([\s\S]*?)\},t=>\[([^\n]*?)\]\);/g)];
  assert.equal(definitions.length, [...schema.matchAll(/pgTable\(/g)].length, "update coverage parser for the new schema declaration format");
  assert.ok(definitions.length > 0, "schema table inventory is empty");
  for (const [, name, columns, tableIndexes] of definitions) {
    assert.ok(tables.has(name), `journal migrations do not create ${name}`);
    for (const [, column] of columns.matchAll(/(?:text|timestamp|numeric|jsonb|integer|boolean)\("([^"]+)"/g)) {
      assert.ok(tables.get(name)?.has(column), `journal migrations do not create ${name}.${column}`);
    }
    for (const [, index] of tableIndexes.matchAll(/(?:uniqueIndex|index)\("([^"]+)"/g)) {
      assert.ok(indexes.has(index), `journal migrations do not create ${index}`);
    }
  }
});
