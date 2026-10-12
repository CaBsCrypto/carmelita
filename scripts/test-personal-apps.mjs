import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = resolve(root, "work/personal-apps-qa/runtime");
if (process.argv.length > 3 || process.argv[2] && process.argv[2] !== "--prepare-runtime") throw Error("Unsupported test runner arguments");
if (process.argv[2] === "--prepare-runtime") {
  await mkdir(runtime, { recursive: true });
  await writeFile(resolve(runtime, "package.json"), JSON.stringify({ name: "carmelita-personal-apps-isolated-tests", version: "1.0.0",
    private: true, dependencies: { "@electric-sql/pglite": "0.3.14" } }) + "\n");
  console.log("Prepared ignored runtime manifest. Install with: npm install --prefix work/personal-apps-qa/runtime --ignore-scripts --no-audit --no-fund");
} else {
  const installed = JSON.parse(await readFile(resolve(runtime, "node_modules/@electric-sql/pglite/package.json"), "utf8"));
  if (installed.version !== "0.3.14") throw Error("Unexpected PGlite version; use the pinned isolated runtime");
  const env = { ...process.env, CARMELITA_SQL_TESTS_REQUIRED: "true", DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" };
  for (const key of Object.keys(env)) if (key.startsWith("CARMELITA_PREVIEW_DATABASE")) delete env[key];
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "tests/personal-apps.test.ts", "tests/personal-apps-admin-retention.test.ts"], { cwd: root, env,
    windowsHide: true, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
