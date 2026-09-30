import { WALLET_NETWORKS } from "../wallets/networks";
import { describeBridgeRoute } from "./routes";

// Read-only deployment check. It never signs, sends or treats documentation as RPC evidence.
export async function verifyBridgeEvmEndpoint(network: "avalanche:fuji" | "base:sepolia", fetcher: typeof fetch = fetch) {
  const endpoint = describeBridgeRoute(network, "stellar:testnet").source;
  let id = 0;
  async function rpc(method: string, params: unknown[]) {
    const requestId = ++id;
    const response = await fetcher(WALLET_NETWORKS[network].rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("bridge_rpc_unavailable");
    const body = await response.text();
    if (body.length > 128 * 1024) throw new Error("bridge_rpc_response_too_large");
    const result = JSON.parse(body);
    if (result.jsonrpc !== "2.0" || result.id !== requestId || result.error || typeof result.result !== "string") {
      throw new Error("bridge_rpc_response_invalid");
    }
    return result.result as string;
  }
  try {
    const chain = await rpc("eth_chainId", []);
    if (!/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== BigInt(endpoint.chainId!)) {
      throw new Error("bridge_rpc_chain_mismatch");
    }
    const addresses = [endpoint.asset!.identifier, ...Object.values(endpoint.contracts!)];
    for (const address of addresses) {
      const code = await rpc("eth_getCode", [address, "latest"]);
      if (!/^0x(?:[0-9a-f]{2})+$/i.test(code) || code === "0x00") {
        throw new Error("bridge_contract_not_deployed");
      }
    }
    return { network, status: "deployment_observed" as const, checkedAt: new Date().toISOString(),
      contractsChecked: addresses.length, acceptedOnchain: false, executionEnabled: false };
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("bridge_")
      ? error.message : "bridge_rpc_unavailable";
    return { network, status: "unavailable" as const, error: code, acceptedOnchain: false, executionEnabled: false };
  }
}
