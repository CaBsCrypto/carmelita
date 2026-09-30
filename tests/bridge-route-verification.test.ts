import assert from "node:assert/strict";
import test from "node:test";
import { verifyBridgeEvmEndpoint } from "../app/cctp/route-verification";

function mock(chain: string, code = "0x6000", methods: string[] = []) {
  return (async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    methods.push(request.method);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: request.method === "eth_chainId" ? chain : code });
  }) as typeof fetch;
}

test("EVM deployment checks pin Testnet chain ID before reading contracts", async () => {
  for (const [network, chain] of [["avalanche:fuji", "0xa869"], ["base:sepolia", "0x14a34"]] as const) {
    const methods: string[] = [];
    const result = await verifyBridgeEvmEndpoint(network, mock(chain, "0x6000", methods));
    assert.equal(result.status, "deployment_observed");
    assert.equal(result.executionEnabled, false);
    assert.deepEqual(methods, ["eth_chainId", "eth_getCode", "eth_getCode", "eth_getCode"]);
  }
});

test("Mainnet and other Testnets stop before reading any contract", async () => {
  for (const chain of ["0x1", "0x2105", "0x61"]) {
    const methods: string[] = [];
    const result = await verifyBridgeEvmEndpoint("base:sepolia", mock(chain, "0x6000", methods));
    assert.equal(result.error, "bridge_rpc_chain_mismatch");
    assert.deepEqual(methods, ["eth_chainId"]);
  }
});

test("empty contracts, invalid RPC and timeout are localized errors", async () => {
  assert.equal((await verifyBridgeEvmEndpoint("base:sepolia", mock("0x14a34", "0x"))).error, "bridge_contract_not_deployed");
  assert.equal((await verifyBridgeEvmEndpoint("base:sepolia", async () => Response.json({ result: "0x14a34" }))).error, "bridge_rpc_response_invalid");
  assert.equal((await verifyBridgeEvmEndpoint("base:sepolia", async () => { throw new DOMException("private endpoint data", "TimeoutError"); })).error, "bridge_rpc_unavailable");
});
