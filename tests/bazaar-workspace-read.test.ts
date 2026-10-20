import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createBazaarWorkspaceReadAdapter as createBazaarNativeReadAdapter, type BazaarBinding} from "../app/bazaar/workspace-read-adapter";
import {createBazaarNativeReadAdapter as createLegacyReadAdapter} from "../app/bazaar/native-read";
import {reviewZeroFeeCard} from "../app/bazaar/zero-fee-review";
import {createWorkspaceReadHandler, WORKSPACE_READ_PATH} from "../app/bazaar/workspace-read-web";
import {requestWorkspaceRead} from "../app/connections/bazaar/workspace-request";
const origin = "https://carmelita.browns.studio";
const binding: BazaarBinding = {userId: "user-a", ownerId: "ow_" + "a".repeat(32), workspaceId: "workspace-a", agentId: "agent-a", generation: 1, agentSecretReference: "encrypted-reference"};
import {card} from "./fixtures/bazaar-zero-fee-card";
function canonical(v: unknown): unknown { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => [k,canonical(v)])); return v; }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
function fixture(options: {fee?: number | null; foreign?: boolean; revoke?: boolean} = {}) {
  const calls: {path: string; query: string; tool?: string}[] = []; let secrets = 0;
  const deps = {authenticatedUserId: async () => "user-a", bindingForUser: async () => options.revoke && calls.some(c => c.tool === "get_bazaar_capabilities") ? null : binding,
    agentSecretForUser: async () => {secrets++; return {userId: "user-a", ownerId: binding.ownerId, agentAccess: "a".repeat(43)};},
    fetcher: (async (target, init) => {
      const url = new URL(String(target)), body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({path: url.pathname, query: url.search, tool: body?.params?.name});
      assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      if (url.pathname !== "/api/mcp") assert.equal(new Headers(init?.headers).has("authorization"), false);
      if (url.pathname === "/api/integration") return Response.json({version: "bazaar.integration/v1", endpoints: {mcp: {path: "/api/mcp"}, catalogue: {path: "/api/market/catalog"}, orders: {path: "/api/market/orders"}}, transport: {testedMcpProtocolVersion: "2024-11-05"}, identity: {ownerAssignedByServer: true, authenticatedRoleField: "role"}});
      if (url.pathname === "/api/market/catalog") return Response.json({services: [{card, cardHash: hash(card), status: "activated"}], partialResults: true, paused: false, nextCursor: "next_catalog"});
      assert.equal(url.pathname, "/api/mcp");
      if (body.method === "notifications/initialized") return new Response(null, {status: 202});
      let result: unknown;
      if (body.method === "initialize") result = {protocolVersion: "2024-11-05"};
      else if (body.method === "tools/list") result = {tools: ["get_bazaar_identity", "get_bazaar_capabilities", "list_market_orders"].map(name => ({name}))};
      else {
        assert.equal(body.method, "tools/call");
        const name = body.params.name;
        assert.ok(["get_bazaar_identity", "get_bazaar_capabilities", "list_market_orders"].includes(name));
        const value = name === "get_bazaar_identity" ? {...binding, role: "agent", network: "stellar:testnet"}
          : name === "get_bazaar_capabilities" ? {effectiveFeatures: {purchases: {enabled: true}}, workspace: {marketplace: {feeBps: options.fee === null ? undefined : options.fee ?? 0, custody: false}}}
          : {orders: [{operationId: "11111111-1111-4111-8111-111111111111", serviceId: "service-a", buyerOwnerId: options.foreign ? "other" : binding.ownerId, sellerOwnerId: "seller", perspective: "purchase", phase: "delivered", paymentVerifiedAt: "2026-10-20T00:00:00Z", transactionHash: "a".repeat(64)}], partialResults: true, nextCursor: "next_history"};
        result = {content: [{type: "text", text: JSON.stringify(value)}]};
      }
      return Response.json({jsonrpc: "2.0", id: body.id, result});
    }) as typeof fetch};
  return {deps, calls, get secrets() {return secrets;}};
}
function request(input: unknown, headers: Record<string,string> = {}) {return new Request(origin + WORKSPACE_READ_PATH, {method: "POST", headers: {origin, authorization: "Bearer test-session", "content-type": "application/json", ...headers}, body: JSON.stringify(input)});}
test("web session composes native identity, catalogue, zero-fee review and owner history without financial calls", async () => {
  const f = fixture(), handler = createWorkspaceReadHandler({verifyUser: async () => "user-a", adapter: user => {assert.equal(user, binding.userId); return f.deps;}});
  for (const input of [{action: "identity"}, {action: "catalog"}, {action: "review", serviceId: card.id, cardHash: hash(card)}, {action: "history"}]) {
    const response = await handler(request(input)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json(); assert.equal(body.action, input.action); assert.equal(body.value.readOnly, true);
    if (input.action === "review") {assert.equal(body.value.feeBps, 0); assert.equal(body.value.grossAtoms, "100000"); assert.equal(body.value.sellerAtoms, "100000"); assert.equal(body.value.orderCreated, false);}
    if (input.action === "history") {assert.equal(body.value.partialResults, true); assert.equal(body.value.nextCursor.ownerId, binding.ownerId); assert.equal(body.value.independentlyVerifiedChainPayment, false);}
  }
  assert.ok(f.calls.every(c => ["/api/integration", "/api/market/catalog", "/api/mcp"].includes(c.path)));
});
test("any nonzero or absent commission profile blocks review before reading the service", async () => {
  for (const fee of [150, null]) {
    const f = fixture({fee});
    await assert.rejects(createBazaarNativeReadAdapter(f.deps).review({serviceId: card.id, cardHash: hash(card)}), /commission_disabled/);
    assert.equal(f.calls.some(c => c.path === "/api/market/catalog"), false);
  }
});
test("terms preserve integer amounts and reject modified cards, assets, precision and alternate payments", () => {
  assert.equal(reviewZeroFeeCard(card, hash(card)).feeAtoms, "0");
  assert.throws(() => reviewZeroFeeCard(card, "0".repeat(64)), /card_changed/);
  for (const change of [{...card, network: "stellar:mainnet"}, {...card, paymentOptions: []}, {...card, payment: {...card.payment, amount: "0.00000001"}}, {...card, payment: {...card.payment, destination: "invalid"}}, {...card, payment: {...card.payment, identity: {...card.payment.identity, issuer: "wrong"}}}]) assert.throws(() => reviewZeroFeeCard(change, hash(change)), /unsupported/);
});
test("changed catalogue hash cannot be converted to review approval", async () => {
  const f = fixture(); await assert.rejects(createBazaarNativeReadAdapter(f.deps).review({serviceId: card.id, cardHash: "0".repeat(64)}), /card_changed/);
});
test("foreign history is rejected, and a foreign cursor never opens secrets or connects", async () => {
  const foreign = fixture({foreign: true}); await assert.rejects(createBazaarNativeReadAdapter(foreign.deps).history({limit: 1}), /history_owner_mismatch/);
  const f = fixture(); await assert.rejects(createBazaarNativeReadAdapter(f.deps).history({cursor: {ownerId: "other", generation: 1, value: "cursor"}}), /cursor_owner_mismatch/);
  assert.equal(f.calls.length, 0); assert.equal(f.secrets, 0);
});
test("revocation during review rejects data after awaits", async () => {
  const f = fixture({revoke: true}); await assert.rejects(createBazaarNativeReadAdapter(f.deps).review({serviceId: card.id, cardHash: hash(card)}), /binding_changed/);
});
test("missing authentication and foreign origins are rejected before dependencies", async () => {
  let attempts = 0; const handler = createWorkspaceReadHandler({verifyUser: async () => {attempts++; throw Error();}, adapter: () => {throw Error();}});
  assert.equal((await handler(request({action: "identity"}, {origin: "https://foreign.example"}))).status, 403);
  assert.equal((await handler(request({action: "identity"}, {authorization: ""}))).status, 401);
  assert.equal(attempts, 0);
});
test("closed web action schema rejects order, sign, caller owner and operation ID before adapter", async () => {
  let adapters = 0; const handler = createWorkspaceReadHandler({verifyUser: async () => "user-a", adapter: () => {adapters++; throw Error();}});
  for (const input of [{action: "create_market_order"}, {action: "sign"}, {action: "history", userId: "other"}, {action: "review", serviceId: card.id, cardHash: hash(card), operationId: "new"}]) assert.equal((await handler(request(input))).status, 400);
  assert.equal(adapters, 0);
});
test("oversized body and private dependency errors are sanitized", async () => {
  const handler = createWorkspaceReadHandler({verifyUser: async () => "user-a", adapter: () => {throw Error("SECRET SQL CONNECTION");}});
  assert.equal((await handler(request({action: "history", padding: "x".repeat(2048)}))).status, 400);
  const failed = await handler(request({action: "history"})); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /SECRET|SQL/);
});
test("browser read does not retry uncertain responses or accept action substitution", async () => {
  let calls = 0;
  const deps = {pageOrigin: origin, getAccessToken: async () => "session", signal: new AbortController().signal,
    fetcher: (async () => {calls++; return Response.json({action: "review", value: {readOnly: true}});}) as typeof fetch};
  await assert.rejects(requestWorkspaceRead({action: "history"}, deps), /unconfirmed/); assert.equal(calls, 1);
  const abort = new AbortController(); abort.abort(); await assert.rejects(requestWorkspaceRead({action: "history"}, {...deps, signal: abort.signal})); assert.equal(calls, 1);
});

test("review revalidates exactly the selected public page without search or automatic scans", async () => {
  const f = fixture();
  await createBazaarNativeReadAdapter(f.deps).review({serviceId: card.id, cardHash: hash(card), catalogCursor: "selected_page"});
  const reads = f.calls.filter(c => c.path === "/api/market/catalog"); assert.equal(reads.length, 1);
  const query = new URLSearchParams(reads[0].query); assert.equal(query.get("limit"), "5"); assert.equal(query.get("cursor"), "selected_page"); assert.equal(query.has("q"), false);
});
test("another session cannot consume a stored owner link", async () => {
  const f = fixture();
  await assert.rejects(createBazaarNativeReadAdapter({...f.deps, authenticatedUserId: async () => "user-b"}).history(), /binding_mismatch/);
  assert.equal(f.secrets, 0); assert.equal(f.calls.length, 0);
});
test("cancelled web reads stop before opening secrets or making remote calls", async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  await assert.rejects(createBazaarNativeReadAdapter({...f.deps, signal: abort.signal}).preflight(), /read_unconfirmed/);
  assert.equal(f.secrets, 0); assert.equal(f.calls.length, 0);
});
test("web catalogue, identity and owner history preserve the accepted native read contract", async () => {
  const legacy = createLegacyReadAdapter(fixture().deps), web = createBazaarNativeReadAdapter(fixture().deps);
  assert.deepEqual(await web.catalog({limit: 5}), await legacy.catalog({limit: 5}));
  assert.deepEqual(await web.preflight(), await legacy.preflight());
  assert.deepEqual(await web.history({limit: 1}), await legacy.history({limit: 1}));
});
