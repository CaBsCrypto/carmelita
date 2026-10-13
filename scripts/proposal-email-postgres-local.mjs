/**
 * Portable, disposable PostgreSQL acceptance. No services, Docker, .env or external requests.
 * Requires official PostgreSQL binaries in work/proposal-email-qa/runtime/pgsql and
 * pg@8.16.3 in work/proposal-email-postgres-runtime (both ignored local QA dependencies).
 * Run: node scripts/proposal-email-postgres-local.mjs
 * Cleanup probe (expected exit 1): add --probe-startup-timeout.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const qaRoot = join(root, "work", "proposal-email-qa");
const runtime = join(qaRoot, "runtime", "pgsql");
const bin = join(runtime, "bin");
const extension = process.platform === "win32" ? ".exe" : "";
const runId = randomUUID();
const cluster = join(qaRoot, `native-postgres-${runId}`);
const markerPath = join(cluster, ".carmelita-local-acceptance-owner");
const ownerPrefix = resolve(qaRoot) + sep;
assert.ok(resolve(cluster).startsWith(ownerPrefix) && dirname(cluster) === qaRoot);
// libpq's PGHOSTADDR/PGSERVICE variables can override otherwise explicit local CLI flags.
// Drop every inherited PG* setting; this cluster has its own trust-only synthetic role.
const environment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name))),
  PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
};
let server;
let serverEnded = false;
let serverStarted = false;
let owned = false;
let clusterRemoved = false;
let failed = false;
let stage = "runtime prerequisites";
let engineOutput = "";
const startupTimeoutProbe = process.argv.includes("--probe-startup-timeout");

async function run(executable, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, { cwd: root, env: environment, windowsHide: true, ...options });
    let output = "";
    let timedOut = false;
    let processError = false;
    child.stdout?.on("data", data => { output += String(data); });
    child.stderr?.on("data", data => { output += String(data); });
    // A timeout requests termination, but settles only after close confirms the child
    // can no longer write the cluster. Rejecting immediately allowed unsafe cleanup.
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30000);
    child.once("error", () => { processError = true; });
    child.once("close", code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("proposal_pg_local_process_timeout"));
      else if (code === 0 && !processError) resolveResult(output);
      else {
        const error = new Error("proposal_pg_local_process_failed");
        error.diagnostic = output.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[local connection]").slice(0, 1600);
        reject(error);
      }
    });
  });
}
async function freePort() {
  const listener = createServer();
  await new Promise((accept, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", accept); });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise((accept, reject) => listener.close(error => error ? reject(error) : accept()));
  return address.port;
}
async function pause(milliseconds) { await new Promise(accept => setTimeout(accept, milliseconds)); }
try {
  for (const name of ["initdb", "postgres", "pg_ctl", "psql", "createdb"]) {
    await access(join(bin, name + extension));
  }
  await access(join(root, "work", "proposal-email-postgres-runtime", "node_modules", "pg", "lib", "index.js"));
  engineOutput = String(await run(join(bin, "postgres" + extension), ["--version"])).trim();
  await mkdir(cluster, { recursive: false });
  owned = true;
  stage = "initialize disposable cluster";
  await run(join(bin, "initdb" + extension), ["-D", cluster, "--username=qa_administrator", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  await writeFile(markerPath, runId, "utf8");
  const port = await freePort();
  stage = "start loopback-only PostgreSQL";
  server = spawn(join(bin, "postgres" + extension), [
    "-D", cluster, "-h", "127.0.0.1", "-p", String(port),
    "-c", "max_connections=12", "-c", "shared_buffers=16MB", "-c", "fsync=on",
  ], { cwd: root, env: environment, windowsHide: true, stdio: "ignore" });
  server.once("error", () => { /* Spawn/kill errors do not prove process exit. */ });
  server.once("close", () => { serverEnded = true; });
  const deadline = Date.now() + (startupTimeoutProbe ? 0 : 10000);
  while (Date.now() < deadline && !serverEnded) {
    try {
      const lines = (await readFile(join(cluster, "postmaster.pid"), "utf8")).split(/\r?\n/);
      if (Number(lines[0]) === server.pid && lines[7]?.trim() === "ready") { serverStarted = true; break; }
    } catch { /* PostgreSQL is still creating its pid file. */ }
    await pause(100);
  }
  assert.ok(serverStarted && !serverEnded, "proposal_pg_owned_server_required");
  stage = "create non-superuser QA role";
  await run(join(bin, "psql" + extension), [
    "-h", "127.0.0.1", "-p", String(port), "-U", "qa_administrator", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", "CREATE ROLE qa LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION",
  ]);
  stage = "create disposable database";
  await run(join(bin, "createdb" + extension), ["-h", "127.0.0.1", "-p", String(port), "-U", "qa_administrator", "-O", "qa", "carmelita_proposal_qa"]);
  stage = "independent connection acceptance";
  const result = await run(process.execPath, ["--import", "tsx", "--test", "tests/proposal-email-postgres.test.ts"], {
    env: {
      ...environment,
      CARMELITA_PROPOSAL_PG_ACCEPTANCE: "true",
      CARMELITA_PROPOSAL_PG_URL: `postgresql://qa@127.0.0.1:${port}/carmelita_proposal_qa`,
    },
  });
  // Test output contains only synthetic identities, safe status codes and PostgreSQL version.
  console.log(String(result).trim());
  console.log(JSON.stringify({ status: "passed", engine: engineOutput, disposableCluster: true, host: "127.0.0.1", externalRequests: 0 }));
} catch (error) {
  failed = true;
  console.log(JSON.stringify({ status: "failed", code: "proposal_pg_local_acceptance_failed", stage, diagnostic: error?.diagnostic }));
} finally {
  // Readiness is not ownership or liveness: stop our child even if it never became ready.
  if (server && !serverEnded) {
    try {
      assert.equal((await readFile(markerPath, "utf8")).trim(), runId);
      let pid;
      try { pid = Number((await readFile(join(cluster, "postmaster.pid"), "utf8")).split(/\r?\n/)[0]); }
      catch { /* A still-starting child may not have created its pid file. */ }
      if (pid === server.pid) {
        await run(join(bin, "pg_ctl" + extension), ["-D", cluster, "stop", "-m", "fast", "-w", "-t", "10"]);
      }
    } catch { /* Fall back to terminating only the child handle we spawned. */ }
    if (!serverEnded) server.kill("SIGKILL");
    for (let attempt = 0; attempt < 50 && !serverEnded; attempt++) await pause(100);
    if (!serverEnded) { failed = true; console.log("proposal_pg_local_server_cleanup_failed"); }
  }
  if (owned && (!server || serverEnded)) {
    try {
      // The only recursive deletion target is our checked UUID child in the ignored QA root.
      assert.ok(resolve(cluster).startsWith(ownerPrefix) && dirname(cluster) === qaRoot);
      assert.match(cluster.slice(ownerPrefix.length), /^native-postgres-[a-f0-9-]{36}$/);
      await rm(cluster, { recursive: true, force: true });
      clusterRemoved = true;
    } catch { failed = true; console.log("proposal_pg_local_cluster_cleanup_failed"); }
  }
  if (clusterRemoved) console.log(JSON.stringify({ cleanup: "passed", serverStopped: !server || serverEnded, ownedClusterRemoved: clusterRemoved }));
  process.exitCode = failed ? 1 : 0;
}
