import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import { readTempoWallet } from "../app/wallets/tempo";
import { TEMPO_MODERATO_TOKEN } from "../app/wallets/networks";
import type { TempoWalletReading } from "../app/wallets/types";

const address = `0x${"a".repeat(40)}`;
const block = { number: "0x123", hash: `0x${"b".repeat(64)}`, timestamp: "0x6553f100" };
type RpcRequest = { id: number; method: string; params: unknown[] };

function rpcFixture(options: {
  chain?: unknown; block?: unknown; code?: unknown; balance?: unknown;
  decimals?: number; name?: string; symbol?: string;
  intercept?: (request: RpcRequest) => Response | undefined;
} = {}) {
  const calls: RpcRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://rpc.moderato.tempo.xyz");
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal, "every real request needs a deadline or cancellation signal");
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    calls.push(request);
    const intercepted = options.intercept?.(request);
    if (intercepted) return intercepted;
    let result: unknown;
    if (request.method === "eth_chainId") result = options.chain ?? "0xa5bf";
    else if (request.method === "eth_getBlockByNumber") {
      assert.deepEqual(request.params, ["latest", false]);
      result = "block" in options ? options.block : block;
    } else if (request.method === "eth_getCode") {
      assert.equal(String(request.params[0]).toLowerCase(), TEMPO_MODERATO_TOKEN.address);
      assert.equal(request.params[1], block.number);
      result = options.code ?? "0xef";
    } else if (request.method === "eth_call") {
      const call = request.params[0] as { to: string; data: string };
      assert.equal(call.to.toLowerCase(), TEMPO_MODERATO_TOKEN.address);
      assert.equal(request.params[1], block.number, "metadata and balance must use the same explicit block");
      const selector = call.data.slice(0, 10);
      if (selector === "0x313ce567") result = encodeAbiParameters([{ type: "uint256" }], [BigInt(options.decimals ?? 6)]);
      else if (selector === "0x06fdde03") result = encodeAbiParameters([{ type: "string" }], [options.name ?? "PathUSD"]);
      else if (selector === "0x95d89b41") result = encodeAbiParameters([{ type: "string" }], [options.symbol ?? "PathUSD"]);
      else {
        assert.equal(call.data, `0x70a08231${address.slice(2).padStart(64, "0")}`);
        result = "balance" in options ? options.balance : encodeAbiParameters([{ type: "uint256" }], [0n]);
      }
    } else assert.fail(`unexpected RPC method ${request.method}: a read must never send or sign`);
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
  return { fetcher, calls };
}

function failed(reading: TempoWalletReading) {
  assert.notEqual(reading.status, "available");
  assert.equal(reading.token, null);
  assert.equal(reading.block, null);
  assert.equal("chainId" in reading, false, "a failed read cannot claim a verified chain ID");
  assert.doesNotMatch(JSON.stringify(reading), /provider-secret|Bearer fixture|private-wallet-id/);
}

test("real-zero shaped RPC response remains zero with verified chain, metadata and one pinned block", async () => withEnabledTempo(async () => {
  const { fetcher, calls } = rpcFixture();
  const reading = await readTempoWallet(address, { fetch: fetcher });
  assert.equal(reading.status, "available");
  if (reading.status !== "available") assert.fail("expected an available Tempo reading");
  assert.equal(reading.network, "tempo:moderato");
  assert.equal(reading.testnet, true);
  assert.equal(reading.caip2, "eip155:42431");
  assert.equal(reading.chainId, 42431);
  assert.equal(reading.address.toLowerCase(), address);
  assert.equal(BigInt(reading.block.number), 291n);
  assert.equal(reading.block.hash, block.hash);
  assert.equal(reading.block.timestamp, "1700000000");
  assert.ok(Number.isFinite(Date.parse(reading.queriedAt)));
  assert.equal(reading.explorerUrl, `https://explore.testnet.tempo.xyz/address/${address}`);
  assert.deepEqual(reading.token, { ...TEMPO_MODERATO_TOKEN, balanceAtomic: "0", balance: "0", metadataVerified: true });
  assert.equal(calls[0].method, "eth_chainId");
  assert.equal(calls[1].method, "eth_getBlockByNumber");
  assert.ok(calls.some(call => call.method === "eth_getCode"));
  assert.equal(calls.some(call => call.method === "eth_getBalance"), false);
}));

test("TIP-20 amounts beyond Number precision survive as exact atomic and decimal strings", async () => withEnabledTempo(async () => {
  const { fetcher } = rpcFixture({ balance: encodeAbiParameters([{ type: "uint256" }], [90071992547409931234567n]) });
  const reading = await readTempoWallet(address, { fetch: fetcher });
  assert.equal(reading.status, "available");
  if (reading.status !== "available") assert.fail("expected an available Tempo reading");
  assert.equal(reading.token.balanceAtomic, "90071992547409931234567");
  assert.equal(reading.token.balance, "90071992547409931.234567");
  assert.equal(typeof reading.token.balanceAtomic, "string");
  assert.equal(typeof reading.token.balance, "string");
}));

test("another chain, including Tempo mainnet, stops before block and token reads", async () => withEnabledTempo(async () => {
  for (const chain of ["0x1079", "0xa869", "0x1"]) {
    const { fetcher, calls } = rpcFixture({ chain });
    const reading = await readTempoWallet(address, { fetch: fetcher });
    failed(reading);
    assert.equal(reading.status, "wrong_network");
    if (reading.status === "available") assert.fail("wrong chain was accepted");
    assert.equal(reading.error.code, "tempo_wrong_chain");
    assert.deepEqual(calls.map(call => call.method), ["eth_chainId"]);
  }
}));

test("malformed chain or block responses cannot claim balance or verified network", async () => withEnabledTempo(async () => {
  const cases = [
    { chain: true }, { chain: "42431" }, { block: null },
    { block: { ...block, number: "0x" } }, { block: { ...block, timestamp: null } },
    { block: { ...block, hash: "0x1234" } },
  ];
  for (const scenario of cases) {
    const { fetcher } = rpcFixture(scenario);
    failed(await readTempoWallet(address, { fetch: fetcher }));
  }
}));

test("token code and exact on-chain metadata are verified before a successful token read", async () => withEnabledTempo(async () => {
  for (const scenario of [{ code: "0x" }, { decimals: 18 }, { symbol: "USDC" }, { name: "Another token" }]) {
    const { fetcher } = rpcFixture(scenario);
    const reading = await readTempoWallet(address, { fetch: fetcher });
    failed(reading);
    assert.equal(reading.status, "unavailable");
  }
}));

test("malformed balance words and JSON-RPC errors at HTTP 200 never become zero", async () => withEnabledTempo(async () => {
  for (const balance of [true, null, "0x", "0x0", `0x${"f".repeat(63)}`, `0x${"f".repeat(65)}`]) {
    const { fetcher } = rpcFixture({ balance });
    failed(await readTempoWallet(address, { fetch: fetcher }));
  }
  const { fetcher } = rpcFixture({ intercept: request => request.method === "eth_chainId"
    ? Response.json({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "provider-secret" } }) : undefined });
  failed(await readTempoWallet(address, { fetch: fetcher }));
}));

test("transport failure and a genuine elapsed timeout return sanitized unavailability", async () => withEnabledTempo(async () => {
  failed(await readTempoWallet(address, { fetch: async () => { throw new Error("provider-secret Bearer fixture"); } }));
  const stalled: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider-secret stalled request exceeded test ceiling")), 500);
    const abort = () => { clearTimeout(timer); reject(init?.signal?.reason ?? new DOMException("aborted", "AbortError")); };
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
  });
  const reading = await readTempoWallet(address, { fetch: stalled, timeoutMs: 15 });
  failed(reading);
  if (reading.status === "available") assert.fail("stalled RPC was accepted");
  assert.equal(reading.error.code, "tempo_rpc_timeout");
}));

test("disabled feature and invalid wallet address do not contact RPC", async () => withEnabledTempo(async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; assert.fail("RPC should not be reached"); };
  process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "false";
  const disabled = await readTempoWallet(address, { fetch: fetcher });
  failed(disabled);
  assert.equal(disabled.status, "disabled");
  process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "true";
  failed(await readTempoWallet("not-an-EVM-address", { fetch: fetcher }));
  assert.equal(calls, 0);
}));

async function withEnabledTempo(run: () => Promise<void>) {
  const env = { CARMELITA_TEMPO_TESTNET_ENABLED: "true", CARMELITA_PREVIEW_ISOLATED: "true", VERCEL_ENV: "preview" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
