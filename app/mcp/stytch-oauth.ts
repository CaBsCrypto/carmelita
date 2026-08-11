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
  return { issuer: config.issuer, subject: payload.sub, audiences, scopes };
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
  try {
    const config = readStytchOAuthResourceConfig(env);
    const claims = await verifyStytchOAuthJwt(token, config);
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
    };
  } catch {
    throw new Error("stytch_oauth_token_invalid");
  }
}

export function stytchPrincipalAuthInfo(
  token: string,
  principal: Awaited<ReturnType<typeof verifyStytchOAuthAccessToken>>,
): AuthInfo {
  return {
    token,
    clientId: principal.audiences[0] ?? `stytch:${principal.subject}`,
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