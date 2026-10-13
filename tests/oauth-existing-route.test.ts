import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("real Tempo Preview OAuth route and Privy UI prohibit wallet creation while preserving legacy login", () => {
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./oauth-existing-route-fixture.mts", import.meta.url))], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});
