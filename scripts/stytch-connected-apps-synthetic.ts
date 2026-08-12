import assert from "node:assert/strict";
import {
  parseOAuthAuthorizationRequest,
  StytchConnectedAppsClient,
  stytchExternalIdForPrivy,
} from "../app/stytch/connected-apps-client";

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.endsWith("/authorize/start")) {
    return Response.json({ client: { client_id: "chat-client", client_name: "Synthetic Chat" }, scope_results: [{ scope: "agent:read", is_grantable: true }] });
  }
  if (url.includes("/v1/users/")) return new Response(null, { status: 404 });
  if (url.endsWith("/v1/users")) return Response.json({ user_id: "user-test-123" });
  if (url.endsWith("/authorize")) return Response.json({ redirect_uri: "https://chat.example/callback?code=synthetic" });
  return Response.json({ error: "unexpected" }, { status: 500 });
};

const config = {
  projectId: "project-test-synthetic",
  secret: "secret-test-synthetic",
  issuer: "https://synthetic.customers.stytch.com",
  publicOrigin: "http://localhost:3000",
  resource: "http://localhost:3000/api/mcp/agent",
  authorizationUrl: "http://localhost:3000/oauth/authorize",
  defaultScopes: ["agent:read"],
};
const request = parseOAuthAuthorizationRequest(
  "client_id=chat-client&redirect_uri=https%3A%2F%2Fchat.example%2Fcallback&response_type=code&scope=agent%3Aread&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&resource=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fmcp%2Fagent",
);
const client = new StytchConnectedAppsClient(config, fakeFetch);
const userId = await client.ensureUserForPrivy("did:privy:synthetic-user", "synthetic@example.com");
const preflight = await client.preflightAuthorization(request, userId);
const authorized = await client.submitAuthorization(request, userId, true);

assert.equal(preflight.client.clientName, "Synthetic Chat");
assert.equal(userId, "user-test-123");
assert.equal(authorized.redirectUri, "https://chat.example/callback?code=synthetic");
assert.equal(calls.length, 4);
assert.ok(stytchExternalIdForPrivy("did:privy:synthetic-user").startsWith("privy|"));
assert.ok(!JSON.stringify(calls).includes("did:privy:synthetic-user"));
console.log("Stytch Connected Apps synthetic flow: PASS");
