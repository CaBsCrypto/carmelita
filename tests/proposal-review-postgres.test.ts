import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { localProposalPostgresConfig } from "../scripts/proposal-email-postgres-config.mjs";

test("proposal submission, private review and session closure share persisted PostgreSQL state", {
  skip: process.env.CARMELITA_PROPOSAL_PG_ACCEPTANCE === "true" ? false : "Explicit disposable local PostgreSQL acceptance opt-in required",
}, () => {
  localProposalPostgresConfig(process.env.CARMELITA_PROPOSAL_PG_URL);
  assert.ok(existsSync(new URL("../work/proposal-email-postgres-runtime/node_modules/pg/lib/index.js", import.meta.url)));
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./proposal-review-postgres-fixture.mts", import.meta.url)),
  ], { encoding: "utf8", timeout: 60000, windowsHide: true });
  // The fixture emits only case names and safe codes, never raw database errors.
  assert.equal(result.status, 0, result.stdout || "proposal_review_pg_acceptance_failed");
  process.stdout.write(result.stdout);
});
