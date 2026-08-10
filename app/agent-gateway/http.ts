import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isGatewayRateLimitError } from "@/app/agent-gateway/operations";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import {
  PERSONAL_MCP_TOKEN_PREFIX,
  verifyPersonalMcpToken,
  type PersonalMcpScope,
} from "@/app/services/personal-mcp-token-store";

export function gatewayHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Carmelita-Environment": "testnet",
    "X-Carmelita-Non-Custodial": "true",
  };
}

export async function gatewayActor(
  request: Request,
  requiredScope: PersonalMcpScope,
  audit?: { identify(identity: { actorId?: string; tokenId?: string }): void },
) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    throw new Error("gateway_auth_required");
  }
  const rawToken = token.trim();
  if (rawToken.startsWith(PERSONAL_MCP_TOKEN_PREFIX)) {
    const principal = await verifyPersonalMcpToken(rawToken);
    audit?.identify({ actorId: principal.userId, tokenId: principal.tokenId });
    if (!principal.scopes.includes(requiredScope)) throw new Error("gateway_scope_required");
    return principal.userId;
  }
  const claims = await verifyPrivyAccessToken(rawToken);
  audit?.identify({ actorId: claims.user_id });
  return claims.user_id;
}

export function gatewayError(error: unknown) {
  const code = error instanceof ZodError
    ? "invalid_gateway_request"
    : error instanceof Error
      ? error.message.split(":")[0]
      : "gateway_request_failed";
  const status = isGatewayRateLimitError(error)
    ? 429
    : code === "gateway_rate_limit_unavailable" || code === "database_not_configured"
      ? 503
      : code === "gateway_auth_required" || code.startsWith("privy_") || code === "personal_mcp_token_invalid"
    ? 401
    : code === "gateway_scope_required"
      ? 403
      : code.endsWith("_not_found")
        ? 404
        : code === "gateway_idempotency_conflict"
          ? 409
          : code === "invalid_gateway_request" || code === "gateway_parameters_too_large" || code === "gateway_network_override_rejected"
            ? 400
            : 500;
  return NextResponse.json({ error: code }, {
    status,
    headers: {
      ...gatewayHeaders(),
      ...(status === 401
        ? { "WWW-Authenticate": 'Bearer realm="carmelita-agent-gateway"' }
        : status === 429 && isGatewayRateLimitError(error)
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : {}),
    },
  });
}