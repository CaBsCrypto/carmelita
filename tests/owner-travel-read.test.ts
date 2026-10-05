import assert from "node:assert/strict";
import test from "node:test";
import { requestTravelSearch } from "../app/agent/travel-search-request";

const input = { location: "Santiago", checkIn: "2026-12-10", checkOut: "2026-12-11", guests: 1 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("a changed owner while obtaining a token cannot issue the old travel request", async () => {
  const token = deferred<string | null>();
  const controller = new AbortController();
  let reads = 0;
  const pending = requestTravelSearch(input, () => token.promise, controller.signal, async () => { reads++; return Response.json({ hotels: [] }); });
  controller.abort();
  token.resolve("fixture-not-a-credential");
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(reads, 0);
});

test("a late prior-owner response is discarded while the current owner's search remains usable", async () => {
  const priorBody = deferred<unknown>();
  const started = deferred<void>();
  const controller = new AbortController();
  const prior = requestTravelSearch(input, async () => "fixture-not-a-credential", controller.signal, async (_url, init) => {
    assert.ok(init?.signal && !init.signal.aborted);
    assert.notEqual(init.signal, controller.signal, "The owner signal is combined with a complete request deadline");
    assert.equal(init?.method, "POST");
    started.resolve();
    return { ok: true, json: () => priorBody.promise } as Response;
  });
  await started.promise;
  controller.abort();
  const current = await requestTravelSearch(input, async () => "fixture-not-a-credential", new AbortController().signal, async () => Response.json({ hotels: [{ name: "Current owner search" }] }));
  priorBody.resolve({ hotels: [{ name: "Prior owner selection" }] });
  await assert.rejects(prior, { name: "AbortError" });
  assert.deepEqual(current, { hotels: [{ name: "Current owner search" }] });
});

test("aborted error responses do not leak an old search error into the current workspace", async () => {
  const controller = new AbortController();
  await assert.rejects(requestTravelSearch(input, async () => "fixture-not-a-credential", controller.signal, async () => {
    controller.abort();
    return Response.json({ error: "Previous owner failure" }, { status: 500 });
  }), { name: "AbortError" });
});
