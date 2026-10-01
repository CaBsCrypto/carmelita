import assert from "node:assert/strict";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import { decryptConnectorSecret, encryptConnectorSecret, getNotionAccessToken } from "../app/connectors/notion-oauth";
import { createEcosystemQueries } from "../app/queries/ecosystem";
import { executeQueryDefinition } from "../app/queries/types";

const owner = "did:privy:notion-owner";
const fixtureAccess = "fixture-access-not-a-credential";
const fixtureRefresh = "fixture-refresh-not-a-credential";
const renewedAccess = "renewed-fixture-access-not-a-credential";
const renewedRefresh = "renewed-fixture-refresh-not-a-credential";

type Row = Record<string, unknown>;
function fixture(scopes: string[] = ["search", "read"], expired = true) {
  const rows: Row[] = [owner, "did:privy:another-owner"].map(userId => ({
    id: `${userId}-connection`, user_id: userId, provider: "notion", status: "active",
    access_token_encrypted: encryptConnectorSecret(fixtureAccess),
    refresh_token_encrypted: encryptConnectorSecret(fixtureRefresh),
    token_expires_at: new Date(Date.now() + (expired ? -60_000 : 3_600_000)).toISOString(),
    scopes: [...scopes], metadata: { clientId: "fixture-client", tokenEndpoint: "https://notion.fixture.test/token" },
    created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z",
  }));
  const statements: Array<{ query: string; params: unknown[] }> = [];
  const writes: Array<Record<string, unknown>> = [];
  const client = Object.assign(async () => { throw new Error("unexpected_query"); }, {
    query: async (query: string, params: unknown[]) => {
      statements.push({ query, params });
      if (query.startsWith("select ")) {
        assert.match(query, / from "agent_external_connections" /);
        assert.match(query, /"user_id" = \$1/);
        assert.match(query, /"provider" = \$2/);
        assert.equal(params[0], owner);
        assert.equal(params[1], "notion");
        const columns = [...query.slice(7, query.indexOf(" from ")).matchAll(/"([a-z_]+)"/g)].map(match => match[1]);
        return { rows: rows.filter(row => row.user_id === params[0] && row.provider === params[1]).map(row => columns.map(column => row[column])) };
      }
      assert.match(query, /^update "agent_external_connections" set /, "refresh cannot insert or provision schema");
      const idParameter = query.match(/ where "agent_external_connections"\."id" = \$(\d+)/);
      assert.ok(idParameter);
      const row = rows.find(row => row.id === params[Number(idParameter[1]) - 1]);
      assert.ok(row);
      assert.equal(row.user_id, owner, "refresh may update only the connection selected for the authenticated owner");
      const changed: Record<string, unknown> = {};
      for (const field of query.slice(0, query.indexOf(" where ")).matchAll(/"([a-z_]+)" = \$(\d+)/g)) {
        const value = params[Number(field[2]) - 1];
        changed[field[1]] = field[1] === "scopes" && typeof value === "string" ? JSON.parse(value) : value;
      }
      writes.push(changed);
      Object.assign(row, changed);
      return { rows: [] };
    },
  }) as unknown as NeonQueryFunction<false, false>;
  return { rows, statements, writes, db: drizzle(client, { schema }) };
}

function renewal(scope?: unknown, includeScope = true, status = 200) {
  const requests: Array<{ url: string; method: string | undefined; params: URLSearchParams }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const params = new URLSearchParams(String(init?.body));
    requests.push({ url: String(input), method: init?.method, params });
    assert.equal(String(input), "https://notion.fixture.test/token");
    assert.equal(init?.method, "POST");
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("refresh_token"), fixtureRefresh);
    assert.equal(params.get("client_id"), "fixture-client");
    assert.equal(params.has("scope"), false, "refresh must not request a new scope or initiate consent");
    return Response.json({ access_token: renewedAccess, refresh_token: renewedRefresh, expires_in: 3600,
      ...(includeScope ? { scope } : {}) }, { status });
  };
  return { fetcher, requests };
}

async function withFixtureKey(operation: () => Promise<void>) {
  const previous = process.env.CONNECTOR_ENCRYPTION_KEY;
  process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try { await operation(); }
  finally {
    if (previous === undefined) delete process.env.CONNECTOR_ENCRYPTION_KEY;
    else process.env.CONNECTOR_ENCRYPTION_KEY = previous;
  }
}

test("Notion refresh without scope preserves the exact grant and rotates only the owner's existing tokens", async () => withFixtureKey(async () => {
  const state = fixture(["search", "read", "search"]);
  const beforeForeign = structuredClone(state.rows[1]);
  const renewalRequest = renewal(undefined, false);
  const token = await getNotionAccessToken(owner, { db: state.db, fetcher: renewalRequest.fetcher });
  assert.equal(token, renewedAccess);
  assert.deepEqual(state.rows[0].scopes, ["search", "read", "search"]);
  assert.equal(decryptConnectorSecret(String(state.rows[0].access_token_encrypted)), renewedAccess);
  assert.equal(decryptConnectorSecret(String(state.rows[0].refresh_token_encrypted)), renewedRefresh);
  assert.deepEqual(state.rows[1], beforeForeign);
  assert.equal(renewalRequest.requests.length, 1);
  assert.equal(state.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(state.writes), /renewed-fixture|fixture-refresh/);
}));

test("Notion refresh accepts equivalent case-sensitive scope sets without changing stored order or duplicates", async () => withFixtureKey(async () => {
  for (const scope of ["read search", " search   read search ", "read\tsearch\nread"]) {
    const state = fixture(["search", "read", "search"]);
    const { fetcher } = renewal(scope);
    assert.equal(await getNotionAccessToken(owner, { db: state.db, fetcher }), renewedAccess);
    assert.deepEqual(state.rows[0].scopes, ["search", "read", "search"]);
    assert.equal(state.rows[0].status, "active");
  }
}));

test("Notion refresh rejects additions, reductions, substitutions, empty and invalid grants before persisting credentials", async () => withFixtureKey(async () => {
  for (const scope of ["search read write", "search", "search other", "Search read", "", "   ", null, ["search", "read"], 1, "search read\\", "search read\u0000"]) {
    const state = fixture();
    const before = structuredClone(state.rows);
    const { fetcher, requests } = renewal(scope);
    await assert.rejects(getNotionAccessToken(owner, { db: state.db, fetcher }), error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "notion_reauth_required");
      return true;
    });
    assert.equal(requests.length, 1);
    assert.equal(state.writes.length, 1);
    assert.deepEqual(Object.keys(state.writes[0]).sort(), ["status", "updated_at"]);
    assert.equal(state.rows[0].status, "reauth_required");
    for (const field of ["scopes", "access_token_encrypted", "refresh_token_encrypted", "token_expires_at", "metadata"]) {
      assert.deepEqual(state.rows[0][field], before[0][field]);
    }
    assert.deepEqual(state.rows[1], before[1]);
    // Once rejected, later reads cannot reuse the old or newly issued token.
    await assert.rejects(getNotionAccessToken(owner, { db: state.db, fetcher }), /notion_not_connected/);
    assert.equal(requests.length, 1);
  }
}));

test("Notion scope drift yields a visible connection requirement and never reaches workspace business reads", async () => withFixtureKey(async () => {
  const state = fixture();
  const { fetcher, requests } = renewal("search read write");
  let workspaceReads = 0;
  const query = createEcosystemQueries({ notion: async userId => {
    await getNotionAccessToken(userId, { db: state.db, fetcher });
    workspaceReads++;
    return { text: "must not run" };
  } }).find(query => query.id === "offchain.notion.search");
  assert.ok(query);
  const result = await executeQueryDefinition(query, { query: "roadmap" }, { userId: owner, scopes: ["agent:read"] }) as Record<string, unknown>;
  assert.equal(result.status, "connection_required");
  assert.equal(result.code, "notion_reauth_required");
  assert.equal(result.action, "connect_provider_in_carmelita");
  assert.equal(new URL(String(result.connectUrl)).protocol, "https:");
  assert.equal(workspaceReads, 0);
  assert.equal(requests.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /fixture-access|fixture-refresh|token|search read write/);
}));

test("a still-valid Notion token causes no refresh or writes, and a failed refresh retains the original grant", async () => withFixtureKey(async () => {
  const valid = fixture(["search"], false);
  const unavailable: typeof fetch = async () => { throw new Error("unexpected_refresh"); };
  assert.equal(await getNotionAccessToken(owner, { db: valid.db, fetcher: unavailable }), fixtureAccess);
  assert.equal(valid.writes.length, 0);
  const expired = fixture();
  const before = structuredClone(expired.rows);
  const { fetcher } = renewal(undefined, false, 401);
  await assert.rejects(getNotionAccessToken(owner, { db: expired.db, fetcher }), /notion_reauth_required/);
  assert.deepEqual(expired.rows[0].scopes, before[0].scopes);
  assert.equal(expired.rows[0].access_token_encrypted, before[0].access_token_encrypted);
  assert.equal(expired.rows[0].refresh_token_encrypted, before[0].refresh_token_encrypted);
  assert.deepEqual(Object.keys(expired.writes[0]).sort(), ["status", "updated_at"]);
}));
