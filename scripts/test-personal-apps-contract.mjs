import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv.length > 3) throw Error("Usage: node scripts/test-personal-apps-contract.mjs [Bazaar checkout]");
const checkout = resolve(root, process.argv[2] ?? "../bazaar-consumer-pilot");
await access(resolve(checkout, "scripts/fixtures/consumer-http-fixture.mjs"));
const installed = JSON.parse(await readFile(resolve(root, "work/personal-apps-qa/runtime/node_modules/@electric-sql/pglite/package.json"), "utf8"));
if (installed.version !== "0.3.14") throw Error("The pinned isolated PostgreSQL runtime is required");
const env = { ...process.env, NODE_ENV: "test", CARMELITA_BAZAAR_CHECKOUT: checkout, CARMELITA_BAZAAR_CONFORMANCE_REQUIRED: "true",
  CARMELITA_SQL_TESTS_REQUIRED: "true", DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" };
for (const key of Object.keys(env)) if (/^(BAZAAR|VERCEL|UPSTASH|KV_REST|CARMELITA_PREVIEW_DATABASE)/.test(key)) delete env[key];
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "tests/personal-apps-conformance.test.ts"], { cwd: root, env,
  windowsHide: true, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
