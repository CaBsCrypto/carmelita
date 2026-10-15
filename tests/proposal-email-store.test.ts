import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const postgresEngine = new URL("../work/proposal-email-qa/node_modules/@electric-sql/pglite/dist/index.js", import.meta.url);

test("proposal email outbox uses atomic SQL, fenced leases and durable retry state", {
  skip: existsSync(postgresEngine) ? false : "Local PostgreSQL QA engine required: npm install --prefix work/proposal-email-qa --save-exact --ignore-scripts @electric-sql/pglite@0.5.9",
}, () => {
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks",
    "--import", "tsx",
    fileURLToPath(new URL("./proposal-email-store-fixture.mts", import.meta.url)),
  ], { encoding: "utf8", timeout: 90000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});
