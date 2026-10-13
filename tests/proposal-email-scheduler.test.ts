import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executeFile = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/proposal-email-dispatch.mjs", import.meta.url));
const token = "synthetic-worker-capability-1234567890";
const counts = { processed: 2, accepted: 1, retry: 1, needsReview: 0 };
type CliResult = { code: number; output: Record<string, unknown>; stdout: string; stderr: string };

async function cli(args: string[], origin?: string, suppliedToken: string | null = token, cwd?: string): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH, Path: process.env.Path, SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP, TMP: process.env.TMP,
  };
  if (origin !== undefined) env.CARMELITA_PUBLIC_ORIGIN = origin;
  if (suppliedToken !== null) env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN = suppliedToken;
  let code = 0, stdout = "", stderr = "";
  try {
    ({ stdout, stderr } = await executeFile(process.execPath, [script, ...args], {
      env, cwd, encoding: "utf8", windowsHide: true, timeout: 35_000, maxBuffer: 4096,
    }));
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    assert.equal(typeof failure.code, "number", "The CLI must finish within its deadline");
    code = failure.code; stdout = failure.stdout; stderr = failure.stderr;
  }
  assert.equal(stderr, "");
  assert.ok(!stdout.includes(token), "Never expose the worker capability");
  return { code, output: JSON.parse(stdout), stdout, stderr };
}

async function fixture(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

test("the scheduler defaults to a configuration check with no network requests", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => { requests++; json(response, { status: "processed", ...counts }); });
  try {
    for (const args of [[], ["--check"]]) {
      const result = await cli(args, server.origin);
      assert.equal(result.code, 0);
      assert.deepEqual(result.output, { status: "ready" });
    }
    assert.equal(requests, 0);
  } finally { await server.close(); }
});

test("execute sends exactly one authenticated GET and emits only whitelisted counters", async () => {
  const requests: { method?: string; path?: string; authorization?: string; accept?: string }[] = [];
  const server = await fixture((request, response) => {
    requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization, accept: request.headers.accept });
    json(response, { status: "processed", ...counts, providerId: "private-provider-id", contact: "private@example.test", missing: ["secret-config"] });
  });
  try {
    const result = await cli(["--execute"], server.origin);
    assert.equal(result.code, 0);
    assert.deepEqual(result.output, { status: "processed", ...counts });
    assert.deepEqual(requests, [{ method: "GET", path: "/api/admin/integrations/notifications", authorization: `Bearer ${token}`, accept: "application/json" }]);
    assert.ok(!result.stdout.includes("private"));
  } finally { await server.close(); }
});

test("production configuration can be checked without contacting production", async () => {
  assert.deepEqual((await cli(["--check"], "https://carmelita.browns.studio")).output, { status: "ready" });
  assert.deepEqual((await cli(["--check"], "http://[::1]:8144", "x".repeat(32))).output, { status: "ready" });
  assert.deepEqual((await cli(["--check"], "https://carmelita.browns.studio:443/", "x".repeat(256))).output, { status: "ready" });
});

test("unsafe origins are rejected before a token can leave the process", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => { requests++; json(response, { status: "processed", ...counts }); });
  try {
    const invalid = [
      `${server.origin}/another-path`, `${server.origin}?redirect=1`, `${server.origin}#fragment`,
      server.origin.replace("http://", "http://user:password@"),
      "https://carmelita.browns.studio.attacker.example", "https://carmelita.browns.studio:8443",
      "https://attacker.example", "http://carmelita.browns.studio", "https://127.0.0.1",
      "http://127.0.0.1.attacker.example", "http://127.1", "http://2130706433", "http://localhost",
      "http://0.0.0.0", "http://[::ffff:127.0.0.1]", "http://127.0.0.1:70000",
      "http://127.0.0.1:0", " https://carmelita.browns.studio", "https://carmelita.browns.studio/../",
    ];
    for (const origin of invalid) {
      const result = await cli(["--execute"], origin);
      assert.equal(result.code, 2);
      assert.deepEqual(result.output, { status: "invalid_configuration" });
    }
    assert.equal(requests, 0);
  } finally { await server.close(); }
});

test("missing or invalid capabilities and unknown arguments never make requests", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => { requests++; json(response, { status: "processed", ...counts }); });
  try {
    for (const suppliedToken of ["", "x".repeat(31), "x".repeat(257), `${token}\n`, `${token} `, `${token}é`]) {
      assert.deepEqual((await cli(["--execute"], server.origin, suppliedToken)).output, { status: "invalid_configuration" });
    }
    assert.deepEqual((await cli(["--execute"], server.origin, null)).output, { status: "invalid_configuration" });
    assert.deepEqual((await cli(["--execute"], undefined)).output, { status: "invalid_configuration" });
    for (const args of [["--execute", "--check"], ["--help"], ["--execute=true"]]) {
      assert.deepEqual((await cli(args, server.origin)).output, { status: "invalid_arguments" });
    }
    assert.equal(requests, 0);
  } finally { await server.close(); }
});

test("the runner does not discover or load local dotenv files", async () => {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, "carmelita-scheduler-"));
  try {
    await writeFile(join(directory, ".env.local"), `CARMELITA_PUBLIC_ORIGIN=https://carmelita.browns.studio\nCARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN=${token}\n`);
    const result = await cli([], undefined, null, directory);
    assert.equal(result.code, 2);
    assert.deepEqual(result.output, { status: "invalid_configuration" });
  } finally {
    assert.equal(dirname(resolve(directory)), temporaryRoot);
    assert.ok(basename(directory).startsWith("carmelita-scheduler-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("authentication failures are safe and never retried", async () => {
  for (const status of [401, 403]) {
    let requests = 0;
    const server = await fixture((_request, response) => { requests++; json(response, { token, contact: "private@example.test" }, status); });
    try {
      const result = await cli(["--execute"], server.origin);
      assert.equal(result.code, 1);
      assert.deepEqual(result.output, { status: "unauthorized" });
      assert.equal(requests, 1);
    } finally { await server.close(); }
  }
});

test("a redirect cannot forward the bearer capability to another endpoint", async () => {
  let sourceRequests = 0, destinationRequests = 0;
  const destination = await fixture((_request, response) => { destinationRequests++; json(response, { status: "processed", ...counts }); });
  const source = await fixture((_request, response) => { sourceRequests++; response.writeHead(302, { location: `${destination.origin}/steal` }); response.end(); });
  try {
    const result = await cli(["--execute"], source.origin);
    assert.equal(result.code, 1);
    assert.deepEqual(result.output, { status: "network_error" });
    assert.equal(sourceRequests, 1);
    assert.equal(destinationRequests, 0);
  } finally { await source.close(); await destination.close(); }
});

test("non-success HTTP statuses are sanitized and never retried", async () => {
  for (const status of [429, 503]) {
    let requests = 0;
    const server = await fixture((_request, response) => { requests++; json(response, { token, privateBody: "provider-error" }, status); });
    try {
      const result = await cli(["--execute"], server.origin);
      assert.equal(result.code, 1);
      assert.deepEqual(result.output, { status: "dispatch_unavailable" });
      assert.equal(requests, 1);
    } finally { await server.close(); }
  }
});

test("invalid JSON, media type, schema and inconsistent counters are rejected", async () => {
  const malformed = [
    { body: "not json", type: "application/json" },
    { body: JSON.stringify({ status: "processed", ...counts }), type: "text/html" },
    { body: JSON.stringify({ status: "processed", processed: 6, accepted: 0, retry: 0, needsReview: 0 }), type: "application/json" },
    { body: JSON.stringify({ status: "processed", ...counts, retry: -1 }), type: "application/json" },
    { body: JSON.stringify({ status: "processed", ...counts, accepted: 2.5 }), type: "application/json" },
    { body: JSON.stringify({ status: "processed", ...counts, processed: 0 }), type: "application/json" },
    { body: JSON.stringify({ status: "disabled", ...counts }), type: "application/json" },
    { body: JSON.stringify({ status: "unknown", ...counts }), type: "application/json" },
    { body: JSON.stringify({ status: "processed", processed: 0 }), type: "application/json" },
  ];
  for (const value of malformed) {
    const server = await fixture((_request, response) => { response.writeHead(200, { "content-type": value.type }); response.end(value.body); });
    try {
      const result = await cli(["--execute"], server.origin);
      assert.equal(result.code, 1);
      assert.deepEqual(result.output, { status: "invalid_response" });
    } finally { await server.close(); }
  }
});

test("oversized responses are bounded with or without content-length", async () => {
  for (const lengthHeader of [false, true]) {
    const body = JSON.stringify({ status: "processed", ...counts, ignored: "x".repeat(20_000) });
    const server = await fixture((_request, response) => {
      response.writeHead(200, { "content-type": "application/json", ...(lengthHeader ? { "content-length": Buffer.byteLength(body) } : {}) });
      response.end(body);
    });
    try {
      const result = await cli(["--execute"], server.origin);
      assert.equal(result.code, 1);
      assert.deepEqual(result.output, { status: "invalid_response" });
    } finally { await server.close(); }
  }
});

test("disabled or unconfigured workers return safe operational statuses", async () => {
  for (const status of ["disabled", "not_configured", "storage_unavailable"]) {
    const server = await fixture((_request, response) => json(response, { status, processed: 0, accepted: 0, retry: 0, needsReview: 0, missing: ["private-settings"] }));
    try {
      const result = await cli(["--execute"], server.origin);
      assert.equal(result.code, 1);
      assert.deepEqual(result.output, { status, processed: 0, accepted: 0, retry: 0, needsReview: 0 });
    } finally { await server.close(); }
  }
});

test("slow requests stop within the bounded deadline and are never retried", async () => {
  let requests = 0;
  const server = await fixture(() => { requests++; });
  try {
    const start = Date.now();
    const result = await cli(["--execute"], server.origin);
    assert.equal(result.code, 1);
    assert.deepEqual(result.output, { status: "timeout" });
    assert.equal(requests, 1);
    assert.ok(Date.now() - start < 35_000, "A stalled request must end before the child process limit");
  } finally { await server.close(); }
});
