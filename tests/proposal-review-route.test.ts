import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
test("private admin proposal review route enforces auth, origin, input bounds, safe errors and idempotent decisions",()=>{const result=spawnSync(process.execPath,["--import","tsx","--experimental-test-module-mocks",fileURLToPath(new URL("./proposal-review-route-fixture.mts",import.meta.url))],{encoding:"utf8"});assert.equal(result.status,0,result.stdout+result.stderr)});
