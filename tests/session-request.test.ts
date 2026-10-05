import assert from "node:assert/strict";
import test from "node:test";
import { sessionAbortable, withSessionDeadline } from "../app/agent/session-request";

test("an already-ended owner cannot start an SDK operation", () => {
  let called = false;
  assert.throws(() => sessionAbortable(async () => { called = true; }, AbortSignal.abort()), { name: "AbortError" });
  assert.equal(called, false);
});

test("an immediate owner cancellation wins before the SDK operation begins", async () => {
  const owner = new AbortController();
  let called = false;
  const pending = sessionAbortable(async () => { called = true; }, owner.signal);
  owner.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(called, false);
});

test("a deadline releases an SDK promise that never resolves", async () => {
  await assert.rejects(withSessionDeadline(new AbortController().signal, 10, signal => sessionAbortable(() => new Promise(() => {}), signal)), { name: "TimeoutError" });
});

test("late fulfillment and rejection cannot continue a cancelled session or become unhandled failures", async () => {
  for (const fails of [true, false]) {
    const owner = new AbortController();
    let finish!: (value: unknown) => void;
    let fail!: (cause: Error) => void;
    let continued = false;
    const sdk = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const task = (async () => { await sessionAbortable(() => sdk, owner.signal); continued = true; })();
    await Promise.resolve();
    owner.abort();
    await assert.rejects(task, { name: "AbortError" });
    if (fails) fail(new Error("old SDK failure")); else finish("old SDK result");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(continued, false);
  }
});

test("a current session preserves its own result and failure after another session ends", async () => {
  const old = new AbortController();
  old.abort();
  const current = new AbortController();
  assert.deepEqual(await sessionAbortable(async () => ({ owner: "current" }), current.signal), { owner: "current" });
  const cause = new Error("current provider failed");
  await assert.rejects(sessionAbortable(async () => { throw cause; }, current.signal), error => error === cause);
});
