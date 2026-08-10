import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isGatewayRateLimitError } from "@/app/agent-gateway/operations";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { verifyServiceProviderToken } from "@/app/services/provider-store";
import { PERSONAL_MCP_TOKEN_PREFIX, verifyPersonalMcpToken } from "@/app/services/personal-mcp-token-store";

type McpRequest = Request & { auth?: AuthInfo };

export function publicMcpErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "mcp_request_failed";
  const code = error.message.split(":", 1)[0]?.trim() ?? "";
  return /^[a-z][a-z0-9_]{2,80}$/.test(code)
    ? code
    : "mcp_request_failed";
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token?.trim() ?? "" : "";
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "invalid_or_missing_bearer_token" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Bearer realm="agent-assistant-mcp"',
    },
  });
}
function authenticationFailure(error: unknown) {
  if (isGatewayRateLimitError(error)) {
    return new Response(JSON.stringify({ error: "gateway_rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(error.retryAfterSeconds) },
    });
  }
  if (error instanceof Error && (error.message === "gateway_rate_limit_unavailable" || error.message === "database_not_configured")) {
    return new Response(JSON.stringify({ error: "gateway_rate_limit_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return unauthorized();
}


export async function authenticateMcp(
  request: Request,
  verify: (token: string) => Promise<AuthInfo>,
  handler: (request: Request) => Promise<Response>,
) {
  const token = bearerToken(request);
  if (!token) return unauthorized();
  try {
    const authInfo = await verify(token);
    (request as McpRequest).auth = authInfo;
    return handler(request);
  } catch (error) {
    return authenticationFailure(error);
  }
}

export async function verifyAgentMcpToken(token: string): Promise<AuthInfo> {
  if (token.startsWith(PERSONAL_MCP_TOKEN_PREFIX)) {
    const principal = await verifyPersonalMcpToken(token);
    return { token, clientId: principal.userId, scopes: principal.scopes,
      expiresAt: principal.expiresAt ? Math.floor(principal.expiresAt.getTime() / 1000) : undefined,
      extra: { subjectType: "user", userId: principal.userId, tokenId: principal.tokenId } };
  }
  const claims = await verifyPrivyAccessToken(token);
  return {
    token,
    clientId: claims.user_id,
    scopes: ["agent:read", "agent:plan", "agent:context", "agent:conversation"],
    extra: { subjectType: "user", userId: claims.user_id },
  };
}

export async function verifyAgentUserToken(token: string, requiredScope?: string) {
  const authInfo = await verifyAgentMcpToken(token);
  const userId = requireMcpSubject(
    authInfo,
    "user",
    "userId",
    requiredScope,
  );
  return { userId, scopes: authInfo.scopes, expiresAt: authInfo.expiresAt };
}

export async function verifyProviderMcpToken(token: string): Promise<AuthInfo> {
  const principal = await verifyServiceProviderToken(token);
  return {
    token,
    clientId: principal.provider.id,
    scopes: principal.scopes,
    expiresAt: principal.expiresAt
      ? Math.floor(principal.expiresAt.getTime() / 1000)
      : undefined,
    extra: {
      subjectType: "provider",
      providerId: principal.provider.id,
      providerSlug: principal.provider.slug,
    },
  };
}

export function requireMcpSubject(
  authInfo: AuthInfo | undefined,
  subjectType: "user" | "provider",
  key: "userId" | "providerId",
  requiredScope?: string,
) {
  if (!authInfo || authInfo.extra?.subjectType !== subjectType) {
    throw new Error("mcp_principal_required");
  }
  if (requiredScope && !authInfo.scopes.includes(requiredScope)) {
    throw new Error("mcp_scope_required:" + requiredScope);
  }
  const value = authInfo.extra?.[key];
  if (typeof value !== "string" || !value) {
    throw new Error("mcp_principal_invalid");
  }
  return value;
}
