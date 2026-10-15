import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
test("email dispatch routes enforce administrative origin or the scheduler bearer capability", () => {
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", fileURLToPath(new URL("./proposal-email-dispatch-route-fixture.mts", import.meta.url))], {
    encoding: "utf8", windowsHide: true, timeout: 60_000,
    env: { PATH: process.env.PATH, Path: process.env.Path, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: "test" },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr || String(result.error));
});
