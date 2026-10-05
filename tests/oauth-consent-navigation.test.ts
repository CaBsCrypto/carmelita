import assert from "node:assert/strict";
import test from "node:test";
import { ConsentRequestError, createConsentDecision, requestConsentPreflight, requestConsentRedirect } from "../app/oauth/authorize/consent-request";

const query = "?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&state=test-state";
const target = "https://chatgpt.com/connector_platform_oauth_redirect?code=synthetic&state=test-state";
const response = { client: { clientId: "synthetic-client", clientName: "Synthetic Chat" }, requestedScopes: ["agent:read"], consentRequired: true };
const hasCode = (code: ConsentRequestError["code"]) => (error: unknown) => error instanceof ConsentRequestError && error.code === code;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("consent returns a validated callback and sends exactly the chosen decision with bearer authentication", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "/api/oauth/stytch/authorize");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { query, consentGranted: true });
    return Response.json({ redirectUri: target });
  };
  assert.equal(await requestConsentRedirect(query, true, async () => "synthetic-token", fetcher), target);
  assert.equal(calls, 1);
});

test("a stalled token expires before authorization and its late resolution sends no request", async () => {
  let calls = 0;
  let release!: (token: string) => void;
  const session = new Promise<string>(resolve => { release = resolve; });
  await assert.rejects(requestConsentRedirect(query, true, () => session, async () => {
    calls++; return Response.json({ redirectUri: target });
  }, 10), hasCode("authorization_uncertain"));
  release("late-token");
  await tick();
  assert.equal(calls, 0);
});

test("a stalled authorization aborts under its full deadline and is never retried", async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const decide = createConsentDecision(query, async () => "synthetic-token", async (_url, init) => {
    calls++; signal = init?.signal; return new Promise<Response>(() => {});
  }, 10);
  await assert.rejects(decide(true), hasCode("authorization_uncertain"));
  await assert.rejects(decide(false), hasCode("authorization_uncertain"));
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});

test("two decisions in the same event loop share the first request, including a conflicting denial", async () => {
  let calls = 0;
  const decide = createConsentDecision(query, async () => "synthetic-token", async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).consentGranted, false);
    return Response.json({ redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=test-state" });
  });
  const first = decide(false);
  assert.equal(decide(true), first);
  await first;
  assert.equal(calls, 1);
});

test("foreign destinations, fragment callbacks, credentials, duplicate states and invalid OAuth outcomes fail closed", async () => {
  for (const redirectUri of [
    "https://other.example/callback?code=a&state=test-state",
    "javascript:alert(1)",
    "https://chatgpt.com/wrong?code=a&state=test-state",
    "https://user:pass@chatgpt.com/connector_platform_oauth_redirect?code=a&state=test-state",
    "https://chatgpt.com/connector_platform_oauth_redirect?code=a&state=another-state",
    target + "#fragment",
    target + "&state=test-state",
    target + "&error=access_denied",
    target + "&code=another",
    "https://chatgpt.com/connector_platform_oauth_redirect?state=test-state",
  ]) {
    await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async () => Response.json({ redirectUri })), hasCode("redirect_invalid"));
  }
});

test("denial returns access_denied rather than granting a code; fixed callback query parameters cannot be changed", async () => {
  const denied = "https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=test-state";
  assert.equal(await requestConsentRedirect(query, false, async () => "synthetic-token", async () => Response.json({ redirectUri: denied })), denied);
  await assert.rejects(requestConsentRedirect(query, false, async () => "synthetic-token", async () => Response.json({ redirectUri: target })), hasCode("redirect_invalid"));
  const fixedQuery = "?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect%3Fflow%3Done&state=test-state";
  await assert.rejects(requestConsentRedirect(fixedQuery, true, async () => "synthetic-token", async () => Response.json({ redirectUri: target + "&flow=two" })), hasCode("redirect_invalid"));
  assert.equal(await requestConsentRedirect(fixedQuery, true, async () => "synthetic-token", async () => Response.json({ redirectUri: target + "&flow=one" })), target + "&flow=one");
});

test("missing tokens and SDK failures do not send requests or expose private failure details", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ redirectUri: target }); };
  await assert.rejects(requestConsentRedirect(query, true, async () => null, fetcher), hasCode("session_unavailable"));
  await assert.rejects(requestConsentRedirect(query, true, async () => { throw new Error("private-token-detail"); }, fetcher), hasCode("authorization_failed"));
  assert.equal(calls, 0);
  await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async () => Response.json({ error: "private-detail" }, { status: 500 })), hasCode("authorization_failed"));
});

test("the deadline also covers the response body and cancels a stalled stream", async () => {
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async () => new Response(stalled), 10), hasCode("authorization_uncertain"));
  await tick();
  assert.equal(cancelled, true);
});

test("a session change cancels a pending token and prevents any late transmission", async () => {
  const owner = new AbortController();
  let release!: (token: string) => void;
  let calls = 0;
  const token = new Promise<string>(resolve => { release = resolve; });
  const old = requestConsentRedirect(query, true, () => token, async () => {
    calls++; return Response.json({ redirectUri: target });
  }, 1000, owner.signal);
  owner.abort();
  await assert.rejects(old, hasCode("cancelled"));
  release("old-owner-token");
  await tick();
  assert.equal(calls, 0);
});

test("a session change discards a late callback even if the transport ignores abort", async () => {
  const owner = new AbortController();
  let release!: (value: Response) => void;
  const old = requestConsentRedirect(query, true, async () => "old-owner-token", async () => new Promise<Response>(resolve => { release = resolve; }), 1000, owner.signal);
  await tick();
  owner.abort();
  await assert.rejects(old, hasCode("cancelled"));
  release(Response.json({ redirectUri: target }));
  await tick();
});

test("inspection validates scopes without adding conversation access or accepting malformed response fields", async () => {
  const result = await requestConsentPreflight(query, async () => "synthetic-token", async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { query });
    return Response.json(response);
  });
  assert.deepEqual(result.requestedScopes, ["agent:read"]);
  for (const body of [
    { ...response, requestedScopes: ["agent:read", "agent:read"] },
    { ...response, requestedScopes: ["invalid scope"] },
    { ...response, client: { clientId: "test", clientName: "<".repeat(121) } },
    { ...response, consentRequired: "yes" },
  ]) await assert.rejects(requestConsentPreflight(query, async () => "synthetic-token", async () => Response.json(body)), hasCode("inspection_failed"));
});

test("inspection has a full response-body deadline and rejects oversized results", async () => {
  await assert.rejects(requestConsentPreflight(query, async () => "synthetic-token", async () => new Response(new ReadableStream()), 10), hasCode("inspection_timeout"));
  await assert.rejects(requestConsentPreflight(query, async () => "synthetic-token", async () => Response.json({ ...response, extra: "x".repeat(65536) })), hasCode("inspection_failed"));
});
