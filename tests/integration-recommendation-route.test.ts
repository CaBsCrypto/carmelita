import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("actual proposal POST persists safely and rejects invalid, ignored and unavailable submissions", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks",
    "--import", "tsx",
    fileURLToPath(new URL("./integration-recommendation-route-fixture.mts", import.meta.url)),
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});
