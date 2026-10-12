import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerPersonalAppTools } from "../app/apps/mcp";
import * as appService from "../app/apps/service";
import { registeredBazaarDefinition } from "../app/apps/bazaar-profile";
import { hasSameAppRequestOrigin, ownAppWebUser } from "../app/apps/http";
import { PERSONAL_MCP_SCOPES, validatePersonalMcpScopes } from "../app/services/personal-mcp-token-store";
import { APP_CONFIRMATION_URI, APP_CONFIRMATION_MIME } from "../app/apps/confirmation-resource";
type Tool = { config: { _meta?: Record<string, unknown>; annotations?: { readOnlyHint?: boolean } }; call: (input: unknown, extra: { authInfo: AuthInfo }) => Promise<{ content: { text?: string }[]; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown>; isError?: boolean }> };
function fixture() {
  const tools = new Map<string, Tool>(); const resources = new Map<string, unknown>(); const calls: unknown[] = [];
  const server = { registerResource: (name: string, uri: string, metadata: unknown) => resources.set(name, { uri, metadata }), registerTool: (name: string, config: Tool["config"], call: Tool["call"]) => tools.set(name, { config, call }) } as unknown as McpServer;
  const definition = { ...registeredBazaarDefinition(), approval: "approved" as const };
  const change = { id: "a45b35bd-4b7e-4d82-9d53-6bc98c006172", appId: "bazaar", action: "add" as const, channel: "chatgpt" as const, definition, status: "prepared" as const, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
  registerPersonalAppTools(server, { ...appService,
    listOwnApps: async userId => { calls.push(userId); return { apps: [] }; },
    listAvailableApps: async () => ({ apps: [definition] }),
    prepareAppChange: async (owner, input, channel) => { calls.push({ owner, input, channel }); return { change, confirmationToken: "appc_" + "a".repeat(43) }; },
    confirmAppChange: async (owner, input, channel) => { calls.push({ owner, input, channel }); return { change: { ...change, status: "confirmed" as const }, app: null }; },
  });
  const auth = (scopes: string[]): AuthInfo => ({ token: "synthetic", clientId: "test-client", scopes, extra: { subjectType: "user", userId: "did:privy:synthetic" } });
  return { tools, resources, calls, auth };
}
test("MCP app changes require an explicit management grant; read grants keep their defaults", async () => {
  const f = fixture(); assert.ok(PERSONAL_MCP_SCOPES.includes("agent:services:manage")); assert.deepEqual(validatePersonalMcpScopes(), ["agent:read"]);
  const denied = await f.tools.get("prepare_app_change")!.call({ appId: "bazaar", action: "add", idempotencyKey: "fixture-1", locale: "en" }, { authInfo: f.auth(["agent:read"]) });
  assert.equal(denied.isError, true); assert.deepEqual(f.calls, []);
  const own = await f.tools.get("list_my_apps")!.call({}, { authInfo: f.auth(["agent:read"]) }); assert.deepEqual(own.structuredContent, { apps: [] }); assert.equal(f.calls[0], "did:privy:synthetic");
});
test("confirmation nonce reaches only the component; commit tools are app-only and never finance tools", async () => {
  const f = fixture(); const preview = await f.tools.get("prepare_app_change")!.call({ appId: "bazaar", action: "add", idempotencyKey: "fixture-1", locale: "es" }, { authInfo: f.auth(["agent:services:manage"]) });
  assert.doesNotMatch(JSON.stringify(preview.content), /appc_/); assert.doesNotMatch(JSON.stringify(preview.structuredContent), /appc_/);
  assert.match(JSON.stringify(preview._meta), /appc_/);
  for (const name of ["confirm_app_change", "cancel_app_change", "retry_app_connection"]) assert.deepEqual(f.tools.get(name)!.config._meta?.ui, { visibility: ["app"] });
  const resource = f.resources.get("carmelita-app-permissions") as { uri: string; metadata: { mimeType: string } }; assert.equal(resource.uri, APP_CONFIRMATION_URI); assert.equal(resource.metadata.mimeType, APP_CONFIRMATION_MIME);
  assert.ok([...f.tools.keys()].every(name => !/(payment|sign|execute|checkout)/.test(name)));
  for (const name of ["list_my_bazaar_orders", "get_my_bazaar_order", "get_my_bazaar_result"]) assert.equal(f.tools.get(name)!.config.annotations?.readOnlyHint, true);
});
test("web mutations fail before session verification for missing or foreign origin and absent bearer", async () => {
  await assert.rejects(ownAppWebUser(new Request("https://carmelita.browns.studio/api/agent/apps", { method: "POST" }), true), /apps_invalid_origin/);
  await assert.rejects(ownAppWebUser(new Request("https://carmelita.browns.studio/api/agent/apps", { method: "POST", headers: { Origin: "https://attacker.invalid" } }), true), /apps_invalid_origin/);
  await assert.rejects(ownAppWebUser(new Request("https://carmelita.browns.studio/api/agent/apps", { method: "POST", headers: { Origin: "https://carmelita.browns.studio" } }), true), /apps_authentication_required/);
  const local = (origin: string, host = "127.0.0.1:8151") => new Request("http://localhost:8151/api/agent/apps", { headers: { Origin: origin, Host: host } });
  assert.equal(hasSameAppRequestOrigin(local("http://127.0.0.1:8151")), true);
  assert.equal(hasSameAppRequestOrigin(local("http://127.0.0.1:8152")), false);
  assert.equal(hasSameAppRequestOrigin(local("https://attacker.invalid")), false);
  assert.equal(hasSameAppRequestOrigin(local("http://127.0.0.1:8151/path")), false);
  assert.equal(hasSameAppRequestOrigin(local("http://127.0.0.1:8151", "attacker.invalid:8151")), false);
});
