import { decodeFunctionResult, encodeFunctionData } from "viem";
import type { Eip712TypedData } from "@/app/x402-avalanche/privy";

export const AAVE_V3_FUJI_POOL = "0xb47673b7a73D78743AFF1487AF69dBB5763F00cA" as const;
export const AAVE_USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
export const USDC_EIP712_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 43113,
  verifyingContract: AAVE_USDC_FUJI,
} as const;

export type UsdcPermitTypedData = Eip712TypedData & {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
};

const FUJI_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc" as const;
const AAVE_FUJI_TIMEOUT_MS = 10_000;
const NONCES_SELECTOR = "0x7ecebe00" as const;
const ALLOWANCE_SELECTOR = "0xdd62ed3e" as const;
const SIMULATION_REVERT_MESSAGE_MAX = 120;

const supplyWithPermitAbi = [{
  type: "function",
  name: "supplyWithPermit",
  stateMutability: "nonpayable",
  inputs: [
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "onBehalfOf", type: "address" },
    { name: "referralCode", type: "uint16" },
    { name: "deadline", type: "uint256" },
    { name: "permitV", type: "uint8" },
    { name: "permitR", type: "bytes32" },
    { name: "permitS", type: "bytes32" },
  ],
  outputs: [],
}] as const;

const withdrawAbi = [{
  type: "function",
  name: "withdraw",
  stateMutability: "nonpayable",
  inputs: [
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "to", type: "address" },
  ],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const noncesAbi = [{
  type: "function",
  name: "nonces",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const allowanceAbi = [{
  type: "function",
  name: "allowance",
  stateMutability: "view",
  inputs: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
  ],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

async function rpc<T>(
  method: string,
  params: unknown[],
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(FUJI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (
      error.name === "TimeoutError" || error.name === "AbortError"
    )) {
      throw new Error("aave_rpc_timeout");
    }
    throw new Error("aave_rpc_unreachable");
  }
  if (!response.ok) throw new Error(`aave_rpc_http_${response.status}`);
  const payload = await response.json() as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (payload.error) throw new Error(`aave_rpc_failed:${payload.error.message}`);
  if (payload.result === undefined) throw new Error("aave_rpc_result_invalid");
  return payload.result;
}

function rpcRead(
  to: string,
  calldata: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  return rpc<`0x${string}`>("eth_call", [{ to, data: calldata }, "latest"], fetcher, signal);
}

function padAddress(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function buildUsdcPermitTypedData(input: {
  owner: string;
  spender: string;
  valueAtomic: string;
  nonce: string;
  deadline: number;
}): UsdcPermitTypedData {
  return {
    domain: {
      name: USDC_EIP712_DOMAIN.name,
      version: USDC_EIP712_DOMAIN.version,
      chainId: USDC_EIP712_DOMAIN.chainId,
      verifyingContract: USDC_EIP712_DOMAIN.verifyingContract,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ] as const,
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ] as const,
    },
    primaryType: "Permit",
    message: {
      owner: input.owner,
      spender: input.spender,
      value: input.valueAtomic,
      nonce: input.nonce,
      deadline: BigInt(input.deadline).toString(),
    },
  };
}

export function splitPermitSignature(signature: `0x${string}`): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    throw new Error("invalid_permit_signature");
  }
  const r = `0x${signature.slice(2, 66).toLowerCase()}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130).toLowerCase()}` as `0x${string}`;
  let v = parseInt(signature.slice(130), 16);
  // Wallets may sign v as 0/1; ecrecover in Aave needs 27/28, so normalize.
  if (v === 0 || v === 1) v += 27;
  return { v, r, s };
}

export function encodeAaveSupplyWithPermit(input: {
  amountAtomic: string;
  onBehalfOf: string;
  referralCode: number;
  deadline: number;
  permitV: number;
  permitR: `0x${string}`;
  permitS: `0x${string}`;
}): string {
  return encodeFunctionData({
    abi: supplyWithPermitAbi,
    functionName: "supplyWithPermit",
    args: [
      AAVE_USDC_FUJI,
      BigInt(input.amountAtomic),
      input.onBehalfOf as `0x${string}`,
      input.referralCode,
      BigInt(input.deadline),
      input.permitV,
      input.permitR,
      input.permitS,
    ],
  });
}

export function encodeAaveWithdraw(input: {
  amountAtomic: string;
  to: string;
}): string {
  return encodeFunctionData({
    abi: withdrawAbi,
    functionName: "withdraw",
    args: [
      AAVE_USDC_FUJI,
      BigInt(input.amountAtomic),
      input.to as `0x${string}`,
    ],
  });
}

export async function getUsdcNonce(
  owner: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const signal = AbortSignal.timeout(AAVE_FUJI_TIMEOUT_MS);
  const calldata = `${NONCES_SELECTOR}${padAddress(owner)}`;
  const hex = await rpcRead(AAVE_USDC_FUJI, calldata, fetcher, signal);
  const nonce = decodeFunctionResult({
    abi: noncesAbi,
    functionName: "nonces",
    data: hex,
  });
  return nonce.toString();
}

export async function getUsdcAllowance(
  owner: string,
  spender: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const signal = AbortSignal.timeout(AAVE_FUJI_TIMEOUT_MS);
  const calldata = `${ALLOWANCE_SELECTOR}${padAddress(owner)}${padAddress(spender)}`;
  const hex = await rpcRead(AAVE_USDC_FUJI, calldata, fetcher, signal);
  const allowance = decodeFunctionResult({
    abi: allowanceAbi,
    functionName: "allowance",
    data: hex,
  });
  return allowance.toString();
}

export async function simulateAaveSupplyWithPermit(input: {
  from: string;
  calldata: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const signal = AbortSignal.timeout(AAVE_FUJI_TIMEOUT_MS);
  try {
    await rpc<`0x${string}`>(
      "eth_call",
      [{ from: input.from, to: AAVE_V3_FUJI_POOL, data: input.calldata }, "latest"],
      fetcher,
      signal,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("aave_rpc_failed:")) throw error;
    const nodeMessage = message.slice("aave_rpc_failed:".length);
    const trimmed = nodeMessage.length > SIMULATION_REVERT_MESSAGE_MAX
      ? `${nodeMessage.slice(0, SIMULATION_REVERT_MESSAGE_MAX - 3)}...`
      : nodeMessage;
    throw new Error(`aave_supply_permit_simulation_reverted:${trimmed}`);
  }
}
