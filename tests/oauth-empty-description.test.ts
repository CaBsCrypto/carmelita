import assert from "node:assert/strict";
import test from "node:test";
import { StytchConnectedAppsClient, parseOAuthAuthorizationRequest } from "../app/stytch/connected-apps-client";
import { requestConsentPreflight } from "../app/oauth/authorize/consent-request";

test("successful Stytch preflight with an empty optional description remains valid in the consent page", async () => {
  const query = "client_id=synthetic&redirect_uri=https%3A%2F%2Fchat.example%2Fcb&response_type=code&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&resource=https%3A%2F%2Fcarmelita.example%2Fapi%2Fmcp%2Fagent&scope=agent%3Aread";
  for (const description of ["", "   ", " useful description "]) {
    const client = new StytchConnectedAppsClient({ projectId: "synthetic", secret: "synthetic", issuer: "https://example.customers.stytch.com", publicOrigin: "https://carmelita.example", resource: "https://carmelita.example/api/mcp/agent", authorizationUrl: "https://carmelita.example/oauth/authorize", defaultScopes: ["agent:read"] }, async () => Response.json({ client: { client_id: "synthetic", client_name: "Synthetic assistant", client_description: description }, consent_required: true, scope_results: [{ scope: "agent:read", is_grantable: true }] }));
    const backend = await client.preflightAuthorization(parseOAuthAuthorizationRequest(query), "synthetic-user");
    const browser = await requestConsentPreflight(query, async () => "synthetic-token", async () => Response.json(backend));
    assert.equal(browser.client.clientDescription, description.trim() || undefined);
    assert.deepEqual(browser.requestedScopes, ["agent:read"]);
    assert.equal(browser.consentRequired, true);
  }
});
