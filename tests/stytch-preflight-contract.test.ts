import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOAuthAuthorizationRequest,
  StytchConnectedAppsClient,
} from "../app/stytch/connected-apps-client";

const config = {
  projectId: "project-test",
  secret: "secret-test",
  issuer: "https://example.customers.stytch.com",
  publicOrigin: "http://localhost:3000",
  resource: "http://localhost:3000/api/mcp/agent",
  authorizationUrl: "http://localhost:3000/oauth/authorize",
  defaultScopes: ["agent:read"],
};

const oauthRequest = parseOAuthAuthorizationRequest(
  "client_id=chat&redirect_uri=https%3A%2F%2Fchat.example%2Fcallback&response_type=code&scope=agent%3Aread&state=opaque&nonce=n&code_challenge=challenge&code_challenge_method=S256&resource=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fmcp%2Fagent",
);

test("uses the official Stytch preflight response and minimal request fields", async () => {
  let requestBody: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      connected_app: { client_id: "chat", client_name: "Verified Chat", client_description: "A Stytch registered client" },
      consent_required: true,
      connected_app_scope_results: [{ scope: "agent:read", description: "Read capabilities", is_grantable: true }],
    });
  };
  const result = await new StytchConnectedAppsClient(config, fakeFetch).preflightAuthorization(oauthRequest);
  assert.equal(result.client.clientName, "Verified Chat");
  assert.deepEqual(result.requestedScopes, ["agent:read"]);
  assert.deepEqual(Object.keys(requestBody).sort(), ["client_id", "redirect_uri", "response_type", "scopes"].sort());
  assert.ok(!("state" in requestBody));
  assert.ok(!("code_challenge" in requestBody));
});

test("refuses a scope Stytch says cannot be granted", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({
    connected_app: { client_id: "chat", client_name: "Verified Chat" },
    connected_app_scope_results: [{ scope: "agent:write", description: "Write", is_grantable: false }],
  });
  const client = new StytchConnectedAppsClient(config, fakeFetch);
  await assert.rejects(client.preflightAuthorization(oauthRequest), /stytch_oauth_scope_not_grantable/);
});

test("submit forwards PKCE challenge but not code_challenge_method", async () => {
  let requestBody: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ redirect_uri: "https://chat.example/callback?code=ok" });
  };
  await new StytchConnectedAppsClient(config, fakeFetch).submitAuthorization(oauthRequest, "user-test", true);
  assert.equal(requestBody.code_challenge, "challenge");
  assert.ok(!("code_challenge_method" in requestBody));
  assert.deepEqual(requestBody.resources, ["http://localhost:3000/api/mcp/agent"]);
});
