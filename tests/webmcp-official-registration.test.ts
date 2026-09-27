import assert from "node:assert/strict";
import test from "node:test";
import { parseSolanaFundingRequest } from "../app/wallets/solana-funding-request";
import { detectWebMcpStatus, registerCarmelitaWebMcpTools, type WebMcpToolDefinition } from "../app/webmcp-client";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test("WebMCP is optional outside a supported browser", () => {
  assert.equal(detectWebMcpStatus().supported, false);
});
test("wallet tools use current credentials, report failures and clean up without duplicates", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const tools = new Map<string, WebMcpToolDefinition>();
  const controller = new AbortController();
  let token: string | null = null;
  let requests = 0;
  let authorization: string | null = null;
  // @ts-expect-error Minimal browser fixture
  globalThis.document = { modelContext: {
    registerTool: (tool: WebMcpToolDefinition) => {
      assert.equal(tools.has(tool.name), false);
      tools.set(tool.name, tool);
    },
    unregisterTool: (name: string) => { tools.delete(name); },
  } };
  globalThis.fetch = async (_url, init) => {
    requests++;
    authorization = new Headers(init?.headers).get("Authorization");
    return new Response('{}', { status: 401 });
  };
  try {
    const status = await registerCarmelitaWebMcpTools(async () => token, controller.signal);
    assert.equal(status.toolsRegistered.length, 2);
    assert.equal(tools.has("carmelita_fund_solana_devnet"), false);
    const read = tools.get("carmelita_get_multichain_wallets")!;
    assert.equal((await read.execute({})).isError, true);
    assert.equal(requests, 0);
    token = "current-test-token";
    assert.equal((await read.execute({})).isError, true);
    assert.equal(authorization, "Bearer current-test-token");
    await registerCarmelitaWebMcpTools(async () => token, controller.signal);
    assert.equal(tools.size, 2);
    assert.equal((await read.execute({})).isError, true); // stale registration
    controller.abort();
    await tick();
    assert.equal(tools.size, 0);
  } finally {
    controller.abort();
    await tick();
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  }
});
test("aborting during asynchronous registration removes the late tool", async () => {
  const originalDocument = globalThis.document;
  const controller = new AbortController();
  const tools = new Map<string, WebMcpToolDefinition>();
  // @ts-expect-error Minimal browser fixture
  globalThis.document = { modelContext: {
    registerTool: async (tool: WebMcpToolDefinition) => { tools.set(tool.name, tool); controller.abort(); },
    unregisterTool: (name: string) => { tools.delete(name); },
  } };
  try {
    const status = await registerCarmelitaWebMcpTools(async () => null, controller.signal);
    await tick();
    assert.equal(tools.size, 0);
    assert.deepEqual(status.toolsRegistered, []);
  } finally { globalThis.document = originalDocument; }
});
test("faucet rejects malformed JSON, absent confirmation and out-of-range amounts", async () => {
  for (const body of ['{', '{}', '{"explicitUserConfirmation":false}', '{"explicitUserConfirmation":true,"solAmount":3}']) {
    await assert.rejects(parseSolanaFundingRequest(new Request('https://example.test', { method: 'POST', body })));
  }
  assert.deepEqual(await parseSolanaFundingRequest(new Request('https://example.test', {
    method: 'POST', body: '{"explicitUserConfirmation":true}',
  })), { explicitUserConfirmation: true, solAmount: 1 });
});

test("native signal-only registration cleans up and cancelled calls do not fetch", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const tools = new Map<string, WebMcpToolDefinition>();
  // @ts-expect-error Minimal current-spec browser fixture
  globalThis.document = { modelContext: {
    registerTool: (tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }) => {
      assert.equal(tools.has(tool.name), false);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true });
    },
  } };
  globalThis.fetch = async () => { throw new Error('network test'); };
  try {
    await registerCarmelitaWebMcpTools(async () => 'test-token', controller.signal);
    const read = tools.get('carmelita_get_solana_status')!;
    assert.equal((await read.execute({})).isError, true);
    const cancelled = AbortSignal.abort();
    assert.match((await read.execute({}, { signal: cancelled })).content[0].text, /inactive/);
    await registerCarmelitaWebMcpTools(async () => 'test-token', controller.signal);
    assert.equal(tools.size, 2);
    controller.abort();
    await tick();
    assert.equal(tools.size, 0);
  } finally { controller.abort(); await tick(); globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});
