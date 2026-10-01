import assert from "node:assert/strict";
import test from "node:test";
import { readWorkspaceQuery, workspaceCommands } from "../app/agent/workspace-queries";
import { parseChatReadRequest } from "../app/queries/chat";
import { getReadQuery } from "../app/queries/registry";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("workspace reads use the shared adapter, current credential and selected locale without an owner selector", async () => {
  for (const locale of ["es", "en", "pt"] as const) {
    let calls = 0;
    const expected = { wallets: [], source: "Controlled registry", queriedAt: "2026-10-01T22:00:00.000Z" };
    const result = await readWorkspaceQuery("personal.wallets", async () => "fixture-not-a-credential", locale, new AbortController().signal, async (url, init) => {
      calls++;
      assert.equal(url, "/api/agent/queries");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-not-a-credential");
      assert.deepEqual(JSON.parse(String(init?.body)), { query: "personal.wallets", input: {}, locale });
      return Response.json(expected);
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, expected);
  }
});

test("a closed workspace does not obtain credentials or issue a read", async () => {
  let tokenReads = 0;
  let requests = 0;
  await assert.rejects(readWorkspaceQuery("personal.wallets", async () => { tokenReads++; return "fixture"; }, "es", AbortSignal.abort(), async () => { requests++; return Response.json({}); }), { name: "AbortError" });
  assert.equal(tokenReads, 0);
  assert.equal(requests, 0);
});

test("an owner change while obtaining credentials prevents the previous panel request", async () => {
  const token = deferred<string | null>();
  const controller = new AbortController();
  let requests = 0;
  const pending = readWorkspaceQuery("personal.wallets", () => token.promise, "es", controller.signal, async () => { requests++; return Response.json({}); });
  controller.abort();
  token.resolve("fixture-not-a-credential");
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requests, 0);
});

test("late prior-owner data and errors are discarded while a new panel remains usable", async () => {
  for (const status of [200, 503]) {
    const body = deferred<unknown>();
    const started = deferred<void>();
    const controller = new AbortController();
    const oldRead = readWorkspaceQuery("personal.wallets", async () => "fixture", "es", controller.signal, async () => {
      started.resolve();
      return { ok: status === 200, json: () => body.promise } as Response;
    });
    await started.promise;
    controller.abort();
    const current = await readWorkspaceQuery("personal.wallets", async () => "fixture", "pt", new AbortController().signal, async () => Response.json({ wallets: ["current-owner-only"] }));
    body.resolve(status === 200 ? { wallets: ["previous-owner"] } : { error: "previous-owner-error" });
    await assert.rejects(oldRead, { name: "AbortError" });
    assert.deepEqual(current, { wallets: ["current-owner-only"] });
  }
});

test("unauthenticated and failed reads remain errors rather than empty successful registries", async () => {
  await assert.rejects(readWorkspaceQuery("personal.wallets", async () => null, "es", new AbortController().signal, async () => { assert.fail("No read without a credential"); }), { message: "authentication_required" });
  await assert.rejects(readWorkspaceQuery("personal.wallets", async () => "fixture", "es", new AbortController().signal, async () => Response.json({ error: "read_query_timeout" }, { status: 503 })), { message: "read_query_timeout" });
});

test("developer examples resolve to strict shared read contracts without executing them", () => {
  assert.ok(workspaceCommands.length > 0);
  for (const command of workspaceCommands) {
    const request = parseChatReadRequest(command);
    assert.ok(request && "id" in request, command);
    const definition = getReadQuery(request.id);
    assert.equal(definition.inputSchema.safeParse(request.input).success, true, command);
    assert.equal(definition.scope, "agent:read", command);
    assert.equal(definition.inputSchema.safeParse({ ...request.input, userId: "another-owner" }).success, false, command);
  }
});
