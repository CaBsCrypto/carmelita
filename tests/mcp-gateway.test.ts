import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { requireMcpSubject } from "@/app/mcp/auth";
import {
  createRawProviderToken,
  hashMcpToken,
  mcpTokenPrefix,
} from "@/app/services/provider-store";

test("provider MCP tokens have an identifiable prefix and stable hash", () => {
  const token = createRawProviderToken();
  assert.match(token, /^aap_provider_[A-Za-z0-9_-]+$/);
  assert.equal(hashMcpToken(token), hashMcpToken(token));
  assert.notEqual(hashMcpToken(token), token);
  assert.equal(mcpTokenPrefix(token), token.slice(0, 18));
});

test("MCP principals are isolated by subject type and scope", () => {
  const provider: AuthInfo = {
    token: "hidden",
    clientId: "sp_test",
    scopes: ["provider:read"],
    extra: { subjectType: "provider", providerId: "sp_test" },
  };
  assert.equal(
    requireMcpSubject(provider, "provider", "providerId", "provider:read"),
    "sp_test",
  );
  assert.throws(
    () =>
      requireMcpSubject(
        provider,
        "provider",
        "providerId",
        "provider:offers:write",
      ),
    /mcp_scope_required/,
  );
  assert.throws(
    () => requireMcpSubject(provider, "user", "userId", "agent:read"),
    /mcp_principal_required/,
  );
});

test("personal agent MCP requires a user principal", () => {
  const user: AuthInfo = {
    token: "hidden",
    clientId: "did:privy:user",
    scopes: ["agent:read", "agent:plan"],
    extra: { subjectType: "user", userId: "did:privy:user" },
  };
  assert.equal(
    requireMcpSubject(user, "user", "userId", "agent:plan"),
    "did:privy:user",
  );
});

test("provider MCP handler listens on its actual Next.js route", async () => {
  const route = await readFile(new URL("../app/api/mcp/provider/route.ts", import.meta.url), "utf8");
  assert.match(route, /streamableHttpEndpoint: "\/api\/mcp\/provider"/);
  assert.doesNotMatch(route, /basePath: "\/api\/mcp"/);
});
