import type { JWTPayload } from "jose";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { resolveOAuthSubject } from "@/app/services/oauth-subject-link-store";

export const STYTCH_AGENT_SCOPES = [
  "agent:read",
  "agent:plan",
  "agent:context",
  "agent:conversation",
] as const;
export type StytchAgentScope = (typeof STYTCH_AGENT_SCOPES)[number];

export type StytchOAuthResourceConfig = {
  issuer: string;
  expectedAudience?: string;
  resource: string;
  metadataUrl: string;
  jwksUrl: string;
};

type RuntimeEnv = Readonly<Record<string, string | undefined>>;
type JwtVerificationKey = CryptoKey | Uint8Array | ReturnType<typeof createRemoteJWKSet>;
const remoteJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function exactHttpsOrigin(value: string, label: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) throw new Error(`stytch_oauth_config_invalid_${label}`);
  return url.origin;
}

function exactHttpsResource(value: string, origin: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/mcp/agent"
  ) throw new Error("stytch_oauth_config_invalid_resource");
  return url.toString();
}

export function stytchOAuthResourceServerEnabled(env: RuntimeEnv = process.env) {
  return env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED?.trim().toLowerCase() === "true";
}

export function readStytchOAuthResourceConfig(
  env: RuntimeEnv = process.env,
): StytchOAuthResourceConfig {
  if (!stytchOAuthResourceServerEnabled(env)) throw new Error("stytch_oauth_resource_server_disabled");
  const publicOriginValue = env.CARMELITA_PUBLIC_ORIGIN?.trim();
  const issuerValue = env.STYTCH_PROJECT_DOMAIN?.trim();
  if (!publicOriginValue) throw new Error("stytch_oauth_config_missing_public_origin");
  if (!issuerValue) throw new Error("stytch_oauth_config_missing_project_domain");
  const publicOrigin = exactHttpsOrigin(publicOriginValue, "public_origin");
  const issuer = exactHttpsOrigin(issuerValue, "issuer");
  const resource = exactHttpsResource(`${publicOrigin}/api/mcp/agent`, publicOrigin);
  const expectedAudience = env.STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE?.trim() || undefined;
  return {
    issuer,
    expectedAudience,
    resource,
    metadataUrl: `${publicOrigin}/.well-known/oauth-protected-resource`,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
  };
}

export function stytchProtectedResourceMetadata(env: RuntimeEnv = process.env) {
  const config = readStytchOAuthResourceConfig(env);
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [...STYTCH_AGENT_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

function quoteChallenge(value: string) {
  return `"${value.replace(/["\\\r\n]/g, "")}"`;
}

export function agentOAuthBearerChallenge(input: {
  env?: RuntimeEnv;
  error?: "invalid_token" | "insufficient_scope";
  requiredScope?: StytchAgentScope;
} = {}) {
  const env = input.env ?? process.env;
  const fields = [`realm=${quoteChallenge("agent-assistant-mcp")}`];
  if (!stytchOAuthResourceServerEnabled(env)) return `Bearer ${fields.join(", ")}`;
  try {
    const config = readStytchOAuthResourceConfig(env);
    if (input.error) fields.push(`error=${quoteChallenge(input.error)}`);
    if (input.requiredScope) fields.push(`scope=${quoteChallenge(input.requiredScope)}`);
    fields.push(`resource_metadata=${quoteChallenge(config.metadataUrl)}`);
  } catch {
    // Authentication must still fail closed when OAuth is enabled but misconfigured.
  }
  return `Bearer ${fields.join(", ")}`;
}

function tokenAudiences(audience: JWTPayload["aud"]) {
  const values = typeof audience === "string" ? [audience] : Array.isArray(audience) ? audience : [];
  if (!values.length || values.some((value) => !value.trim())) throw new Error("stytch_oauth_audience_invalid");
  return [...new Set(values)];
}

export function validateStytchOAuthClaims(
  payload: JWTPayload,
  config: StytchOAuthResourceConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (payload.iss !== config.issuer) throw new Error("stytch_oauth_issuer_invalid");
  const audiences = tokenAudiences(payload.aud);
  if (config.expectedAudience && !audiences.includes(config.expectedAudience)) {
    throw new Error("stytch_oauth_audience_invalid");
  }
  if (typeof payload.sub !== "string" || !payload.sub.trim() || payload.sub.length > 512) {
    throw new Error("stytch_oauth_subject_invalid");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new Error("stytch_oauth_token_expired");
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 5) throw new Error("stytch_oauth_token_not_active");
  if (typeof payload.scope !== "string") throw new Error("stytch_oauth_scope_invalid");
  const granted = [...new Set(payload.scope.split(/\s+/).filter(Boolean))];
  const unknownAgentScope = granted.find(
    (scope) => scope.startsWith("agent:") && !STYTCH_AGENT_SCOPES.includes(scope as StytchAgentScope),
  );
  if (unknownAgentScope) throw new Error("stytch_oauth_scope_invalid");
  const scopes = granted.filter((scope): scope is StytchAgentScope =>
    STYTCH_AGENT_SCOPES.includes(scope as StytchAgentScope));
  if (!scopes.length) throw new Error("stytch_oauth_scope_required");
  if (typeof payload.client_id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.client_id)) {
    throw new Error("stytch_oauth_client_invalid");
  }
  return { issuer: config.issuer, subject: payload.sub, audiences, scopes, clientId: payload.client_id };
}

function jwksFor(url: string) {
  let value = remoteJwks.get(url);
  if (!value) {
    value = createRemoteJWKSet(new URL(url), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
    remoteJwks.set(url, value);
  }
  return value;
}

export async function verifyStytchOAuthJwt(
  token: string,
  config: StytchOAuthResourceConfig,
  key: JwtVerificationKey = jwksFor(config.jwksUrl),
) {
  const options = {
    algorithms: ["RS256"],
    issuer: config.issuer,
    ...(config.expectedAudience ? { audience: config.expectedAudience } : {}),
    clockTolerance: 5,
  };
  const { payload } = typeof key === "function"
    ? await jwtVerify(token, key, options)
    : await jwtVerify(token, key, options);
  return validateStytchOAuthClaims(payload, config);
}

export function looksLikeStytchOAuthToken(
  token: string,
  env: RuntimeEnv = process.env,
) {
  if (!stytchOAuthResourceServerEnabled(env)) return false;
  try {
    return decodeJwt(token).iss === readStytchOAuthResourceConfig(env).issuer;
  } catch {
    return false;
  }
}

export async function verifyStytchOAuthAccessToken(
  token: string,
  env: RuntimeEnv = process.env,
) {
  let stage = "configuration";
  try {
    const config = readStytchOAuthResourceConfig(env);
    stage = "jwt";
    const claims = await verifyStytchOAuthJwt(token, config);
    stage = "introspection";
    await assertStytchOAuthTokenActive(token, claims, config);
    stage = "subject_link";
    const privyDid = await resolveOAuthSubject({
      issuer: claims.issuer,
      subject: claims.subject,
    });
    if (!privyDid) throw new Error("stytch_oauth_subject_unlinked");
    return {
      userId: privyDid,
      scopes: claims.scopes,
      expiresAt: decodeJwt(token).exp,
      issuer: claims.issuer,
      subject: claims.subject,
      audiences: claims.audiences,
      clientId: claims.clientId,
    };
  } catch (error) {
    console.warn("oauth_verification_rejected", { stage, reason: safeOAuthDiagnostic(error) });
    throw new Error("stytch_oauth_token_invalid");
  }
}

// Closed vocabulary only: never log exceptions, claims, identifiers or tokens.
export function safeOAuthDiagnostic(error: unknown) {
  const allowed = new Set([
    "ERR_JWT_EXPIRED", "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    "ERR_JWKS_NO_MATCHING_KEY", "ERR_JWKS_TIMEOUT",
    "stytch_oauth_issuer_invalid", "stytch_oauth_audience_invalid", "stytch_oauth_subject_invalid",
    "stytch_oauth_token_expired", "stytch_oauth_token_not_active", "stytch_oauth_scope_invalid",
    "stytch_oauth_scope_required", "stytch_oauth_subject_unlinked",
    "stytch_oauth_token_inactive_or_unavailable",
  ]);
  if (!(error instanceof Error)) return "unclassified";
  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && allowed.has(code)) return code;
  return allowed.has(error.message) ? error.message : "unclassified";
}

// Public Connected Apps use client_id without a client secret (RFC 7662).
// Check every request: local JWT validation alone cannot observe revocation.
export async function assertStytchOAuthTokenActive(
  token: string,
  claims: ReturnType<typeof validateStytchOAuthClaims>,
  config: StytchOAuthResourceConfig,
  fetcher: typeof fetch = fetch,
) {
  try {
    // aud identifies the resource; the verified client_id identifies its OAuth client.
    const clientId = claims.clientId;
    if (!clientId) throw new Error();
    const response = await fetcher(`${config.issuer}/v1/oauth2/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, token_type_hint: "access_token", client_id: clientId }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error();
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    const result = body as JWTPayload & { active?: unknown; client_id?: unknown; token_type?: unknown };
    if (result.active !== true || result.client_id !== clientId || result.token_type !== "access_token") throw new Error();
    // Stytch introspection identifies the client in aud, while a resource-bound
    // signed JWT identifies the MCP resource. Validate each in its own context.
    const current = validateStytchOAuthClaims(result, { ...config, expectedAudience: undefined });
    const sameAudience = current.audiences.length === claims.audiences.length &&
      current.audiences.every((audience) => claims.audiences.includes(audience));
    const clientAudience = current.audiences.length === 1 && current.audiences[0] === clientId;
    if (current.subject !== claims.subject ||
      (!sameAudience && !clientAudience) ||
      current.scopes.length !== claims.scopes.length ||
      current.scopes.some((scope) => !claims.scopes.includes(scope))) throw new Error();
    // Both expirations must independently be valid. Introspection must never
    // extend the lifetime already enforced by JWT signature/expiry validation.
    const signedExpiry = decodeJwt(token).exp;
    if (typeof signedExpiry !== "number" || signedExpiry <= Math.floor(Date.now() / 1000)) throw new Error();
  } catch {
    // Never surface a provider body, submitted token, or fetch exception.
    throw new Error("stytch_oauth_token_inactive_or_unavailable");
  }
}

export function stytchPrincipalAuthInfo(
  token: string,
  principal: Awaited<ReturnType<typeof verifyStytchOAuthAccessToken>>,
): AuthInfo {
  return {
    token,
    clientId: principal.clientId,
    scopes: principal.scopes,
    expiresAt: principal.expiresAt,
    extra: {
      subjectType: "user",
      userId: principal.userId,
      oauthIssuer: principal.issuer,
      oauthSubject: principal.subject,
    },
  };
}
