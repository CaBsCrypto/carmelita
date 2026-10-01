import assert from "node:assert/strict";
import test from "node:test";
import { sessionAbortable } from "../app/agent/session-request";

test("a canceled owner cannot start an operation or send the next request", async () => {
  const owner = new AbortController();
  owner.abort(new DOMException("Owner changed", "AbortError"));
  let called = false;
  assert.throws(() => sessionAbortable(async () => { called = true; }, owner.signal), { name: "AbortError" });
  assert.equal(called, false);
});

test("owner change during token retrieval stops continuation even if the SDK returns late", async () => {
  const owner = new AbortController();
  let finish!: (value: string) => void;
  const token = new Promise<string>(resolve => { finish = resolve; });
  let dispatched = false;
  const task = (async () => { await sessionAbortable(() => token, owner.signal); dispatched = true; })();
  await Promise.resolve();
  owner.abort(new DOMException("Owner changed", "AbortError"));
  await assert.rejects(task, { name: "AbortError" });
  finish("fixture-only-owner-a");
  await Promise.resolve();
  assert.equal(dispatched, false);
});

test("a total deadline releases a never-ending identity refresh", async () => {
  const deadline = new AbortController();
  const task = sessionAbortable(() => new Promise<void>(() => {}), deadline.signal);
  deadline.abort(new DOMException("Deadline reached", "TimeoutError"));
  await assert.rejects(task, { name: "TimeoutError" });
});

test("body parsing after a successful response is still bounded by the same deadline", async () => {
  const deadline = new AbortController();
  let finish!: (value: { owner: string }) => void;
  const body = new Promise<{owner: string}>(resolve => { finish = resolve; });
  const task = sessionAbortable(() => body, deadline.signal);
  await Promise.resolve();
  deadline.abort(new DOMException("Deadline reached", "TimeoutError"));
  await assert.rejects(task, { name: "TimeoutError" });
  finish({ owner: "fixture-a" });
  await Promise.resolve();
});

test("current sessions preserve results and errors without sharing cancellation", async () => {
  const old = new AbortController();
  const current = new AbortController();
  old.abort();
  assert.deepEqual(await sessionAbortable(async () => ({owner: "fixture-b"}), current.signal), {owner: "fixture-b"});
  const error = new Error("fixture provider unavailable");
  await assert.rejects(sessionAbortable(async () => { throw error; }, current.signal), caught => caught === error);
});
