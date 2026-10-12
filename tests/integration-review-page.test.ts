import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("actual private proposal inbox authenticates first and distinguishes loaded, empty and unavailable queues", () => {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--experimental-test-module-mocks",
    "--import", "tsx",
    fileURLToPath(new URL("./integration-review-page-fixture.mts", import.meta.url)),
  ], { encoding: "utf8", timeout: 30000, env: childEnvironment });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});
