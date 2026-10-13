import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { STYTCH_AGENT_SCOPES, stytchProtectedResourceMetadata, validateStytchOAuthClaims } from "../app/mcp/stytch-oauth";
import { readStytchConnectedAppsConfig } from "../app/stytch/connected-apps-config";
import { PERSONAL_MCP_SCOPES, validatePersonalMcpScopes } from "../app/services/personal-mcp-token-store";

const associationScope = "agent:wallet:associate";
const legacyScopes = ["agent:read", "agent:plan", "agent:context", "agent:conversation"];
const env = {
  NODE_ENV: "test" as const,
  CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED: "true", CARMELITA_PUBLIC_ORIGIN: "https://synthetic-carmelita.example.test",
  STYTCH_PROJECT_DOMAIN: "https://synthetic-issuer.example.test", STYTCH_PROJECT_ID: "synthetic-project", STYTCH_SECRET: "synthetic-not-a-credential",
};

test("Tempo association is an explicitly supported OAuth scope and read grants remain unchanged", () => {
  assert.deepEqual(STYTCH_AGENT_SCOPES, [...legacyScopes, associationScope]);
  const metadata = stytchProtectedResourceMetadata(env);
  assert.ok(metadata.scopes_supported.includes(associationScope));
  const config = { issuer: env.STYTCH_PROJECT_DOMAIN, resource: metadata.resource,
    metadataUrl: "https://synthetic-carmelita.example.test/.well-known/oauth-protected-resource",
    jwksUrl: "https://synthetic-issuer.example.test/.well-known/jwks.json" };
  const payload = { iss: config.issuer, sub: "synthetic-oauth-subject", aud: config.resource, exp: 2000, client_id: "synthetic-client" };
  assert.deepEqual(validateStytchOAuthClaims({ ...payload, scope: `agent:read ${associationScope}` }, config, 1000).scopes,
    ["agent:read", associationScope]);
  assert.deepEqual(validateStytchOAuthClaims({ ...payload, scope: "agent:read" }, config, 1000).scopes, ["agent:read"]);
  for (const unsupported of ["agent:wallet:create", "agent:wallet:fund", "agent:wallet:sign", "agent:wallet:pay"]) {
    assert.throws(() => validateStytchOAuthClaims({ ...payload, scope: `agent:read ${unsupported}` }, config, 1000), /stytch_oauth_scope_invalid/);
  }
});

test("association support does not silently widen Connected Apps defaults or personal tokens", () => {
  assert.deepEqual(readStytchConnectedAppsConfig(env).defaultScopes, legacyScopes);
  assert.deepEqual(PERSONAL_MCP_SCOPES, legacyScopes);
  assert.deepEqual(validatePersonalMcpScopes(), ["agent:read"]);
  assert.throws(() => validatePersonalMcpScopes(["agent:read", associationScope]), /personal_mcp_scope_invalid/);
});

test("a verified Privy session does not automatically receive the new association scope", () => {
  const sourceUrl = (path: string) => new URL(path, import.meta.url).href;
  // Only provider authentication is mocked. The production verifier's fallback
  // scope grant and requireMcpSubject run unchanged in an isolated child process.
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    let providerReads = 0;
    const never = async () => { throw new Error('unexpected_authentication_boundary'); };
    mock.method(globalThis, 'fetch', never);
    mock.module(${JSON.stringify(sourceUrl("../app/privy-stellar.ts"))}, { namedExports: {
      verifyPrivyAccessToken: async token => { assert.equal(token, 'synthetic-privy-token'); providerReads++; return { user_id: 'did:privy:synthetic-fallback' }; }
    }});
    mock.module(${JSON.stringify(sourceUrl("../app/services/provider-store.ts"))}, { namedExports: { verifyServiceProviderToken: never }});
    mock.module(${JSON.stringify(sourceUrl("../app/services/personal-mcp-token-store.ts"))}, { namedExports: {
      PERSONAL_MCP_TOKEN_PREFIX: 'carmelita_user_', verifyPersonalMcpToken: never
    }});
    mock.module(${JSON.stringify(sourceUrl("../app/agent-gateway/operations.ts"))}, { namedExports: { isGatewayRateLimitError: () => false }});
    mock.module(${JSON.stringify(sourceUrl("../app/mcp/stytch-oauth.ts"))}, { namedExports: {
      agentOAuthBearerChallenge: () => 'synthetic-challenge', looksLikeStytchOAuthToken: () => false,
      stytchPrincipalAuthInfo: never, verifyStytchOAuthAccessToken: never
    }});
    const { verifyAgentMcpToken, requireMcpSubject } = await import(${JSON.stringify(sourceUrl("../app/mcp/auth.ts"))});
    const principal = await verifyAgentMcpToken('synthetic-privy-token');
    assert.deepEqual(principal.scopes, ${JSON.stringify(legacyScopes)});
    assert.equal(principal.extra.userId, 'did:privy:synthetic-fallback');
    assert.throws(() => requireMcpSubject(principal, 'user', 'userId', ${JSON.stringify(associationScope)}), /mcp_scope_required/);
    assert.equal(providerReads, 1);
    process.stdout.write(JSON.stringify({ automaticAssociationScope: false }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--input-type=module", "--eval", script], {
    encoding: "utf8", timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.deepEqual(JSON.parse(result.stdout), { automaticAssociationScope: false });
});
