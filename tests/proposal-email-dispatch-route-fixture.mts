import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
const endpoint = "https://qa.example.test/api/admin/integrations/notifications";
const token = "synthetic-scheduler-capability-1234567890";
const result = { status: "processed", processed: 1, accepted: 1, retry: 0, needsReview: 0 };
let admin = true, fail = false, network = 0; const operations: string[] = [], options: unknown[] = [];
mock.method(globalThis, "fetch", async () => { network++; throw new Error("External requests forbidden"); });
mock.module(new URL("../app/admin/auth.ts", import.meta.url).href, { namedExports: { getAdminIdentity: async () => { operations.push("auth"); return admin ? { username: "reviewer@example.test", method: "password" } : null; } } });
mock.module(new URL("../app/integrations/proposal-email-worker.ts", import.meta.url).href, { namedExports: { dispatchProposalEmails: async (value?: unknown) => { operations.push("dispatch"); options.push(value); if (fail) throw new Error("Private SQL and developer@example.test"); return result; } } });
const { POST, GET } = await import("../app/api/admin/integrations/notifications/route");
const post = (origin?: string, body?: unknown) => new Request(endpoint, { method: "POST", headers: origin ? { origin, "Content-Type": "application/json" } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const get = (authorization?: string, query = "") => new Request(endpoint + query, { headers: authorization ? { authorization } : {} });
async function response(response: Response, expected: number, value: unknown) { assert.equal(response.status, expected); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(await response.json(), value); }
beforeEach(() => { admin = true; fail = false; operations.length = 0; options.length = 0; delete process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN; process.env.CARMELITA_PROPOSAL_EMAIL_ENABLED = "false"; });
test("unauthorized POST is rejected before dispatch and does not require reading a body", async () => {
  admin = false; await response(await POST(post()), 401, { status: "unauthorized" }); assert.deepEqual(operations, ["auth"]);
});
test("authenticated POST still requires the full same origin", async () => {
  for (const origin of [undefined, "https://outside.example.test", "http://qa.example.test", "null"]) {
    await response(await POST(post(origin)), 403, { status: "invalid_origin" });
  }
  assert.ok(operations.every(value => value === "auth")); assert.equal(options.length, 0);
});
test("admin request cannot override recipients, sender, payload or idempotency key", async () => {
  await response(await POST(post("https://qa.example.test", { to: "outside@example.test", from: "forged@example.test", payload: "Forged contents", idempotencyKey: "forged-key", env: { RESEND_API_KEY: "forged" } })), 200, result);
  assert.deepEqual(operations, ["auth", "dispatch"]); assert.deepEqual(options, [undefined]);
});
test("actual NextRequest loopback normalization accepts only the same browser authority", async () => {
  const request = new NextRequest("http://127.0.0.1:8144/api/admin/integrations/notifications", { method: "POST", headers: { host: "127.0.0.1:8144", origin: "http://127.0.0.1:8144" } });
  await response(await POST(request), 200, result); assert.deepEqual(operations, ["auth", "dispatch"]);
});
test("GET remains unauthorized for missing, weak, incorrect or URL-only tokens even when email is disabled", async () => {
  for (const configured of [undefined, "short", token]) {
    if (configured) process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN = configured; else delete process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN;
    for (const supplied of [undefined, "Bearer wrong", `Bearer ${token}x`, `bearer ${token}`]) await response(await GET(get(supplied)), 401, { status: "unauthorized" });
  }
  await response(await GET(get(undefined, `?token=${token}`)), 401, { status: "unauthorized" }); assert.deepEqual(operations, []);
});
test("valid scheduler capability invokes the configured worker without request overrides or administrative login", async () => {
  admin = false; process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN = token;
  await response(await GET(get(`Bearer ${token}`, "?to=outside%40example.test&from=spoofed%40example.test&key=override")), 200, result);
  assert.deepEqual(operations, ["dispatch"]); assert.deepEqual(options, [undefined]);
});
test("dispatch errors produce a safe unavailable response without private SQL or contact details", async () => {
  fail = true; await response(await POST(post("https://qa.example.test")), 503, { status: "notification_storage_error" });
  process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN = token; await response(await GET(get(`Bearer ${token}`)), 503, { status: "notification_storage_error" }); assert.equal(network, 0);
});
