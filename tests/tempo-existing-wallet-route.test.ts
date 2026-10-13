import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("real MCP registration separates strict existing-EVM reads from explicit scoped Tempo association", () => {
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./tempo-existing-wallet-route-fixture.mts", import.meta.url))], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.deepEqual(JSON.parse(result.stdout), {
    registration: true, strictInput: true, authForwarding: true, ownerIsolation: true,
    readHasNoWrites: true, explicitAssociation: true, scopeChallenges: true,
  });
});
