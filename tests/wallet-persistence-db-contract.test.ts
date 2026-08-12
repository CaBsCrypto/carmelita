import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wallet persistence verifies ownership before and after its upsert", async () => {
  const source = await readFile(new URL("../app/multichain-account.ts", import.meta.url), "utf8");
  const checks = source.match(/assertWalletIdentityAvailable\(/g) ?? [];
  assert.ok(checks.length >= 3, "expected helper definition plus pre- and post-write checks");
  assert.match(source, /target:\s*agentWallets\.id/);
  assert.match(source, /const persisted = await db\.select/);
  assert.match(source, /assertWalletIdentityAvailable\(persisted/);
  assert.match(source, /walletCreatedActivityId\(input\.wallet\.id, input\.network\)/);
  assert.match(source, /onConflictDoNothing\(\{ target: agentActivities\.id \}\)/);
});
