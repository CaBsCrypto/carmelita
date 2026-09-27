import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { decodeJwt, generateKeyPair, SignJWT } from "jose";
import { GET as protectedResourceMetadata } from "../app/.well-known/oauth-protected-resource/route";
import {
  STYTCH_AGENT_SCOPES,
  assertStytchOAuthTokenActive,
  agentOAuthBearerChallenge,
  readStytchOAuthResourceConfig,
  stytchProtectedResourceMetadata,
  validateStytchOAuthClaims,
  verifyStytchOAuthJwt,
} from "../app/mcp/stytch-oauth";
import {
  assertOAuthSubjectOwnership,
  normalizeOAuthIssuer,
  validateOAuthSubjectLink,
} from "../app/services/oauth-subject-link-store";

const oauthEnv = {
  CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED: "true",
  CARMELITA_PUBLIC_ORIGIN: "https://carmelita-agent.vercel.app",
  STYTCH_PROJECT_DOMAIN: "https://carmelita-auth.customers.stytch.com",
  STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE: "carmelita-test-client",
};

async function signedToken(input: { issuer?: string; audience?: string; scope?: string; algorithm?: "RS256" | "HS256" } = {}) {
  const algorithm = input.algorithm ?? "RS256";
  const key = algorithm === "RS256"
    ? (await generateKeyPair("RS256")).privateKey
    : new TextEncoder().encode("01234567890123456789012345678901");
  // RS256 callers use tokenWithKey below; this helper only creates adversarial HS256 tokens.
  return new SignJWT({ scope: input.scope ?? "agent:read" })
    .setProtectedHeader({ alg: algorithm })
    .setIssuer(input.issuer ?? oauthEnv.STYTCH_PROJECT_DOMAIN!)
    .setSubject("user-test-stytch-subject")
    .setAudience(input.audience ?? "carmelita-test-client")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key as never);
}

async function tokenWithKey(input: { issuer?: string; audience?: string; scope?: string } = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const token = await new SignJWT({ scope: input.scope ?? "openid agent:read agent:plan" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(input.issuer ?? oauthEnv.STYTCH_PROJECT_DOMAIN!)
    .setSubject("user-test-stytch-subject")
    .setAudience(input.audience ?? "carmelita-test-client")
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("5m")
    .sign(privateKey);
  return { token, publicKey };
}

test("RFC 9728 metadata is feature-flagged and publishes only non-executing agent scopes", async () => {
  const previous = process.env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED;
  delete process.env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED;
  try {
    assert.equal((await protectedResourceMetadata()).status, 404);
  } finally {
    if (previous === undefined) delete process.env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED;
    else process.env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED = previous;
  }

  const metadata = stytchProtectedResourceMetadata(oauthEnv);
  assert.equal(metadata.resource, "https://carmelita-agent.vercel.app/api/mcp/agent");
  assert.deepEqual(metadata.authorization_servers, ["https://carmelita-auth.customers.stytch.com"]);
  assert.deepEqual(metadata.scopes_supported, STYTCH_AGENT_SCOPES);
  assert.deepEqual(metadata.bearer_methods_supported, ["header"]);
  assert.doesNotMatch(JSON.stringify(metadata), /sign|submit|execute|wallet/i);
});

test("OAuth challenge is inert while disabled and advertises exact PRM only while enabled", () => {
  assert.doesNotMatch(agentOAuthBearerChallenge({ env: {} }), /resource_metadata/);
  const challenge = agentOAuthBearerChallenge({ env: oauthEnv, error: "invalid_token" });
  assert.match(challenge, /error="invalid_token"/);
  assert.match(challenge, /^Bearer realm=/);
  assert.doesNotMatch(challenge, /^Bearer,/);
  assert.match(challenge, /resource_metadata="https:\/\/carmelita-agent\.vercel\.app\/\.well-known\/oauth-protected-resource"/);
  assert.doesNotMatch(challenge, /[\r\n]/);
});

test("Stytch JWT verification pins RS256 issuer, audience, expiry and scopes", async () => {
  const config = readStytchOAuthResourceConfig(oauthEnv);
  const valid = await tokenWithKey();
  assert.deepEqual(await verifyStytchOAuthJwt(valid.token, config, valid.publicKey), {
    issuer: config.issuer,
    subject: "user-test-stytch-subject",
    audiences: ["carmelita-test-client"],
    scopes: ["agent:read", "agent:plan"],
  });

  const wrongIssuer = await tokenWithKey({ issuer: "https://attacker.example" });
  await assert.rejects(verifyStytchOAuthJwt(wrongIssuer.token, config, wrongIssuer.publicKey));
  const wrongAudience = await tokenWithKey({ audience: "https://attacker.example/mcp" });
  await assert.rejects(verifyStytchOAuthJwt(wrongAudience.token, config, wrongAudience.publicKey));
  const hs256 = await signedToken({ algorithm: "HS256" });
  await assert.rejects(verifyStytchOAuthJwt(hs256, config, new TextEncoder().encode("01234567890123456789012345678901")));
});

test("claim validation rejects unknown agent authority and tokens without Carmelita scopes", () => {
  const config = readStytchOAuthResourceConfig(oauthEnv);
  const base = {
    iss: config.issuer,
    sub: "user-test-stytch-subject",
    aud: config.expectedAudience,
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  assert.throws(() => validateStytchOAuthClaims({ ...base, scope: "agent:sign" }, config), /scope_invalid/);
  assert.throws(() => validateStytchOAuthClaims({ ...base, scope: "openid offline_access" }, config), /scope_required/);
  assert.throws(() => validateStytchOAuthClaims({ ...base, scope: "agent:read", exp: 1 }, config), /token_expired/);
  assert.throws(() => validateStytchOAuthClaims({ ...base, aud: undefined, scope: "agent:read" }, config), /audience_invalid/);
});

test("dynamic Stytch client audiences are accepted only when non-empty unless strict audience mode is configured", () => {
  const config = readStytchOAuthResourceConfig({
    ...oauthEnv,
    STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE: "",
  });
  const payload = {
    iss: config.issuer,
    sub: "user-test-stytch-subject",
    aud: "dcr-client-id-123",
    exp: Math.floor(Date.now() / 1000) + 300,
    scope: "agent:read",
  };
  assert.deepEqual(validateStytchOAuthClaims(payload, config).audiences, ["dcr-client-id-123"]);
  assert.throws(() => validateStytchOAuthClaims({ ...payload, aud: [] }, config), /audience_invalid/);
});

test("OAuth identity mapping is exact issuer plus subject and cannot be remapped by email", async () => {
  assert.equal(normalizeOAuthIssuer("https://AUTH.example.com/"), "https://auth.example.com");
  assert.throws(() => normalizeOAuthIssuer("http://auth.example.com"), /issuer_invalid/);
  assert.throws(() => normalizeOAuthIssuer("https://auth.example.com?next=x"), /issuer_invalid/);
  assert.deepEqual(validateOAuthSubjectLink({
    issuer: "https://auth.example.com",
    subject: "stytch-user-1",
    privyDid: "did:privy:user-1",
  }), {
    issuer: "https://auth.example.com",
    subject: "stytch-user-1",
    privyDid: "did:privy:user-1",
  });
  assert.throws(() => assertOAuthSubjectOwnership("did:privy:user-1", "did:privy:user-2"), /link_conflict/);

  const store = await readFile(new URL("../app/services/oauth-subject-link-store.ts", import.meta.url), "utf8");
  const authorize = await readFile(new URL("../app/api/oauth/stytch/authorize/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /email/i);
  assert.match(authorize, /if \(body\.consentGranted\) \{[\s\S]*linkOAuthSubject/);
  assert.ok(authorize.indexOf("linkOAuthSubject") < authorize.indexOf("submitAuthorization"));
});

test("PAT and Privy fallbacks remain separate from the Stytch issuer path", async () => {
  const auth = await readFile(new URL("../app/mcp/auth.ts", import.meta.url), "utf8");
  const pat = auth.indexOf("token.startsWith(PERSONAL_MCP_TOKEN_PREFIX)");
  const stytch = auth.indexOf("looksLikeStytchOAuthToken(token)");
  const privy = auth.indexOf("verifyPrivyAccessToken(token)");
  assert.ok(pat >= 0 && stytch > pat && privy > stytch);
  assert.doesNotMatch(auth, /agent:sign|agent:execute|agent:submit/);
});

test("public-client introspection rejects a revoked unexpired JWT and checks again after reconnection", async () => {
  const config = readStytchOAuthResourceConfig(oauthEnv);
  const old = await tokenWithKey({ scope: "agent:context" });
  const fresh = await tokenWithKey({ scope: "agent:context" });
  let revoked = false;
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${config.issuer}/v1/oauth2/introspect`);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const form = new URLSearchParams(String(init?.body));
    assert.equal(form.get("client_id"), "carmelita-test-client");
    assert.equal(form.get("token_type_hint"), "access_token");
    assert.equal(form.has("client_secret"), false);
    const token = form.get("token")!;
    return Response.json(revoked && token === old.token ? { active: false } : {
      ...decodeJwt(token), active: true, client_id: "carmelita-test-client", token_type: "access_token",
    });
  };
  const claims = await verifyStytchOAuthJwt(old.token, config, old.publicKey);
  await assertStytchOAuthTokenActive(old.token, claims, config, fetcher);
  revoked = true;
  // Its signature and expiry still pass; only live introspection sees revocation.
  await verifyStytchOAuthJwt(old.token, config, old.publicKey);
  await assert.rejects(assertStytchOAuthTokenActive(old.token, claims, config, fetcher), /inactive_or_unavailable/);
  await assertStytchOAuthTokenActive(fresh.token, await verifyStytchOAuthJwt(fresh.token, config, fresh.publicKey), config, fetcher);
  await assert.rejects(assertStytchOAuthTokenActive(old.token, claims, config, fetcher), /inactive_or_unavailable/);
  assert.equal(calls, 4);
});

test("introspection fails closed on provider failures, malformed data and mismatched identity without exposing input", async () => {
  const config = readStytchOAuthResourceConfig(oauthEnv);
  const signed = await tokenWithKey({ scope: "agent:context" });
  const claims = await verifyStytchOAuthJwt(signed.token, config, signed.publicKey);
  const active = { ...decodeJwt(signed.token), active: true, client_id: "carmelita-test-client", token_type: "access_token" };
  const failures: Array<typeof fetch> = [
    async () => { throw new Error(`timeout ${signed.token}`); },
    async () => new Response(signed.token, { status: 503 }),
    async () => new Response("invalid JSON"),
    ...[null, [], { ...active, active: "true" }, { ...active, sub: "other-user" },
      { ...active, iss: "https://other.example" }, { ...active, scope: "agent:plan" },
      { ...active, aud: "other-client" }, { ...active, client_id: "other-client" },
      { ...active, token_type: "refresh_token" }, { ...active, exp: 1 }].map((body) => async () => Response.json(body)),
  ];
  for (const fetcher of failures) {
    await assert.rejects(assertStytchOAuthTokenActive(signed.token, claims, config, fetcher), {
      message: "stytch_oauth_token_inactive_or_unavailable",
    });
  }
});

test("introspection accepts additional audiences only with one identifiable Connected App client", async () => {
  const config = readStytchOAuthResourceConfig({ ...oauthEnv, STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE: "" });
  const { privateKey } = await generateKeyPair("RS256");
  const token = await new SignJWT({ scope: "agent:context" }).setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.issuer).setSubject("user-test-1")
    .setAudience(["https://resource.example", "connected-app-test-one"]).setExpirationTime("5m").sign(privateKey);
  const claims = validateStytchOAuthClaims(decodeJwt(token), config);
  await assertStytchOAuthTokenActive(token, claims, config, async (_url, init) => {
    assert.equal(new URLSearchParams(String(init?.body)).get("client_id"), "connected-app-test-one");
    return Response.json({ ...decodeJwt(token), active: true, client_id: "connected-app-test-one", token_type: "access_token" });
  });
  await assert.rejects(assertStytchOAuthTokenActive(token, { ...claims, audiences: ["resource-1", "resource-2"] }, config,
    async () => { assert.fail("ambiguous client must not submit a token"); }), /inactive_or_unavailable/);
});
