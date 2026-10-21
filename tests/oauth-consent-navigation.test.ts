import assert from "node:assert/strict";
import test from "node:test";
import { requestConsentRedirect } from "../app/oauth/authorize/consent-request";

const query = "?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&state=test-state";
const target = "https://chatgpt.com/connector_platform_oauth_redirect?code=synthetic&state=test-state";

test("consent returns a validated callback for explicit navigation, with one authenticated request", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { query, consentGranted: true });
    return Response.json({ redirectUri: target });
  };
  assert.equal(await requestConsentRedirect(query, true, async () => "synthetic-token", fetcher), target);
  assert.equal(calls, 1);
});

test("a stalled Privy session times out without sending authorization, including after its late resolution", async () => {
  let calls = 0;
  let release!: (token: string) => void;
  const session = new Promise<string>(resolve => { release = resolve; });
  await assert.rejects(requestConsentRedirect(query, true, () => session, async () => {
    calls++; return Response.json({ redirectUri: target });
  }, 10), /uncertain/);
  release("late-token");
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls, 0);
});

test("a stalled authorization aborts and reports uncertainty without retrying", async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async (_url, init) => {
    calls++; signal = init?.signal;
    return new Promise<Response>(() => {});
  }, 10), /uncertain/);
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});

test("a different destination or unsafe callback is rejected", async () => {
  for (const redirectUri of ["https://other.example/callback", "javascript:alert(1)", "https://chatgpt.com/wrong", "https://user:pass@chatgpt.com/connector_platform_oauth_redirect", "https://chatgpt.com/connector_platform_oauth_redirect?state=another-state"]) {
    await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async () => Response.json({ redirectUri })), /invalid/);
  }
});

test("denial preserves the provider callback error and does not expose server error details", async () => {
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect?error=access_denied&state=test-state";
  assert.equal(await requestConsentRedirect(query, false, async () => "synthetic-token", async () => Response.json({ redirectUri })), redirectUri);
  await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic-token", async () => Response.json({ error: "private-detail" }, { status: 500 })), error => error instanceof Error && !error.message.includes("private-detail"));
});

test("missing sessions and private SDK failures never transmit authorization or disclose details", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ redirectUri: target }); };
  await assert.rejects(requestConsentRedirect(query, true, async () => null, fetcher), /session is unavailable/);
  await assert.rejects(requestConsentRedirect(query, true, async () => { throw new Error("private-token-detail"); }, fetcher), error => error instanceof Error && !error.message.includes("private-token-detail"));
  assert.equal(calls, 0);
});
