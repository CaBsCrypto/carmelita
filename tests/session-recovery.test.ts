import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_TIMEOUT_MS, CONVERSATION_TIMEOUT_MS, WORKSPACE_TIMEOUT_MS, WALLET_BOOTSTRAP_TIMEOUT_MS, requestAgentConversation, requestWalletBootstrap } from "../app/agent/session-request";
import { requestAgentChat } from "../app/agent/chat-request";
import { readWorkspaceQuery } from "../app/agent/workspace-queries";
import { requestTravelSearch } from "../app/agent/travel-search-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const travel = { location: "Santiago", checkIn: "2026-12-10", checkOut: "2026-12-11", guests: 1 };
type Reader = (getToken: () => Promise<string | null>, signal: AbortSignal, fetcher: typeof fetch, timeout: number) => Promise<unknown>;
const readers: [string, Reader][] = [
  ["chat", (token, signal, fetcher, timeout) => requestAgentChat("retained draft", "es", token, signal, fetcher, timeout)],
  ["workspace", (token, signal, fetcher, timeout) => readWorkspaceQuery("personal.wallets", token, "es", signal, fetcher, timeout)],
  ["Travala", (token, signal, fetcher, timeout) => requestTravelSearch(travel, token, signal, fetcher, timeout)],
  ["conversation", (token, signal, fetcher, timeout) => requestAgentConversation(token, signal, fetcher, timeout)],
  ["bootstrap", (token, signal, fetcher, timeout) => requestWalletBootstrap("current-owner", token, async () => {}, signal, fetcher, timeout)],
];

test("the agreed budgets cover conversation, sending and workspace preparation", () => {
  assert.equal(CONVERSATION_TIMEOUT_MS, 15_000);
  assert.equal(CHAT_TIMEOUT_MS, 30_000);
  assert.equal(WORKSPACE_TIMEOUT_MS, 20_000);
  assert.equal(WALLET_BOOTSTRAP_TIMEOUT_MS, 60_000);
});

test("automatic wallet activation can finish after a workspace query expires without extending query budgets", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const bootstrapFetch = deferred<Response>();
  const bootstrapStarted = deferred<void>();
  const queryStarted = deferred<void>();
  let settled = false;
  const bootstrap = requestWalletBootstrap("current-owner", async () => "owner-token", async () => {}, new AbortController().signal, async () => {
    bootstrapStarted.resolve();
    return bootstrapFetch.promise;
  });
  void bootstrap.then(() => { settled = true; }, () => { settled = true; });
  const query = readWorkspaceQuery("personal.wallets", async () => "owner-token", "es", new AbortController().signal, async () => {
    queryStarted.resolve();
    return new Promise<Response>(() => {});
  });
  const queryExpired = assert.rejects(query, { name: "TimeoutError" });
  await Promise.all([bootstrapStarted.promise, queryStarted.promise]);
  context.mock.timers.tick(20_001);
  await queryExpired;
  assert.equal(settled, false, "Wallet activation still has its own remaining budget");
  const prepared = { user: { id: "current-owner" }, activation: "pending", testnetActivation: { activation: "pending", fundsMoved: null, retryable: true } };
  bootstrapFetch.resolve(Response.json(prepared));
  assert.deepEqual(await bootstrap, prepared);
});

for (const [name, read] of readers) {
  test(name + " bounds a never-ending token and cannot dispatch after its late resolution", async () => {
    const token = deferred<string | null>();
    let calls = 0;
    await assert.rejects(read(() => token.promise, new AbortController().signal, async () => { calls++; return Response.json({}); }, 10), { name: "TimeoutError" });
    token.resolve("late-old-owner-token");
    await tick();
    assert.equal(calls, 0);
  });

  test(name + " bounds fetch and body promises even if they ignore cancellation", async () => {
    for (const stage of ["fetch", "body"]) {
      let signal: AbortSignal | null | undefined;
      let calls = 0;
      await assert.rejects(read(async () => "synthetic-token", new AbortController().signal, async (_url, init) => {
        calls++; signal = init?.signal;
        if (stage === "fetch") return new Promise<Response>(() => {});
        return { ok: true, json: () => new Promise(() => {}) } as Response;
      }, 10), { name: "TimeoutError" });
      assert.equal(calls, 1);
      assert.equal(signal?.aborted, true);
    }
  });

  test(name + " rejects immediately on owner cancellation without waiting for its body", async () => {
    const owner = new AbortController();
    const body = deferred<unknown>();
    const started = deferred<void>();
    const pending = read(async () => "synthetic-token", owner.signal, async () => {
      started.resolve(); return { ok: true, json: () => body.promise } as Response;
    }, 1000);
    await started.promise;
    owner.abort();
    await assert.rejects(pending, { name: "AbortError" });
    body.resolve({ messages: ["old owner"], user: { id: "old-owner" }, wallets: ["old-owner-wallet"] });
    await tick();
  });
}

test("bootstrap bounds refreshUser under the original budget and does not publish a late refreshed identity", async () => {
  const refresh = deferred<void>();
  let refreshes = 0;
  const pending = requestWalletBootstrap("current-owner", async () => "synthetic-token", () => { refreshes++; return refresh.promise; }, new AbortController().signal, async (_url, init) => {
    assert.equal(init?.body, undefined, "An owner selector must never be posted");
    return Response.json({ user: { id: "current-owner" }, wallets: ["registered"] });
  }, 10);
  await assert.rejects(pending, { name: "TimeoutError" });
  refresh.resolve();
  await tick();
  assert.equal(refreshes, 1);
});

test("a bootstrap reply for another owner fails before refreshing the SDK identity", async () => {
  let refreshes = 0;
  await assert.rejects(requestWalletBootstrap("current-owner", async () => "synthetic-token", async () => { refreshes++; }, new AbortController().signal, async () => Response.json({ user: { id: "another-owner" } })), { message: "wallet_response_mismatch" });
  assert.equal(refreshes, 0);
});

test("owner cancellation during identity refresh releases immediately and cannot publish into a later owner's bootstrap", async () => {
  const owner = new AbortController();
  const started = deferred<void>();
  const oldRefresh = deferred<void>();
  const old = requestWalletBootstrap("old-owner", async () => "old-token", () => { started.resolve(); return oldRefresh.promise; }, owner.signal, async () => Response.json({ user: { id: "old-owner" } }), 1000);
  await started.promise;
  owner.abort();
  await assert.rejects(old, { name: "AbortError" });
  const current = await requestWalletBootstrap("new-owner", async () => "new-token", async () => {}, new AbortController().signal, async () => Response.json({ user: { id: "new-owner" }, wallets: ["new-owner-wallet"] }));
  oldRefresh.resolve();
  await tick();
  assert.deepEqual(current, { user: { id: "new-owner" }, wallets: ["new-owner-wallet"] });
});

test("conversation retry obtains a fresh token and succeeds without waiting for the first stalled token", async () => {
  const oldToken = deferred<string | null>();
  let calls = 0;
  const fetcher: typeof fetch = async url => {
    calls++;
    return Response.json(String(url) === "/api/agent/chat" ? { messages: [{ content: "current owner's persisted history" }] } : { connections: [] });
  };
  await assert.rejects(requestAgentConversation(() => oldToken.promise, new AbortController().signal, fetcher, 10), { name: "TimeoutError" });
  const current = await requestAgentConversation(async () => "current-owner-token", new AbortController().signal, fetcher, 1000);
  assert.deepEqual(current.messages, [{ content: "current owner's persisted history" }]);
  oldToken.resolve("old-owner-token");
  await tick();
  assert.equal(calls, 2);
});

test("connection discovery shares the conversation deadline instead of adding another fifteen seconds", async () => {
  let calls = 0;
  await assert.rejects(requestAgentConversation(async () => "synthetic-token", new AbortController().signal, async url => {
    calls++;
    return String(url) === "/api/agent/chat" ? Response.json({ messages: [] }) : new Promise<Response>(() => {});
  }, 10), { name: "TimeoutError" });
  assert.equal(calls, 2);
});

test("history recovery after a lost send response is GET-only and retrieves the persisted message without resending it", async () => {
  const late = deferred<unknown>();
  const draft = "Private draft retained in the composer";
  const requests: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const method = init?.method || "GET";
    requests.push(method + " " + url);
    if (method === "POST") return { ok: true, json: () => late.promise } as Response;
    return Response.json(String(url) === "/api/agent/chat" ? { messages: [{ role: "user", content: draft }] } : { connections: [] });
  };
  await assert.rejects(requestAgentChat(draft, "es", async () => "owner-token", new AbortController().signal, fetcher, 10), { name: "TimeoutError" });
  const recovered = await requestAgentConversation(async () => "fresh-owner-token", new AbortController().signal, fetcher);
  late.resolve({ assistantMessage: { content: "old response" } });
  await tick();
  assert.deepEqual(recovered.messages, [{ role: "user", content: draft }]);
  assert.deepEqual(requests, ["POST /api/agent/chat", "GET /api/agent/chat", "GET /api/connections"]);
});

test("malformed conversation data is a recoverable error, while a verified empty history remains empty", async () => {
  await assert.rejects(requestAgentConversation(async () => "owner-token", new AbortController().signal, async () => Response.json({ messages: "invalid" })), { message: "conversation_response_invalid" });
  const empty = await requestAgentConversation(async () => "owner-token", new AbortController().signal, async url => Response.json(String(url) === "/api/agent/chat" ? { messages: [] } : { connections: [] }));
  assert.deepEqual(empty.messages, []);
});

test("an explicit chat retry preserves the original draft payload, while a late failed attempt cannot replace the new reply", async () => {
  const draft = "  Mi borrador privado conservado  ";
  const late = deferred<unknown>();
  const sent: string[] = [];
  const responseBody = { assistantMessage: { content: "new reply" }, userMessage: { content: draft.trim() } };
  const fetcher: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)).message);
    if (sent.length === 1) return { ok: true, json: () => late.promise } as Response;
    return Response.json(responseBody);
  };
  await assert.rejects(requestAgentChat(draft, "es", async () => "owner-token", new AbortController().signal, fetcher, 10), { name: "TimeoutError" });
  const result = await requestAgentChat(draft, "es", async () => "owner-token", new AbortController().signal, fetcher, 1000);
  late.resolve({ assistantMessage: { content: "stale reply" } });
  await tick();
  assert.deepEqual(sent, [draft, draft]);
  assert.deepEqual(result, responseBody);
});
