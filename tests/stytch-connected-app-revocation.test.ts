import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { StytchConnectedAppsClient } from "../app/stytch/connected-apps-client";

const config = {
  projectId: "project-test",
  secret: "secret-test",
  issuer: "https://example.customers.stytch.com",
  publicOrigin: "http://localhost:3000",
  resource: "http://localhost:3000/api/mcp/agent",
  authorizationUrl: "http://localhost:3000/oauth/authorize",
  defaultScopes: ["agent:read"],
};
const appId = "connected-app-test-123";

test("lists only sanitized Connected App metadata and revokes through the mapped Stytch user path", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, method: init?.method });
    if (init?.method === "GET") return Response.json({ connected_apps: [{
      connected_app_id: appId,
      name: "Chat client",
      description: "Connected through OAuth",
      client_type: "third_party_public",
      scopes_granted: "agent:read offline_access",
      client_secret: "must-not-leak",
    }] });
    return Response.json({ request_id: "request-test", status_code: 200 });
  };
  const client = new StytchConnectedAppsClient(config, fakeFetch);
  const apps = await client.listConnectedApps("user-test-123");
  assert.deepEqual(apps, [{ id: appId, name: "Chat client", description: "Connected through OAuth", clientType: "third_party_public", scopes: ["agent:read", "offline_access"] }]);
  assert.doesNotMatch(JSON.stringify(apps), /secret|request-test/);
  assert.deepEqual(await client.revokeConnectedApp("user-test-123", appId), { connectedAppId: appId, revoked: true });
  assert.equal(calls.at(-1)?.url, `https://example.customers.stytch.com/v1/users/user-test-123/connected_apps/${appId}/revoke`);
  assert.equal(calls.at(-1)?.method, "POST");
});

test("refuses to revoke an app not returned for the mapped user", async () => {
  let revokeCalls = 0;
  const fakeFetch: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") revokeCalls += 1;
    return Response.json({ connected_apps: [{ connected_app_id: appId, name: "Own app", client_type: "third_party_public", scopes_granted: "agent:read" }] });
  };
  const client = new StytchConnectedAppsClient(config, fakeFetch);
  await assert.rejects(client.revokeConnectedApp("user-test-123", "connected-app-test-other"), /stytch_connected_app_not_found/);
  assert.equal(revokeCalls, 0);
});

test("self-service API derives identity only from Privy and the issuer mapping", async () => {
  const route = await readFile(new URL("../app/api/agent/connected-apps/route.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../app/services/oauth-subject-link-store.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/agent/agent-connected-apps.tsx", import.meta.url), "utf8");
  assert.match(route, /verifyPrivyAccessToken/);
  assert.match(route, /resolveOAuthSubjectForPrivy/);
  assert.match(route, /readStytchConnectedAppsConfig/);
  assert.match(route, /hasSameRequestOrigin/);
  assert.doesNotMatch(route, /body\.(userId|subject|privyDid)/);
  assert.doesNotMatch(store, /email/i);
  assert.match(ui, /window\.confirm/);
  assert.doesNotMatch(ui, /STYTCH_SECRET|client_secret|refresh_token|body\\.(accessToken|refreshToken|clientSecret)/i);
});