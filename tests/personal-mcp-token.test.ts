import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRawPersonalMcpToken, hashPersonalMcpToken, PERSONAL_MCP_SCOPES, PERSONAL_MCP_TOKEN_PREFIX, personalMcpTokenPrefix, validatePersonalMcpScopes } from "@/app/services/personal-mcp-token-store";

test("personal MCP credentials use a recognizable high-entropy prefix and SHA-256 hash", () => {
  const first = createRawPersonalMcpToken(); const second = createRawPersonalMcpToken();
  assert.match(first, /^carmelita_user_[A-Za-z0-9_-]{43}$/); assert.notEqual(first, second);
  assert.equal(PERSONAL_MCP_TOKEN_PREFIX, "carmelita_user_");
  assert.equal(hashPersonalMcpToken(first).length, 64); assert.notEqual(hashPersonalMcpToken(first), first);
  assert.ok(first.startsWith(personalMcpTokenPrefix(first)));
});
test("personal MCP scopes are allowlisted and deduplicated", () => {
  assert.deepEqual(validatePersonalMcpScopes(), ["agent:read"]);
  assert.deepEqual(validatePersonalMcpScopes(["agent:read", "agent:read", "agent:plan", "agent:context", "agent:conversation"]), ["agent:read", "agent:plan", "agent:context", "agent:conversation"]);
  assert.throws(() => validatePersonalMcpScopes(["agent:chat"]), /personal_mcp_scope_invalid/);
  assert.throws(() => validatePersonalMcpScopes(["wallet:secret:read"]), /personal_mcp_scope_invalid/);
  assert.deepEqual(PERSONAL_MCP_SCOPES, ["agent:read", "agent:plan", "agent:context", "agent:conversation"]);
});
test("personal MCP token API is Privy authenticated, same-origin and no-store", async () => {
  const collection = await readFile(new URL("../app/api/agent/mcp-tokens/route.ts", import.meta.url), "utf8");
  const member = await readFile(new URL("../app/api/agent/mcp-tokens/[tokenId]/route.ts", import.meta.url), "utf8");
  for (const source of [collection, member]) {
    assert.match(source, /verifyPrivyAccessToken/); assert.match(source, /sameOrigin/);
    assert.match(source, /"Cache-Control": "no-store"/);
  }
  assert.match(collection, /issuePersonalMcpToken/); assert.match(collection, /listPersonalMcpTokens/);
  assert.match(member, /revokePersonalMcpToken/);
});
test("personal MCP storage never exposes token hashes as metadata", async () => {
  const source = await readFile(new URL("../app/services/personal-mcp-token-store.ts", import.meta.url), "utf8");
  const projection = source.slice(source.indexOf("function publicTokenMetadata"), source.indexOf("export async function issuePersonalMcpToken"));
  assert.doesNotMatch(projection, /tokenHash/); assert.match(source, /lastUsedAt: usedAt/);
  assert.match(source, /status: "revoked"/); assert.match(source, /subjectType: "user"/);
});
test("agent MCP auth accepts personal credentials without weakening provider auth", async () => {
  const source = await readFile(new URL("../app/mcp/auth.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPersonalMcpToken/); assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /verifyServiceProviderToken/); assert.match(source, /subjectType: "provider"/);
});

test("personal MCP config follows the current deployment origin", async () => {
  const source = await readFile(new URL("../app/agent/agent-external-access.tsx", import.meta.url), "utf8");
  assert.match(source, /window\.location\.origin/);
  assert.doesNotMatch(source, /https:\/\/agente-asistente\.vercel\.app\/api\/mcp\/agent/);
});

test("external MCP cannot reach the mutating chat runtime", async () => {
  const route = await readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/mcp/auth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /send_agent_message|sendAgentMessage|agent:chat/);
  assert.doesNotMatch(auth, /"agent:chat"/);
  const planStart = route.indexOf('"plan_action"');
  const planEnd = route.indexOf("server.registerTool", planStart + 20);
  const planTool = route.slice(planStart, planEnd < 0 ? undefined : planEnd);
  assert.match(planTool, /readOnlyHint: false/);
  assert.match(planTool, /destructiveHint: false/);
});

test("personal MCP handler listens on its actual Next.js route", async () => {
  const route = await readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8");
  assert.match(route, /streamableHttpEndpoint: "\/api\/mcp\/agent"/);
  assert.doesNotMatch(route, /basePath: "\/api\/mcp"/);
});

test("personal PATs have bounded expiry and active-token count", async () => {
  const store = await readFile(new URL("../app/services/personal-mcp-token-store.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/agent/mcp-tokens/route.ts", import.meta.url), "utf8");
  assert.match(store, /MAX_ACTIVE_PERSONAL_MCP_TOKENS = 10/);
  assert.match(store, /DEFAULT_EXPIRATION_MS/);
  assert.match(store, /MAX_EXPIRATION_MS/);
  assert.match(store, /personal_mcp_token_limit_reached/);
  assert.match(api, /expiresInDays: z\.number\(\)\.int\(\)\.min\(1\)\.max\(365\)\.default\(30\)/);
});

test("sensitive personal MCP tools require explicit scopes and UI opt-in", async () => {
  const route = await readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/mcp/auth.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/agent/agent-external-access.tsx", import.meta.url), "utf8");
  assert.match(route, /"get_agent_context"[\s\S]*?"agent:context"/);
  assert.match(route, /"get_agent_conversation"[\s\S]*?"agent:conversation"/);
  assert.match(auth, /scopes: \["agent:read", "agent:plan", "agent:context", "agent:conversation"\]/);
  assert.match(ui, /plan,setPlan.*useState\(false\)/);
  assert.match(ui, /context,setContext.*useState\(false\)/);
  assert.match(ui, /conversation,setConversation.*useState\(false\)/);
  assert.match(ui, /context\?\["agent:context"\]/);
  assert.match(ui, /conversation\?\["agent:conversation"\]/);
});
