import assert from "node:assert/strict";
import test from "node:test";
import { readStytchConnectedAppsConfig } from "../app/stytch/connected-apps-config";
import {
  parseOAuthAuthorizationRequest,
  StytchConnectedAppsClient,
  stytchExternalIdForPrivy,
} from "../app/stytch/connected-apps-client";

test("pins the canonical MCP resource", () => {
  const config = readStytchConnectedAppsConfig({
    NODE_ENV: "production",
    STYTCH_PROJECT_ID: "project-test",
    STYTCH_SECRET: "secret-test",
    STYTCH_PROJECT_DOMAIN: "https://example.customers.stytch.com",
    CARMELITA_PUBLIC_ORIGIN: "https://carmelita.example",
  });
  assert.equal(config.resource, "https://carmelita.example/api/mcp/agent");
  assert.deepEqual(config.defaultScopes, ["agent:read", "agent:plan", "agent:context", "agent:conversation"]);
});

test("rejects non-S256 PKCE and malformed authorization requests", () => {
  assert.throws(() => parseOAuthAuthorizationRequest("client_id=a&response_type=code"), /oauth_authorization_request_invalid/);
  assert.throws(
    () => parseOAuthAuthorizationRequest("client_id=a&redirect_uri=https%3A%2F%2Fchat.example%2Fcb&response_type=code&code_challenge_method=plain"),
    /oauth_pkce_method_unsupported/,
  );
  assert.throws(() => parseOAuthAuthorizationRequest("client_id=a&redirect_uri=http%3A%2F%2Fattacker.example%2Fcb&response_type=code"), /oauth_authorization_request_invalid/);
  assert.throws(() => parseOAuthAuthorizationRequest("client_id=a&redirect_uri=javascript%3Aalert(1)&response_type=code"), /oauth_authorization_request_invalid/);
});

test("derives a stable privacy-safe external id", () => {
  const did = "did:privy:user-secret";
  const first = stytchExternalIdForPrivy(did);
  assert.equal(first, stytchExternalIdForPrivy(did));
  assert.match(first, /^privy\|[a-f0-9]{64}$/);
  assert.ok(!first.includes(did));
});

test("sanitizes upstream failure instead of leaking the Stytch body", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({ error: "raw-upstream-secret" }, { status: 401 });
  const client = new StytchConnectedAppsClient({
    projectId: "project-test",
    secret: "secret-test",
    issuer: "https://example.customers.stytch.com",
    publicOrigin: "http://localhost:3000",
    resource: "http://localhost:3000/api/mcp/agent",
    authorizationUrl: "http://localhost:3000/oauth/authorize",
    defaultScopes: ["agent:read"],
  }, fakeFetch);
  const request = parseOAuthAuthorizationRequest("client_id=a&redirect_uri=https%3A%2F%2Fchat.example%2Fcb&response_type=code");
  await assert.rejects(client.preflightAuthorization(request), (error: Error) => {
    assert.equal(error.message, "stytch_oauth_preflight_failed");
    assert.ok(!error.message.includes("raw-upstream-secret"));
    return true;
  });
});
test("rejects an upstream redirect that changes the registered callback origin", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({
    redirect_uri: "https://attacker.example/callback?code=stolen",
  });
  const client = new StytchConnectedAppsClient({
    projectId: "project-test",
    secret: "secret-test",
    issuer: "https://example.customers.stytch.com",
    publicOrigin: "http://localhost:3000",
    resource: "http://localhost:3000/api/mcp/agent",
    authorizationUrl: "http://localhost:3000/oauth/authorize",
    defaultScopes: ["agent:read"],
  }, fakeFetch);
  const request = parseOAuthAuthorizationRequest("client_id=a&redirect_uri=https%3A%2F%2Fchat.example%2Fcb&response_type=code");
  await assert.rejects(client.submitAuthorization(request, "user-test", true), /stytch_oauth_redirect_invalid/);
});