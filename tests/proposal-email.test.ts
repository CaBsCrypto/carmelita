import assert from "node:assert/strict";
import test from "node:test";
import { buildProposalEmailMessage, isProposalEmailEnabled, readProposalEmailConfig, sendProposalEmail, type ProposalEmailMessage } from "../app/integrations/proposal-email";

const ID = "b0264551-4300-4559-a281-ed3a63958bca";
const KEY = `service-proposal/${ID}`;
const CONFIG: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  CARMELITA_PROPOSAL_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "re_test_not_a_real_key",
  CARMELITA_PROPOSAL_EMAIL_FROM: "proposals@example.com",
  CARMELITA_PROPOSAL_EMAIL_TO: "reviewer@example.com",
  CARMELITA_PUBLIC_ORIGIN: "https://qa.example.com",
  VERCEL_ENV: "preview",
};
const snapshot = { from: CONFIG.CARMELITA_PROPOSAL_EMAIL_FROM!, to: CONFIG.CARMELITA_PROPOSAL_EMAIL_TO!, reviewUrl: "https://qa.example.com/admin/integrations" };
const message = buildProposalEmailMessage(ID, snapshot);
const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers });
const mockFetch = (operation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch => operation as typeof fetch;

test("alerts are opt-in; a ready config is distinct from enabling or provider verification", () => {
  for (const value of [undefined, "false", "1", "TRUE", "true "]) {
    assert.equal(isProposalEmailEnabled({ NODE_ENV: "test", CARMELITA_PROPOSAL_EMAIL_ENABLED: value }), false);
  }
  assert.equal(isProposalEmailEnabled({ NODE_ENV: "test", CARMELITA_PROPOSAL_EMAIL_ENABLED: "true" }), true);
  assert.equal(readProposalEmailConfig({ ...CONFIG, CARMELITA_PROPOSAL_EMAIL_ENABLED: "false" }).enabled, false);
  assert.equal(readProposalEmailConfig({ ...CONFIG, CARMELITA_PROPOSAL_EMAIL_ENABLED: "false" }).ready, true);
  assert.deepEqual(readProposalEmailConfig({ NODE_ENV: "test" }).missing, ["RESEND_API_KEY", "CARMELITA_PROPOSAL_EMAIL_FROM", "CARMELITA_PROPOSAL_EMAIL_TO", "CARMELITA_PUBLIC_ORIGIN"]);
});

test("configuration requires explicit trusted HTTPS origin, a bare sender and one bare recipient", () => {
  for (const origin of [undefined, "http://qa.example.com", "https://user:password@qa.example.com", "https://qa.example.com/path", "https://qa.example.com/?token=private", "https://qa.example.com/#private", " https://qa.example.com", "https://qa.example.com\n"]) {
    const config = readProposalEmailConfig({ ...CONFIG, CARMELITA_PUBLIC_ORIGIN: origin });
    assert.equal(config.ready, false);
    assert.equal(config.reviewUrl, undefined);
    assert.deepEqual(config.missing, ["CARMELITA_PUBLIC_ORIGIN"]);
  }
  for (const address of ["Developer <private@example.com>", "one@example.com,two@example.com", "a..b@example.com", "a@example", "private@example.com\r\nBcc: leaked@example.com", "private@-example.com"]) {
    for (const name of ["CARMELITA_PROPOSAL_EMAIL_FROM", "CARMELITA_PROPOSAL_EMAIL_TO"]) {
      const config = readProposalEmailConfig({ ...CONFIG, [name]: address });
      assert.equal(config.ready, false);
      assert.deepEqual(config.missing, [name]);
      assert.equal(JSON.stringify(config.missing).includes(address), false);
    }
  }
  const invalidKey = readProposalEmailConfig({ ...CONFIG, RESEND_API_KEY: "re_private\r\nInjected: secret" });
  assert.equal(invalidKey.apiKey, undefined);
  assert.deepEqual(invalidKey.missing, ["RESEND_API_KEY"]);
});

test("review link comes from server connection configuration, never the request host", () => {
  assert.equal(readProposalEmailConfig(CONFIG).reviewUrl, snapshot.reviewUrl);
  assert.equal(readProposalEmailConfig({ ...CONFIG, VERCEL_ENV: "production" }).reviewUrl, "https://carmelita.browns.studio/admin/integrations");
  assert.equal(readProposalEmailConfig({ ...CONFIG, CARMELITA_PUBLIC_ORIGIN: "https://carmelita.browns.studio" }).ready, false);
  assert.equal(readProposalEmailConfig({ ...CONFIG, HTTP_HOST: "malicious.example.com", NEXT_PUBLIC_PROPOSAL_EMAIL_TO: "other@example.com" }).to, "reviewer@example.com");
});

test("minimal message is deterministic and contains only ID and private review link", () => {
  assert.deepEqual(message, {
    from: "proposals@example.com", to: ["reviewer@example.com"], subject: "New Carmelita service proposal",
    text: `A new service proposal is awaiting review in Carmelita.\n\nProposal ID: ${ID}\nReview proposals: https://qa.example.com/admin/integrations\n`,
  });
  assert.deepEqual(buildProposalEmailMessage(ID.toUpperCase(), snapshot), message);
  for (const id of ["", "not-a-uuid", `${ID}\nprivate@example.com`, "00000000-0000-0000-0000-000000000000"]) {
    assert.throws(() => buildProposalEmailMessage(id, snapshot), /^Error: proposal_email_invalid_message$/);
  }
  for (const reviewUrl of ["http://qa.example.com/admin/integrations", "https://qa.example.com/admin/integrations?token=secret", "https://secret@qa.example.com/admin/integrations", "https://qa.example.com/developers"]) {
    assert.throws(() => buildProposalEmailMessage(ID, { ...snapshot, reviewUrl }), /^Error: proposal_email_invalid_message$/);
  }
});

test("send uses fixed provider endpoint, exact persisted message and stable idempotency key", async () => {
  const calls: { input: unknown; init?: RequestInit }[] = [];
  const fetch = mockFetch(async (input, init) => { calls.push({ input, init }); return jsonResponse({ id: "provider_email_1" }); });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual(await sendProposalEmail(message, CONFIG.RESEND_API_KEY!, KEY, { fetch }), { status: "accepted", providerId: "provider_email_1" });
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input, "https://api.resend.com/emails");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.redirect, "error");
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${CONFIG.RESEND_API_KEY}`);
  assert.equal(headers.get("Idempotency-Key"), KEY);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(calls[0].init?.body, JSON.stringify(message));
  assert.equal(calls[0].init?.body, calls[1].init?.body);
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test("historical durable messages replay unchanged without requiring current copy", async () => {
  const historical = { ...message, subject: "Carmelita proposal received", text: `A proposal is ready for review.\nReference: ${ID}\n${snapshot.reviewUrl}` };
  const fetch = mockFetch(async (_input, init) => { assert.equal(init?.body, JSON.stringify(historical)); return jsonResponse({ id: "provider_email_old" }); });
  assert.deepEqual(await sendProposalEmail(historical, CONFIG.RESEND_API_KEY!, KEY, { fetch }), { status: "accepted", providerId: "provider_email_old" });
});

test("invalid headers, recipients, oversized message and credentials make no provider request", async () => {
  const fetch = mockFetch(async () => { assert.fail("invalid message must never reach provider"); });
  const invalid: ProposalEmailMessage[] = [
    { ...message, from: "bad@example.com\nBcc: leaked@example.com" },
    { ...message, to: [] }, { ...message, to: ["one@example.com", "two@example.com"] },
    { ...message, to: ["reviewer@example.com\r\nBcc: leaked@example.com"] },
    { ...message, subject: "Alert\nprivate@example.com" }, { ...message, subject: "a".repeat(201) },
    { ...message, text: "a".repeat(4097) }, { ...message, text: "secret\u0000" },
  ];
  for (const body of invalid) assert.deepEqual(await sendProposalEmail(body, "re_test", KEY, { fetch }), { status: "rejected", code: "proposal_email_invalid_message" });
  for (const apiKey of ["", "re_secret\nInjected: private"]) assert.deepEqual(await sendProposalEmail(message, apiKey, KEY, { fetch }), { status: "rejected", code: "proposal_email_invalid_credentials" });
  for (const key of ["", "key\nInjected: private", "a".repeat(257)]) assert.deepEqual(await sendProposalEmail(message, "re_test", key, { fetch }), { status: "rejected", code: "proposal_email_invalid_idempotency_key" });
});

test("timeouts bound both pending request and a stalled response body, cancelling work", async () => {
  let requestSignal: AbortSignal | null | undefined;
  const pending = mockFetch(async (_input, init) => { requestSignal = init?.signal; return new Promise<Response>(() => {}); });
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: pending, timeoutMs: 15 }), { status: "retry", code: "provider_timeout" });
  assert.equal(requestSignal?.aborted, true);
  let cancelled = false;
  const stalled = mockFetch(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"id":"')); }, cancel() { cancelled = true; } }), { status: 200 }));
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: stalled, timeoutMs: 15 }), { status: "retry", code: "provider_timeout" });
  assert.equal(cancelled, true);
});

test("unbounded, malformed and unknown success responses never announce accepted", async () => {
  for (const body of [null, {}, { id: "" }, { id: 123 }, { id: "a".repeat(129) }, { id: "private@example.com" }, { id: "id\nsecret" }]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse(body)) }), { status: "retry", code: "provider_response_invalid" });
  }
  for (const response of [new Response("<html>private provider data</html>"), new Response(null, { status: 204 }), new Response(new Uint8Array([0xff]))]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => response) }), { status: "retry", code: "provider_response_invalid" });
  }
  const streamedOversize = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(16_380));
    controller.enqueue(new Uint8Array(6));
    controller.close();
  } }));
  for (const response of [new Response("x".repeat(16_385)), new Response("{}", { headers: { "content-length": "16385" } }), streamedOversize]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => response) }), { status: "retry", code: "provider_response_too_large" });
  }
});

test("rate limits and unavailable provider retry with bounded delay; permanent requests reject", async () => {
  for (const status of [408, 429, 500, 502, 503]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse({ message: "private provider content" }, status, { "retry-after": "2" })) }), {
      status: "retry", code: status === 408 ? "provider_timeout" : status === 429 ? "provider_rate_limited" : "provider_unavailable", retryAfterMs: 2_000,
    });
  }
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse({}, 429, { "retry-after": "999999999999" })) }), { status: "retry", code: "provider_rate_limited", retryAfterMs: 86_400_000 });
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse({}, 429, { "retry-after": "secret@example.com" })) }), { status: "retry", code: "provider_rate_limited", retryAfterMs: undefined });
  for (const status of [400, 401, 403, 404, 422]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse({ message: "private email secret token" }, status)) }), { status: "rejected", code: status === 401 || status === 403 ? "provider_credentials_rejected" : "provider_request_rejected" });
  }
});

test("only documented concurrent idempotency conflict retries, a payload conflict does not change key", async () => {
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => jsonResponse({ name: "concurrent_idempotent_requests", message: "private" }, 409)) }), { status: "retry", code: "provider_concurrent_request", retryAfterMs: undefined });
  for (const body of [{ name: "invalid_idempotent_request" }, { name: "unknown private error" }, { message: "concurrent_idempotent_requests" }, null]) {
    assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), KEY);
      return jsonResponse(body, 409);
    }) }), { status: "rejected", code: "provider_conflict" });
  }
  assert.deepEqual(await sendProposalEmail(message, "re_test", KEY, { fetch: mockFetch(async () => new Response("provider secrets", { status: 409 })) }), { status: "rejected", code: "provider_conflict" });
});

test("provider and network exceptions expose only fixed safe failure codes", async () => {
  const result = await sendProposalEmail(message, "re_private_secret", KEY, { fetch: mockFetch(async () => { throw new Error("private@example.com re_private_secret sensitive use case"); }) });
  assert.deepEqual(result, { status: "retry", code: "provider_network_error" });
  assert.doesNotMatch(JSON.stringify(result), /private@example|re_private_secret|sensitive/);
});
