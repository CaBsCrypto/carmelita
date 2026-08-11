import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("OAuth subject-link migration is additive, ordered, and enforces one-to-one identity mapping", async () => {
  const migration = await readFile(new URL("../drizzle/0018_oauth_subject_links.sql", import.meta.url), "utf8");
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  assert.match(migration, /CREATE TABLE "oauth_subject_links"/);
  assert.match(migration, /FOREIGN KEY \("privy_did"\) REFERENCES "public"\."agent_users"\("id"\) ON DELETE cascade/);
  assert.match(migration, /UNIQUE INDEX "oauth_subject_links_issuer_subject_uidx"[\s\S]*\("issuer","subject"\)/);
  assert.match(migration, /UNIQUE INDEX "oauth_subject_links_issuer_privy_uidx"[\s\S]*\("issuer","privy_did"\)/);
  assert.doesNotMatch(migration, /DROP\s|TRUNCATE\s|DELETE\s+FROM|ALTER\s+TABLE[\s\S]*DROP/i);
  assert.deepEqual(journal.entries.at(-1), { idx: 18, version: "7", when: 1786408276115, tag: "0018_oauth_subject_links", breakpoints: true });
});