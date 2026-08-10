import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fixedWindow,
  GatewayRateLimitError,
  gatewayPseudonym,
  PERSONAL_PAT_CREATION_LIMIT,
  PERSONAL_PAT_CREATION_WINDOW_SECONDS,
  PERSONAL_PAT_USAGE_LIMIT,
  PERSONAL_PAT_USAGE_WINDOW_SECONDS,
} from "../app/agent-gateway/operations";
import { gatewayError } from "../app/agent-gateway/http";

test("Gateway PAT limits use stable fixed windows", () => {
  assert.equal(PERSONAL_PAT_USAGE_LIMIT, 60);
  assert.equal(PERSONAL_PAT_USAGE_WINDOW_SECONDS, 60);
  assert.equal(PERSONAL_PAT_CREATION_LIMIT, 5);
  assert.equal(PERSONAL_PAT_CREATION_WINDOW_SECONDS, 3600);
  const first = fixedWindow(Date.UTC(2026, 7, 10, 12, 0, 10), 60);
  const second = fixedWindow(Date.UTC(2026, 7, 10, 12, 0, 45), 60);
  assert.equal(first.startedAt.toISOString(), second.startedAt.toISOString());
  assert.equal(first.endsAt.toISOString(), second.endsAt.toISOString());
  assert.equal(first.retryAfterSeconds, 50);
  assert.equal(second.retryAfterSeconds, 15);
});

test("Gateway identities are pseudonymized with domain separation", () => {
  const raw = "did:privy:known-user";
  const actor = gatewayPseudonym("actor", raw);
  const token = gatewayPseudonym("token", raw);
  assert.match(actor, /^[a-f0-9]{64}$/);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(actor, token);
  assert.equal(actor.includes(raw), false);
});

test("Gateway rate errors return stable 429 and Retry-After", () => {
  const limited = gatewayError(new GatewayRateLimitError(37));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "37");
  const unavailable = gatewayError(new Error("gateway_rate_limit_unavailable"));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Retry-After"), null);
});

test("Gateway limiter is distributed and audit schema excludes sensitive payloads", async () => {
  const operations = await readFile(new URL("../app/agent-gateway/operations.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0017_gateway_limits_audit.sql", import.meta.url), "utf8");
  assert.match(operations, /onConflictDoUpdate/);
  assert.match(operations, /requestCount: sql`\$\{agentGatewayRateLimits\.requestCount\} \+ 1`/);
  assert.doesNotMatch(operations, /new Map|setInterval|conversation|wallet|authorization/i);
  for (const forbidden of ["payload", "body", "bearer", "conversation", "wallet", "raw_error"]) {
    assert.equal(migration.toLowerCase().includes(forbidden), false);
  }
  for (const required of ["request_id", "actor_pseudonym", "token_pseudonym", "route", "tool", "outcome", "status", "latency_ms", "created_at"]) {
    assert.equal(migration.includes(required), true, `migration missing ${required}`);
  }
});

test("Gateway surfaces apply endpoint audit and PAT verification limiting", async () => {
  const files = await Promise.all([
    "../app/api/v1/capabilities/route.ts",
    "../app/api/v1/actions/plan/route.ts",
    "../app/api/v1/actions/[id]/route.ts",
    "../app/api/v1/receipts/[id]/route.ts",
    "../app/api/mcp/agent/route.ts",
    "../app/api/agent/mcp-tokens/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) assert.match(source, /createGatewayAudit/);
  const tokenStore = await readFile(new URL("../app/services/personal-mcp-token-store.ts", import.meta.url), "utf8");
  assert.match(tokenStore, /limitPersonalPatUsage\(record\.id\)/);
  const mcp = files[4];
  assert.match(mcp, /Endpoint\/outcome audit is the safe minimum/);
  assert.doesNotMatch(mcp, /onEvent/);
});
