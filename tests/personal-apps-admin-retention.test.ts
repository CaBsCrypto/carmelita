import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
const runtime = existsSync(new URL("../work/personal-apps-qa/runtime/node_modules/@electric-sql/pglite/package.json", import.meta.url));
if (process.env.CARMELITA_SQL_TESTS_REQUIRED === "true" && !runtime) throw new Error("The required isolated PGlite runtime is missing");
test("admin revisions and explicit retention use isolated real PostgreSQL with no external access", { skip: !runtime ? "Use scripts/test-personal-apps.mjs with the pinned PGlite runtime." : false }, () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", fileURLToPath(new URL("./personal-apps-admin-retention-fixture.mts", import.meta.url))], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
