import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentGatewayAuditEvents, agentGatewayRateLimits } from "@/db/schema";

export const PERSONAL_PAT_USAGE_LIMIT = 60;
export const PERSONAL_PAT_USAGE_WINDOW_SECONDS = 60;
export const PERSONAL_PAT_CREATION_LIMIT = 5;
export const PERSONAL_PAT_CREATION_WINDOW_SECONDS = 60 * 60;

export type GatewayRateLimitScope = "personal_pat_usage" | "personal_pat_creation";

export class GatewayRateLimitError extends Error {
  readonly code = "gateway_rate_limited";
  constructor(readonly retryAfterSeconds: number) {
    super("gateway_rate_limited");
  }
}

export function isGatewayRateLimitError(error: unknown): error is GatewayRateLimitError {
  return error instanceof GatewayRateLimitError;
}

export function gatewayPseudonym(kind: "actor" | "token", value: string) {
  return createHash("sha256")
    .update(`carmelita-agent-gateway-v1\0${kind}\0${value}`)
    .digest("hex");
}

export function fixedWindow(nowMs: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const startedAtMs = Math.floor(nowMs / windowMs) * windowMs;
  const endsAtMs = startedAtMs + windowMs;
  return {
    startedAt: new Date(startedAtMs),
    endsAt: new Date(endsAtMs),
    retryAfterSeconds: Math.max(1, Math.ceil((endsAtMs - nowMs) / 1000)),
  };
}

export async function consumeGatewayRateLimit(input: {
  scope: GatewayRateLimitScope;
  subjectPseudonym: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const window = fixedWindow(now.getTime(), input.windowSeconds);
  const key = `${input.scope}:${input.subjectPseudonym}:${window.startedAt.getTime()}`;
  try {
    const [bucket] = await getDb().insert(agentGatewayRateLimits).values({
      key,
      scope: input.scope,
      subjectPseudonym: input.subjectPseudonym,
      windowStartedAt: window.startedAt,
      windowEndsAt: window.endsAt,
      requestCount: 1,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: agentGatewayRateLimits.key,
      set: {
        requestCount: sql`${agentGatewayRateLimits.requestCount} + 1`,
        updatedAt: now,
      },
    }).returning({ requestCount: agentGatewayRateLimits.requestCount });
    if (!bucket) throw new Error("gateway_rate_limit_unavailable");
    if (bucket.requestCount > input.limit) {
      throw new GatewayRateLimitError(window.retryAfterSeconds);
    }
    return { remaining: input.limit - bucket.requestCount, ...window };
  } catch (error) {
    if (isGatewayRateLimitError(error)) throw error;
    throw new Error("gateway_rate_limit_unavailable");
  }
}

export async function limitPersonalPatUsage(tokenId: string, now?: Date) {
  return consumeGatewayRateLimit({
    scope: "personal_pat_usage",
    subjectPseudonym: gatewayPseudonym("token", tokenId),
    limit: PERSONAL_PAT_USAGE_LIMIT,
    windowSeconds: PERSONAL_PAT_USAGE_WINDOW_SECONDS,
    now,
  });
}

export async function limitPersonalPatCreation(userId: string, now?: Date) {
  return consumeGatewayRateLimit({
    scope: "personal_pat_creation",
    subjectPseudonym: gatewayPseudonym("actor", userId),
    limit: PERSONAL_PAT_CREATION_LIMIT,
    windowSeconds: PERSONAL_PAT_CREATION_WINDOW_SECONDS,
    now,
  });
}

type GatewayAuditIdentity = { actorId?: string; tokenId?: string };

function requestId(request: Request) {
  const candidate = request.headers.get("x-request-id")?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(candidate) ? candidate : randomUUID();
}

function auditOutcome(status: number) {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "success";
}

export function createGatewayAudit(request: Request, route: string) {
  const id = requestId(request);
  const startedAt = Date.now();
  let identity: GatewayAuditIdentity = {};
  return {
    requestId: id,
    identify(next: GatewayAuditIdentity) { identity = next; },
    async complete(response: Response, tool?: string) {
      const latencyMs = Math.max(0, Date.now() - startedAt);
      try {
        await getDb().insert(agentGatewayAuditEvents).values({
          id: "gwa_" + randomUUID(),
          requestId: id,
          actorPseudonym: identity.actorId ? gatewayPseudonym("actor", identity.actorId) : null,
          tokenPseudonym: identity.tokenId ? gatewayPseudonym("token", identity.tokenId) : null,
          route,
          tool: tool?.slice(0, 120) || null,
          outcome: auditOutcome(response.status),
          status: response.status,
          latencyMs,
        });
      } catch {
        console.error("gateway_audit_write_failed");
      }
      const headers = new Headers(response.headers);
      headers.set("X-Request-ID", id);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}
