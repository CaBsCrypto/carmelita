import assert from "node:assert/strict";
import test from "node:test";
import { safeArgs, runtimePython, BUILD_EXCLUDES, buildConfig } from "./graphify.mjs";

test("AST extraction cannot silently select an API backend or private ignored files", () => {
  assert.deepEqual(safeArgs(["extract", "."]), ["extract", ".", "--code-only"]);
  for (const args of [["extract", ".", "--backend", "openai"], ["extract", ".", "--backend=gemini"], ["extract", ".", "--no-gitignore"], ["label", "."]]) assert.throws(() => safeArgs(args));
});
test("query defaults and explicit budgets remain at most 1500", () => {
  assert.deepEqual(safeArgs(["query", "memory policy"]), ["query", "memory policy", "--budget", "1500"]);
  assert.throws(() => safeArgs(["query", "memory", "--budget", "1501"]));
  assert.throws(() => safeArgs(["query", "memory", "--budget", "NaN"]));
  assert.deepEqual(safeArgs(["query", "memory", "--budget", "500"]), ["query", "memory", "--budget", "500"]);
  assert.deepEqual(safeArgs(["query", "memory", "--budget=500"]), ["query", "memory", "--budget=500"]);
  for (const args of [["--budget=1501"], ["--budget="], ["--budget", "500", "--budget", "9000"], ["--budget=500", "--budget", "9000"]]) assert.throws(() => safeArgs(["query", "memory", ...args]));
});
test("reports avoid automatic labeling and global launchers", () => {
  assert.deepEqual(safeArgs(["cluster-only", "."]), ["cluster-only", ".", "--no-label", "--no-viz"]);
  assert.match(runtimePython("C:/repo", "win32").replaceAll("\\", "/"), /work\/graphify-runtime\/Scripts\/python.exe$/);
  assert.match(runtimePython("/repo", "linux").replaceAll("\\", "/"), /work\/graphify-runtime\/bin\/python$/);
});
test("fresh build excludes local evidence and out-of-scope sprint files", () => {
  for (const required of ["work/", "outputs/", ".env*", "**/*connectionfiles*", "**/*audio*", "**/*durable*", "**/*0022*", "**/*bazaar*", "**/*.md"]) assert.ok(BUILD_EXCLUDES.includes(required));
  assert.throws(() => safeArgs(["extract", ".", "--exclude=docs/"]));
});
test("staging new code removes its prior untracked exclusion while retaining user exclusions", () => {
  const first = buildConfig({ excludes: ["custom-scope/"] }, ["app/new-feature.ts"]);
  assert.ok(first.excludes.includes("app/new-feature.ts"));
  const second = buildConfig(first, []);
  assert.ok(!second.excludes.includes("app/new-feature.ts"));
  assert.ok(second.excludes.includes("custom-scope/"));
});
