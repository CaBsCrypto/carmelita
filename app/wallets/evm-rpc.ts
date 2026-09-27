import type { WalletNetwork } from "@/app/wallets/networks";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// BigInt literals (1n) are unavailable at the repo's ES2017 tsconfig target.
const ZERO = BigInt(0);
const WEI_PER_ETHER = BigInt("1000000000000000000");

function formatUnits(value: bigint, decimals: number) {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatEther(value: bigint) {
  const whole = value / WEI_PER_ETHER;
  const fraction = (value % WEI_PER_ETHER).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseEther(value: string) {
  if (!/^\d+(?:\.\d{1,18})?$/.test(value)) throw new Error("invalid_evm_amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * WEI_PER_ETHER + BigInt(fraction.padEnd(18, "0"));
}

function hex(value: bigint) {
  return `0x${value.toString(16)}`;
}

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

async function rpc<T>(
  network: WalletNetwork,
  method: string,
  params: unknown[],
  fetcher: typeof fetch = fetch,
) {
  if (network.family !== "evm" || network.chainId === null) {
    throw new Error("evm_network_required");
  }
  const response = await fetcher(network.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`evm_rpc_http_${response.status}`);
  const payload = await response.json() as JsonRpcResponse<T>;
  if (payload.error || payload.result === undefined) {
    throw new Error(`evm_rpc_failed:${payload.error?.message ?? method}`);
  }
  return payload.result;
}

export async function diagnoseEvmWallet(
  network: WalletNetwork,
  address: string,
  fetcher: typeof fetch = fetch,
) {
  if (!EVM_ADDRESS.test(address)) throw new Error("invalid_evm_address");
  const [chainIdHex, balanceHex, gasPriceHex, nonceHex] = await Promise.all([
    rpc<string>(network, "eth_chainId", [], fetcher),
    rpc<string>(network, "eth_getBalance", [address, "latest"], fetcher),
    rpc<string>(network, "eth_gasPrice", [], fetcher),
    rpc<string>(network, "eth_getTransactionCount", [address, "latest"], fetcher),
  ]);
  // JSON-RPC quantities must be non-negative hex strings, never coerced numbers/null.
  if ([chainIdHex, balanceHex, gasPriceHex, nonceHex].some((value) =>
    typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))) {
    throw new Error("evm_rpc_invalid_quantity");
  }
  const observedChainId = Number(BigInt(chainIdHex));
  if (observedChainId !== network.chainId) throw new Error("evm_chain_id_mismatch");
  if (!Number.isSafeInteger(Number(BigInt(nonceHex)))) throw new Error("evm_rpc_invalid_quantity");

  const balanceWei = BigInt(balanceHex);
  return {
    network: network.id,
    chainId: observedChainId,
    address,
    balanceWei: balanceWei.toString(),
    balance: formatEther(balanceWei),
    nativeAsset: network.nativeAsset,
    gasPriceWei: BigInt(gasPriceHex).toString(),
    nonce: Number(BigInt(nonceHex)),
    funded: balanceWei > ZERO,
    explorerUrl: `${network.explorerUrl}/address/${address}`,
    faucetUrl: network.faucetUrl,
  };
}
export async function getErc20Balance(
  network: WalletNetwork,
  tokenAddress: string,
  walletAddress: string,
  decimals: number,
  fetcher: typeof fetch = fetch,
) {
  if (!EVM_ADDRESS.test(tokenAddress) || !EVM_ADDRESS.test(walletAddress)) {
    throw new Error("invalid_evm_address");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("invalid_erc20_decimals");
  }
  const balanceOfSelector = "70a08231";
  const encodedWallet = walletAddress.slice(2).toLowerCase().padStart(64, "0");
  const result = await rpc<string>(
    network,
    "eth_call",
    [{ to: tokenAddress, data: `0x${balanceOfSelector}${encodedWallet}` }, "latest"],
    fetcher,
  );
  const atomic = BigInt(result);
  return {
    tokenAddress,
    walletAddress,
    atomic: atomic.toString(),
    balance: formatUnits(atomic, decimals),
    decimals,
  };
}
export async function estimateEvmNativeTransfer(
  network: WalletNetwork,
  from: string,
  to: string,
  amount: string,
  fetcher: typeof fetch = fetch,
) {
  if (!EVM_ADDRESS.test(from) || !EVM_ADDRESS.test(to)) throw new Error("invalid_evm_address");
  const valueWei = parseEther(amount);
  if (valueWei <= ZERO) throw new Error("invalid_evm_amount");
  const valueHex = hex(valueWei);
  const [chainIdHex, gasLimitHex, gasPriceHex, nonceHex, balanceHex] = await Promise.all([
    rpc<string>(network, "eth_chainId", [], fetcher),
    rpc<string>(network, "eth_estimateGas", [{ from, to, value: valueHex }], fetcher),
    rpc<string>(network, "eth_gasPrice", [], fetcher),
    rpc<string>(network, "eth_getTransactionCount", [from, "pending"], fetcher),
    rpc<string>(network, "eth_getBalance", [from, "latest"], fetcher),
  ]);
  if (Number(BigInt(chainIdHex)) !== network.chainId) throw new Error("evm_chain_id_mismatch");
  const gasLimit = BigInt(gasLimitHex);
  const gasPrice = BigInt(gasPriceHex);
  const maxGasCost = gasLimit * gasPrice;
  if (BigInt(balanceHex) < valueWei + maxGasCost) throw new Error("insufficient_avax_for_value_and_gas");
  return {
    chainId: network.chainId, from, to, amount,
    valueWei: valueWei.toString(), valueHex,
    gasLimit: gasLimit.toString(), gasLimitHex: hex(gasLimit),
    gasPriceWei: gasPrice.toString(), maxGasCostWei: maxGasCost.toString(),
    nonce: Number(BigInt(nonceHex)),
  };
}

export type EvmContractPreview = {
  chainId: number;
  from: string;
  to: string;
  data: string;
  valueWei: string;
  valueHex: string;
  gasLimit: string;
  gasLimitHex: string;
  gasPriceWei: string;
  maxGasCostWei: string;
  nonce: number;
};

export async function prepareEvmContractCall(
  network: WalletNetwork,
  from: string,
  to: string,
  data: string,
  valueWei?: string,
  fetcher: typeof fetch = fetch,
) {
  if (!EVM_ADDRESS.test(from) || !EVM_ADDRESS.test(to)) throw new Error("invalid_evm_address");
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) throw new Error("invalid_evm_calldata");
  let value = ZERO;
  if (valueWei !== undefined) {
    if (!/^[0-9]+$/.test(valueWei)) throw new Error("invalid_evm_amount");
    value = BigInt(valueWei);
    if (value <= ZERO) throw new Error("invalid_evm_amount");
  }
  const valueHex = hex(value);
  const estimateParams: Record<string, string> = { from, to, data };
  if (value > ZERO) estimateParams.value = valueHex;
  const [chainIdHex, gasLimitHex, gasPriceHex, nonceHex, balanceHex] = await Promise.all([
    rpc<string>(network, "eth_chainId", [], fetcher),
    rpc<string>(network, "eth_estimateGas", [estimateParams], fetcher),
    rpc<string>(network, "eth_gasPrice", [], fetcher),
    rpc<string>(network, "eth_getTransactionCount", [from, "pending"], fetcher),
    rpc<string>(network, "eth_getBalance", [from, "latest"], fetcher),
  ]);
  if (Number(BigInt(chainIdHex)) !== network.chainId) throw new Error("evm_chain_id_mismatch");
  const gasLimit = BigInt(gasLimitHex);
  const gasPrice = BigInt(gasPriceHex);
  const maxGasCost = gasLimit * gasPrice;
  if (BigInt(balanceHex) < value + maxGasCost) throw new Error("insufficient_avax_for_value_and_gas");
  return {
    chainId: network.chainId, from, to, data,
    valueWei: value.toString(), valueHex,
    gasLimit: gasLimit.toString(), gasLimitHex: hex(gasLimit),
    gasPriceWei: gasPrice.toString(), maxGasCostWei: maxGasCost.toString(),
    nonce: Number(BigInt(nonceHex)),
  } satisfies EvmContractPreview;
}

type EvmTransactionByHash = {
  hash: string; chainId: string; from: string; to: string | null; value: string;
  nonce: string; gas: string; gasPrice: string; blockNumber: string | null; input: string;
};

export type EvmTransactionScope = {
  chainId?: number;
  from?: string;
  to?: string;
  valueWei?: string;
  nonce?: number;
  data?: string;
};

function assertTransactionScopeMatches(expected: EvmTransactionScope, transaction: EvmTransactionByHash) {
  const mismatch = expected.chainId !== undefined && expected.chainId !== Number(BigInt(transaction.chainId))
    || expected.from !== undefined && expected.from.toLowerCase() !== transaction.from.toLowerCase()
    || expected.to !== undefined && expected.to.toLowerCase() !== transaction.to?.toLowerCase()
    || expected.valueWei !== undefined && expected.valueWei !== BigInt(transaction.value).toString()
    || expected.nonce !== undefined && expected.nonce !== Number(BigInt(transaction.nonce))
    || expected.data !== undefined && expected.data.toLowerCase() !== transaction.input.toLowerCase();
  if (mismatch) throw new Error("evm_transaction_scope_mismatch");
}

export async function getEvmTransactionEvidence(
  network: WalletNetwork,
  transactionHash: string,
  fetcher: typeof fetch = fetch,
  expected?: EvmTransactionScope,
) {
  const [chainIdHex, transaction] = await Promise.all([
    rpc<string>(network, "eth_chainId", [], fetcher),
    rpc<EvmTransactionByHash | null>(network, "eth_getTransactionByHash", [transactionHash], fetcher),
  ]);
  const observedChainId = Number(BigInt(chainIdHex));
  if (observedChainId !== network.chainId) throw new Error("evm_chain_id_mismatch");
  if (!transaction) throw new Error("evm_transaction_not_found");
  if (expected) assertTransactionScopeMatches(expected, transaction);
  const receipt = await rpc<{ status: string; blockNumber: string } | null>(
    network, "eth_getTransactionReceipt", [transactionHash], fetcher,
  );
  return {
    chainId: observedChainId,
    transactionHash: transaction.hash.toLowerCase(),
    transactionChainId: Number(BigInt(transaction.chainId)),
    from: transaction.from,
    to: transaction.to,
    valueWei: BigInt(transaction.value).toString(),
    nonce: Number(BigInt(transaction.nonce)),
    gasLimit: BigInt(transaction.gas).toString(),
    gasPriceWei: BigInt(transaction.gasPrice).toString(),
    blockNumber: receipt?.blockNumber
      ? Number(BigInt(receipt.blockNumber))
      : transaction.blockNumber ? Number(BigInt(transaction.blockNumber)) : null,
    receiptStatus: receipt?.status ?? null,
  };
}

export async function verifyEvmContractCall(
  network: WalletNetwork,
  preview: EvmContractPreview,
  transactionHash: string,
  fetcher: typeof fetch = fetch,
) {
  const evidence = await getEvmTransactionEvidence(network, transactionHash, fetcher, {
    chainId: preview.chainId,
    from: preview.from,
    to: preview.to,
    valueWei: preview.valueWei,
    nonce: preview.nonce,
    data: preview.data,
  });
  if (
    evidence.gasLimit !== preview.gasLimit ||
    evidence.gasPriceWei !== preview.gasPriceWei
  ) throw new Error("evm_transaction_scope_mismatch");
  return {
    ...evidence,
    status: (evidence.receiptStatus === "0x1"
      ? "confirmed"
      : evidence.receiptStatus === "0x0"
        ? "failed"
        : "submitted") as "confirmed" | "failed" | "submitted",
  };
}
