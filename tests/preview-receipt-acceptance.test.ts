import assert from "node:assert/strict";
import test from "node:test";
import { createReceiptAcceptanceController, runReceiptAcceptance } from "../app/preview-acceptance/receipt-checks";

const paymentId = "d2019c0a-949b-4b5a-9275-e3ab394adcb0";
const session = { ready: true, authenticated: true, userId: "did:privy:fixture-user-b" };
const health = { status: "ok", deployment: { environment: "preview", gitCommitSha: "a".repeat(40), url: "https://receipt-qa.vercel.app" }, previewIsolation: { verified: true, databaseFingerprint: "b".repeat(64) } };
const token = "fixture-token-never-report";
type Call = { path: string; options?: RequestInit };

function receiptResponse(status = 404, redirected = false) {
  const response = new Response("foreign_receipt_private_content", { status });
  // Even an unexpected success must never be inspected or copied into evidence.
  for (const method of ["text", "json", "arrayBuffer", "blob", "formData"] as const) {
    Object.defineProperty(response, method, { value: () => { throw new Error("receipt_body_was_read"); } });
  }
  if (redirected) Object.defineProperty(response, "redirected", { value: true });
  return response;
}

function fixtureFetch(calls: Call[], override?: (path: string, options?: RequestInit) => Response | undefined): typeof fetch {
  return async (input, options) => {
    const path = String(input);
    calls.push({ path, options });
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    const customized = override?.(path, options);
    if (customized) return customized;
    if (path === "/api/health") {
      assert.equal(new Headers(options?.headers).has("Authorization"), false);
      return Response.json(health);
    }
    assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${token}`);
    if (options?.method === "POST") {
      assert.equal(path, "/api/agent/x402");
      assert.equal(new Headers(options.headers).get("Content-Type"), "application/json");
      assert.deepEqual(JSON.parse(String(options.body)), { action: "reconcile", paymentId });
    } else assert.equal(path, `/api/agent/x402?paymentId=${paymentId}`);
    return receiptResponse();
  };
}

function options(fetcher: typeof fetch = fixtureFetch([])) {
  return { paymentId, session, getAccessToken: async () => token, fetcher, ...createReceiptAcceptanceController().begin() };
}

test("receipt acceptance passes only two 404 responses and records sanitized deployment evidence per check", async () => {
  const calls: Call[] = [];
  const report = await runReceiptAcceptance(options(fixtureFetch(calls)));
  assert.equal(report.status, "PASS");
  assert.equal(report.paymentId, paymentId);
  assert.equal(report.ownershipValidation, "external_required");
  assert.equal(report.checks.length, 6);
  assert.deepEqual(report.checks.filter((check) => check.name.startsWith("GET") || check.name.startsWith("POST")).map((check) => check.http), [404, 404]);
  for (const check of report.checks) {
    assert.equal(check.commit, health.deployment.gitCommitSha);
    assert.equal(check.deployment, health.deployment.url);
    assert.ok(Number.isFinite(Date.parse(check.date)));
  }
  assert.deepEqual(calls.map((call) => [call.options?.method ?? "GET", call.path]), [
    ["GET", "/api/health"], ["GET", `/api/agent/x402?paymentId=${paymentId}`],
    ["POST", "/api/agent/x402"], ["GET", "/api/health"],
  ]);
  const evidence = JSON.stringify(report);
  assert.doesNotMatch(evidence, /fixture-token|did:privy:|foreign_receipt|Authorization|signedTransaction/);
});

test("invalid identifiers and absent or unready sessions send no request and obtain no token", async () => {
  for (const replacement of [
    { paymentId: "not-a-uuid-token-never-report" }, { paymentId: "00000000-0000-0000-0000-000000000000" },
    { session: { ...session, authenticated: false } }, { session: { ...session, ready: false } },
    { session: { ...session, userId: null } }, { session: { ...session, userId: "another-system-user" } },
  ]) {
    const calls: Call[] = [];
    let tokenCalls = 0;
    const report = await runReceiptAcceptance({ ...options(fixtureFetch(calls)), ...replacement, getAccessToken: async () => { tokenCalls++; return token; } });
    assert.equal(report.status, "FAIL");
    assert.deepEqual(calls, []);
    assert.equal(tokenCalls, 0);
    assert.equal(report.checks.filter((check) => check.status === "PENDING").length, 2);
    assert.doesNotMatch(JSON.stringify(report), /not-a-uuid-token|another-system-user/);
  }
});

test("Preview isolation and complete deployment metadata are prerequisites for obtaining a token or checking receipts", async () => {
  for (const invalid of [
    { ...health, deployment: { ...health.deployment, environment: "production" } },
    { ...health, previewIsolation: { ...health.previewIsolation, verified: false } },
    { ...health, previewIsolation: { ...health.previewIsolation, databaseFingerprint: "" } },
    { ...health, deployment: { ...health.deployment, gitCommitSha: "" } },
    { ...health, deployment: { ...health.deployment, url: "https://secret-user:secret-password@qa.vercel.app" } },
    { ...health, deployment: { ...health.deployment, url: "https://qa.vercel.app/?token=secret-token" } },
    { ...health, status: "error" }, null,
  ]) {
    const calls: Call[] = [];
    let tokenCalls = 0;
    const report = await runReceiptAcceptance({ ...options(fixtureFetch(calls, () => Response.json(invalid))), getAccessToken: async () => { tokenCalls++; return token; } });
    assert.equal(report.status, "FAIL");
    assert.deepEqual(calls.map((call) => call.path), ["/api/health"]);
    assert.equal(tokenCalls, 0);
    assert.doesNotMatch(JSON.stringify(report), /secret-|did:privy:|fixture-token/);
  }
});

test("unexpected health HTTP, redirects and malformed JSON fail closed", async () => {
  for (const response of [Response.json(health, { status: 503 }), new Response("not-json"), receiptResponse(404, true)]) {
    const calls: Call[] = [];
    const report = await runReceiptAcceptance(options(fixtureFetch(calls, () => response)));
    assert.equal(report.status, "FAIL");
    assert.equal(calls.length, 1);
  }
});

test("an expired Privy session or token failure prevents both receipt operations without leaking the error", async () => {
  for (const getAccessToken of [async () => null, async () => " ", async () => { throw new Error("private-error-with-token"); }]) {
    const calls: Call[] = [];
    const report = await runReceiptAcceptance({ ...options(fixtureFetch(calls)), getAccessToken });
    assert.equal(report.status, "FAIL");
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(report), /private-error|fixture-token/);
  }
});

test("unexpected receipt GET statuses never pass or proceed to reconciliation", async () => {
  for (const status of [200, 400, 401, 403, 409, 429, 500]) {
    const calls: Call[] = [];
    const report = await runReceiptAcceptance(options(fixtureFetch(calls, (path) => path.includes("?paymentId=") ? receiptResponse(status) : undefined)));
    assert.equal(report.status, "FAIL");
    assert.equal(report.checks.find((check) => check.name === "GET de recibo ajeno")?.http, status);
    assert.equal(report.checks.find((check) => check.name === "POST de reconciliación ajena")?.status, "PENDING");
    assert.ok(calls.every((call) => call.options?.method !== "POST"));
    assert.doesNotMatch(JSON.stringify(report), /foreign_receipt|fixture-token/);
  }
});

test("unexpected reconcile status or a redirected 404 cannot count as isolation", async () => {
  for (const status of [200, 400, 401, 403, 409, 429, 500]) {
    const report = await runReceiptAcceptance(options(fixtureFetch([], (_path, init) => init?.method === "POST" ? receiptResponse(status) : undefined)));
    assert.equal(report.status, "FAIL");
    assert.equal(report.checks.find((check) => check.name === "POST de reconciliación ajena")?.http, status);
  }
  for (const method of ["GET", "POST"]) {
    const report = await runReceiptAcceptance(options(fixtureFetch([], (path, init) => path.startsWith("/api/agent/x402") && init?.method === method ? receiptResponse(404, true) : undefined)));
    assert.equal(report.status, "FAIL");
  }
});

test("network errors cannot disclose an error body or manufacture a successful denial", async () => {
  for (const method of ["GET", "POST"]) {
    const calls: Call[] = [];
    const inner = fixtureFetch(calls);
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).startsWith("/api/agent/x402") && init?.method === method) throw new Error("foreign_receipt_private_content fixture-token-never-report");
      return inner(input, init);
    };
    const report = await runReceiptAcceptance(options(fetcher));
    assert.equal(report.status, "FAIL");
    assert.doesNotMatch(JSON.stringify(report), /foreign_receipt|fixture-token/);
  }
});

test("changing the deployed version or isolated database during a run invalidates its result", async () => {
  for (const changed of [
    { ...health, deployment: { ...health.deployment, gitCommitSha: "c".repeat(40) } },
    { ...health, deployment: { ...health.deployment, url: "https://other-preview.vercel.app" } },
    { ...health, previewIsolation: { ...health.previewIsolation, databaseFingerprint: "c".repeat(64) } },
  ]) {
    let healthCalls = 0;
    const report = await runReceiptAcceptance(options(fixtureFetch([], (path) => path === "/api/health" && ++healthCalls === 2 ? Response.json(changed) : undefined)));
    assert.equal(report.status, "FAIL");
    assert.equal(report.checks.at(-1)?.status, "FAIL");
  }
});

test("account cancellation while Privy resolves a token prevents all receipt requests", async () => {
  const calls: Call[] = [];
  const requests = createReceiptAcceptanceController();
  let resolveToken!: (value: string) => void;
  let tokenStarted!: () => void;
  const started = new Promise<void>((resolve) => { tokenStarted = resolve; });
  const tokenResult = new Promise<string>((resolve) => { resolveToken = resolve; });
  const pending = runReceiptAcceptance({ ...options(fixtureFetch(calls)), ...requests.begin(), getAccessToken: () => { tokenStarted(); return tokenResult; } });
  await started;
  requests.cancel();
  resolveToken(token);
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(calls.map((call) => call.path), ["/api/health"]);
});

test("a late GET after changing account or starting another revision never triggers POST or publishes evidence", async () => {
  const requests = createReceiptAcceptanceController();
  const calls: Call[] = [];
  const base = fixtureFetch(calls);
  let resolveGet!: (value: Response) => void;
  let getStarted!: () => void;
  const started = new Promise<void>((resolve) => { getStarted = resolve; });
  const response = new Promise<Response>((resolve) => { resolveGet = resolve; });
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("?paymentId=")) { getStarted(); return response; }
    return base(input, init);
  };
  const previous = requests.begin();
  const pending = runReceiptAcceptance({ ...options(fetcher), ...previous });
  await started;
  const next = requests.begin();
  assert.equal(previous.isCurrent(), false);
  assert.equal(previous.signal.aborted, true);
  assert.equal(next.isCurrent(), true);
  resolveGet(receiptResponse());
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(calls.every((call) => call.options?.method !== "POST"));
  requests.cancel();
  assert.equal(next.isCurrent(), false);
});

test("an invalidated session callback prevents continuation even if a custom fetcher ignores abort", async () => {
  let current = true;
  const base = fixtureFetch([]);
  const fetcher: typeof fetch = async (input, init) => {
    const response = await base(input, init);
    if (String(input).includes("?paymentId=")) current = false;
    return response;
  };
  await assert.rejects(runReceiptAcceptance({ ...options(fetcher), isCurrent: () => current }), { name: "AbortError" });
});
