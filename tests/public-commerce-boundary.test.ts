import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server";
import { backend } from "../app/commerce-backend";
import { GET as catalog, POST as disabledCommerce } from "../app/api/commerce/route";
import { POST as mcp } from "../app/api/mcp/route";

const legacyTools = ["create_intent", "evaluate_policy", "demo_authorize_intent", "execute_authorized_intent", "get_receipt"];
const methods = ["createIntent", "evaluatePolicy", "authorize", "execute", "getReceipt"] as const;

async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("mcp_test_response_timeout")), 5000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function rpc(method: string, params?: object) {
  const response = await within(mcp(new Request("https://preview.invalid/api/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(5000),
  })));
  assert.equal(response.status, 200);
  const body = await within(response.text());
  return JSON.parse(response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split("\n").find((line) => line.startsWith("data: "))!.slice(6) : body);
}

test("public commerce POST rejects all mutations, replay and receipt lookup before body or backend access", async (t) => {
  const spies = methods.map((method) => t.mock.method(backend, method, async () => { throw new Error("private-backend-should-not-run"); }));
  const post = disabledCommerce as (request: Request) => Promise<Response>;
  for (const action of [...legacyTools, "authorize", "execute", "unknown_action"]) {
    for (let retry = 0; retry < 2; retry++) {
      const request = new Request("https://preview.invalid/api/commerce", {
        method: "POST", body: JSON.stringify({ action, actorId: "other-user", intentId: "private-intent", authorizationToken: "private-token" }),
      });
      const readBody = t.mock.method(request, "json", async () => { throw new Error("body-must-not-be-read"); });
      const response = await post(request);
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "GET");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "commerce_demo_disabled" });
      assert.equal(readBody.mock.callCount(), 0);
    }
  }
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});

test("public REST catalog keeps read access and maps storage failures to a fixed safe error", async (t) => {
  const search = t.mock.method(backend, "searchOffers", async (query: string) => {
    if (query === "broken") throw new Error("SELECT private_sql FROM receipts; postgres://private-credential");
    return [{ id: "published", merchant: "Provider", title: "Public service", description: "Public description", kind: "service" as const,
      amount: 1, currency: "USDC" as const, network: "offchain-demo" as const, availability: "partner_pending" as const }];
  });
  const response = await catalog(new NextRequest("https://preview.invalid/api/commerce?query=service"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "catalog");
  assert.equal(result.executionEnabled, false);
  assert.equal(result.offers[0].id, "published");
  assert.deepEqual(search.mock.calls[0].arguments, ["service"]);
  const failed = await catalog(new NextRequest("https://preview.invalid/api/commerce?query=broken"));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "commerce_catalog_unavailable" });
  const tooLong = await catalog(new NextRequest(`https://preview.invalid/api/commerce?query=${"x".repeat(121)}`));
  assert.equal(tooLong.status, 400);
  assert.equal(search.mock.callCount(), 2);
});

test("generic MCP publishes only public reads and rejects every retired tool without storage access", async (t) => {
  // mcp-handler starts a maintenance interval even with SSE disabled. Keep the
  // real HTTP handler and its timer, but allow this test process to exit.
  const originalInterval = globalThis.setInterval;
  t.mock.method(globalThis, "setInterval", (...args: Parameters<typeof setInterval>) => {
    const timer = originalInterval(...args);
    timer.unref();
    return timer;
  });
  const spies = methods.map((method) => t.mock.method(backend, method, async () => { throw new Error("private-backend-should-not-run"); }));
  const listed = await rpc("tools/list", {});
  assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name).sort(), ["get_offer", "search_offers"]);
  for (const tool of listed.result.tools) assert.equal(tool.annotations.readOnlyHint, true);
  for (const name of legacyTools) {
    const response = await rpc("tools/call", { name, arguments: { intentId: "private-intent", actorId: "other-user", explicitUserConfirmation: true } });
    assert.ok(response.error || response.result?.isError, `direct ${name} call must fail`);
    assert.doesNotMatch(JSON.stringify(response), /private-backend|authorizationToken|private-token/);
  }
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});

test("generic MCP reads preserve missing offer and mask unexpected database errors", async (t) => {
  t.mock.method(backend, "searchOffers", async () => { throw new Error("SELECT private_sql FROM receipts; private-credential"); });
  t.mock.method(backend, "getOffer", async (offerId: string) => {
    if (offerId === "draft") throw new Error("offer_not_found");
    throw new Error("private_database_failure");
  });
  for (const [name, args, error] of [
    ["search_offers", {}, "commerce_catalog_unavailable"],
    ["get_offer", { offerId: "draft" }, "offer_not_found"],
    ["get_offer", { offerId: "broken" }, "commerce_catalog_unavailable"],
  ] as const) {
    const response = await rpc("tools/call", { name, arguments: args });
    assert.equal(response.result.isError, true);
    assert.deepEqual(JSON.parse(response.result.content[0].text), { error });
  }
});

test("public browser discovery and demo cannot offer retired operations", async () => {
  const [registry, console, page] = await Promise.all([
    readFile(new URL("../app/webmcp-registry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demo/action-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/demo/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(registry, /prepare_commerce_intent|method:\s*["']POST["']/);
  assert.doesNotMatch(console, /authorizationToken|method:\s*["']POST["']|create_intent|evaluate_policy/);
  assert.doesNotMatch(page, /RecordingGuide|zero-debit replay|Execute simulated action/i);
});
