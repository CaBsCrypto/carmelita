import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { completeNotionOAuth, disconnectNotion, getNotionAccessToken, encryptConnectorSecret } from "../app/connectors/notion-oauth";
import { textFromResult, normalizeNotionSearchResult } from "../app/connectors/notion-mcp";
import type { getDb } from "../db";

test("disconnect erases local credentials and invalidates pending authorization for only the owner", async () => {
  const writes: Record<string, unknown>[] = [];
  const conditions: SQL[] = [];
  const fake = {
    update: () => ({ set: (values: Record<string, unknown>) => { writes.push(values); return { where: async (condition: SQL) => { conditions.push(condition); } }; } }),
    delete: () => ({ where: async (condition: SQL) => { conditions.push(condition); } }),
  } as unknown as ReturnType<typeof getDb>;
  const result = await disconnectNotion("owner-1", fake);
  assert.equal(result.status, "disconnected");
  assert.equal(result.providerRevocation, "not_performed");
  assert.equal(writes[0].accessTokenEncrypted, "");
  assert.equal(writes[0].refreshTokenEncrypted, null);
  assert.deepEqual(writes[0].metadata, {});
  for (const condition of conditions) {
    const query = new PgDialect().sqlToQuery(condition);
    assert.deepEqual(query.params, ["owner-1", "notion"]);
  }
});

test("callback consumes state with one delete returning and refuses a missing/replayed state", async () => {
  let claims = 0;
  const fake = {
    delete: () => ({ where: () => ({ returning: async () => { claims++; return []; } }) }),
  } as unknown as ReturnType<typeof getDb>;
  await assert.rejects(completeNotionOAuth("code", "state", fake), /oauth_state_invalid_or_expired/);
  assert.equal(claims, 1);
});

test("missing or unreadable MCP content is an error, never a successful synthetic response", () => {
  for (const content of [undefined, [], [{ type: "image", data: "x" }], [{ type: "text", text: " " }]]) {
    assert.throws(() => textFromResult(content), /notion_response_invalid/);
  }
  assert.equal(textFromResult([{ type: "text", text: '{"results":[]}' }]), '{"results":[]}');
});

test("a refresh that loses its generation to disconnect cannot return or resurrect credentials", async () => {
  const previousKey = process.env.CONNECTOR_ENCRYPTION_KEY;
  process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const priorFetch = globalThis.fetch;
  const connection = {
    id: "connection-1", status: "active", updatedAt: new Date(),
    accessTokenEncrypted: encryptConnectorSecret("old-access"),
    refreshTokenEncrypted: encryptConnectorSecret("old-refresh"),
    tokenExpiresAt: new Date(0), scopes: [], metadata: { clientId: "client", tokenEndpoint: "https://mcp.notion.com/token" },
  };
  let guard: SQL | undefined;
  const fake = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [connection] }) }) }),
    update: () => ({ set: () => ({ where: (condition: SQL) => { guard = condition; return { returning: async () => [] }; } }) }),
  } as unknown as ReturnType<typeof getDb>;
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "late-access" }), { status: 200 });
  try {
    await assert.rejects(getNotionAccessToken("owner", fake), /notion_connection_superseded/);
    assert.ok(guard);
    const query = new PgDialect().sqlToQuery(guard);
    assert.equal(query.params[0], "connection-1");
    assert.equal(query.params[1], "active");
    assert.equal(query.params[2], connection.accessTokenEncrypted);
    assert.equal(query.params.length, 4);
  } finally {
    globalThis.fetch = priorFetch;
    if (previousKey === undefined) delete process.env.CONNECTOR_ENCRYPTION_KEY;
    else process.env.CONNECTOR_ENCRYPTION_KEY = previousKey;
  }
});

test("search sources preserve returned titles and HTTPS URLs without invented citations", () => {
  const source = { title: "Roadmap", url: "https://www.notion.so/abc" };
  assert.deepEqual(normalizeNotionSearchResult({ content: [{ type: "text", text: JSON.stringify({ results: [source] }) }] }).sources, [source]);
  assert.equal(normalizeNotionSearchResult({ content: [{ type: "text", text: '{"results":[]}' }] }).empty, true);
  assert.throws(() => normalizeNotionSearchResult({ content: [{ type: "text", text: "Some tasks exist" }] }), /notion_sources_unavailable/);
  assert.throws(() => normalizeNotionSearchResult({ content: [{ type: "text", text: JSON.stringify({ results: [{ title: "Bad", url: "javascript:alert(1)" }] }) }] }), /notion_sources_unavailable/);
});
