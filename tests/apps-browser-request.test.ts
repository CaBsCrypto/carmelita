import assert from "node:assert/strict";
import test from "node:test";
import { requestOwnedAppJson } from "../app/apps/browser-request";
test("an account change while waiting for a token cannot send the prior account's change", async () => {
  let active = true, send = 0, finish!: (token: string) => void;
  const result = requestOwnedAppJson("/api/agent/apps", { operation: "confirm" }, { active: () => active, getToken: () => new Promise(resolve => { finish = resolve; }), fetcher: async () => { send++; return Response.json({}); } });
  active = false; finish("synthetic"); await assert.rejects(result, /apps_session_changed/); assert.equal(send, 0);
});
test("a prior account's late response is discarded even when its transport ignores abort", async () => {
  let active = true, finish!: (value: Response) => void;
  const result = requestOwnedAppJson("/api/agent/apps", undefined, { active: () => active, getToken: async () => "synthetic", fetcher: () => new Promise(resolve => { finish = resolve; }) });
  await new Promise(resolve => setTimeout(resolve, 0)); active = false; finish(Response.json({ private: "synthetic-prior-owner" })); await assert.rejects(result, /apps_session_changed/);
});
test("token and response-body deadlines end the request without replaying mutations", async () => {
  let sent = 0;
  await assert.rejects(requestOwnedAppJson("/api/agent/apps", {}, { active: () => true, timeoutMs: 5, getToken: () => new Promise(() => {}), fetcher: async () => { sent++; return Response.json({}); } }), /apps_request_timeout/); assert.equal(sent, 0);
  await assert.rejects(requestOwnedAppJson("/api/agent/apps", {}, { active: () => true, timeoutMs: 5, getToken: async () => "synthetic", fetcher: async () => { sent++; return new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } }); } }), /apps_request_timeout/); assert.equal(sent, 1);
});
