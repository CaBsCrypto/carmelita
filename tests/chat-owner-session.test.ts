import assert from "node:assert/strict";
import test from "node:test";
import { requestAgentChat } from "../app/agent/chat-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("chat sends the draft and selected locale through the existing endpoint without owner parameters", async () => {
  for (const locale of ["es", "en", "pt"] as const) {
    const controller = new AbortController();
    const expected = { sharedRead: true, assistantMessage: { content: "Controlled read", actions: [] } };
    const reply = await requestAgentChat('/consulta personal.wallets {}', locale, async () => "fixture-not-a-credential", controller.signal, async (url, init) => {
      assert.equal(url, "/api/agent/chat");
      assert.equal(init?.method, "POST");
      assert.ok(init?.signal && !init.signal.aborted);
      assert.notEqual(init.signal, controller.signal, "The owner signal is combined with a complete request deadline");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-not-a-credential");
      assert.deepEqual(JSON.parse(String(init?.body)), { message: '/consulta personal.wallets {}', locale });
      return Response.json(expected);
    });
    assert.deepEqual(reply, expected);
  }
});

test("an already-ended chat session obtains no credential and sends no message", async () => {
  let tokenReads = 0;
  let writes = 0;
  await assert.rejects(requestAgentChat("previous draft", "es", async () => { tokenReads++; return "fixture"; }, AbortSignal.abort(), async () => { writes++; return Response.json({}); }), { name: "AbortError" });
  assert.equal(tokenReads, 0);
  assert.equal(writes, 0);
});

test("changing the owner during token acquisition cannot send the previous owner's draft", async () => {
  const token = deferred<string | null>();
  const controller = new AbortController();
  let writes = 0;
  const pending = requestAgentChat("previous draft", "es", () => token.promise, controller.signal, async () => { writes++; return Response.json({}); });
  controller.abort();
  token.resolve("fixture-not-a-credential");
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(writes, 0);
});

test("late replies and failures of the previous chat session cannot replace current content or draft", async () => {
  for (const ok of [true, false]) {
    const body = deferred<unknown>();
    const started = deferred<void>();
    const controller = new AbortController();
    const oldRequest = requestAgentChat("old draft", "es", async () => "fixture", controller.signal, async () => {
      started.resolve();
      return { ok, json: () => body.promise } as Response;
    });
    await started.promise;
    controller.abort();
    const currentReply = await requestAgentChat("current draft", "pt", async () => "fixture", new AbortController().signal, async () => Response.json({ assistantMessage: { content: "current owner reply" } }));
    body.resolve(ok ? { assistantMessage: { content: "previous owner reply" } } : { error: "old session error" });
    await assert.rejects(oldRequest, { name: "AbortError" });
    assert.deepEqual(currentReply, { assistantMessage: { content: "current owner reply" } });
  }
});

test("chat authentication and provider failures remain recoverable failures", async () => {
  await assert.rejects(requestAgentChat("draft", "es", async () => null, new AbortController().signal, async () => { assert.fail("Unauthenticated drafts must not be sent"); }), { message: "authentication_required" });
  await assert.rejects(requestAgentChat("draft", "es", async () => "fixture", new AbortController().signal, async () => Response.json({ error: "read_query_timeout" }, { status: 503 })), { message: "read_query_timeout" });
});
