import { decodeFunctionResult, encodeFunctionData } from "viem";
import { z } from "zod";
import { FUJI_RPC_URL, FUJI_CHAIN_ID, ECOSYSTEM_TIMEOUT_MS, ECOSYSTEM_MAX_RESPONSE_BYTES } from "@/app/connectors/avalanche-ecosystem";

const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395" as const;
const JOEPEGS_MANAGER = "0x06f90fd0cf697775b66cb51fbaa62c6a5b70eef6" as const;
const JOEPEGS_STRATEGY = "0xdb9660c436dec824b379c59e2411c71f548f76a7" as const;
const whitelistAbi = [{ type: "function", name: "isStrategyWhitelisted", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] }] as const;
const rpcResult = z.object({ result: z.string().regex(/^0x(?:[\da-f]{2})*$/i) });

async function readRpc(method: "eth_getCode" | "eth_call", params: unknown[], fetcher: typeof fetch, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetcher(FUJI_RPC_URL, {
      method: "POST", headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", credentials: "omit", redirect: "error", signal,
    });
  } catch { throw new Error("ecosystem_rpc_unreachable"); }
  if (!response.ok) throw new Error(`ecosystem_rpc_http_${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("ecosystem_rpc_result_invalid");
  if (Number(response.headers.get("content-length")) > ECOSYSTEM_MAX_RESPONSE_BYTES || !response.body) throw new Error("ecosystem_rpc_result_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > ECOSYSTEM_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("ecosystem_response_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("ecosystem_rpc_result_invalid"); }
  const parsed = rpcResult.safeParse(payload);
  if (!parsed.success) throw new Error("ecosystem_rpc_result_invalid");
  return parsed.data.result;
}

/** A failed probe is unknown, never proof that a deployment is absent. */
export async function readFujiNftVenue(fetcher: typeof fetch = fetch) {
  const signal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS);
  const [code, whitelist] = await Promise.allSettled([
    readRpc("eth_getCode", [SEAPORT, "latest"], fetcher, signal),
    readRpc("eth_call", [{ to: JOEPEGS_MANAGER, data: encodeFunctionData({ abi: whitelistAbi, functionName: "isStrategyWhitelisted", args: [JOEPEGS_STRATEGY] }) }, "latest"], fetcher, signal)
      .then((result) => decodeFunctionResult({ abi: whitelistAbi, functionName: "isStrategyWhitelisted", data: result as `0x${string}` })),
  ]);
  const errors: string[] = [];
  if (code.status === "rejected") errors.push("seaport_deployment_probe_unavailable");
  if (whitelist.status === "rejected") errors.push("joepegs_configuration_probe_unavailable");
  return {
    status: errors.length === 2 ? "unavailable" : errors.length ? "partial" : "ok",
    network: "avalanche:fuji", chainId: FUJI_CHAIN_ID, source: FUJI_RPC_URL, readOnly: true, fetchedAt: new Date().toISOString(),
    seaport1_6: { address: SEAPORT, deployed: code.status === "fulfilled" ? code.value !== "0x" : null, activity: "not_measured" },
    joepegs: { strategyWhitelisted: whitelist.status === "fulfilled" ? whitelist.value : null, activity: "not_measured", caveat: "Upgradeable proxy; deployment/configuration does not prove activity." },
    errors,
  };
}
