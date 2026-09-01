import { isValidWalletAddress } from "@/app/wallets/privy";

export const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const LAMPORTS_PER_SOL = 1_000_000_000;

export type SolanaAccountBalance = {
  address: string;
  lamports: number;
  sol: number;
  formatted: string;
};

export async function getSolanaDevnetBalance(
  address: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<SolanaAccountBalance> {
  if (!isValidWalletAddress("solana", address)) {
    throw new Error("invalid_solana_address");
  }

  const response = await fetchFn(SOLANA_DEVNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }),
  });

  if (!response.ok) {
    throw new Error(`solana_rpc_http_error:${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`solana_rpc_error:${json.error.message || json.error.code}`);
  }

  const lamports = Number(json.result?.value ?? 0);
  const sol = lamports / LAMPORTS_PER_SOL;
  const formatted = `${sol.toFixed(4)} SOL`;

  return {
    address,
    lamports,
    sol,
    formatted,
  };
}

export async function requestSolanaDevnetAirdrop(
  address: string,
  solAmount = 1,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ signature: string; lamports: number; formatted: string }> {
  if (!isValidWalletAddress("solana", address)) {
    throw new Error("invalid_solana_address");
  }

  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  const response = await fetchFn(SOLANA_DEVNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "requestAirdrop",
      params: [address, lamports],
    }),
  });

  if (!response.ok) {
    throw new Error(`solana_faucet_http_error:${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`solana_faucet_error:${json.error.message || json.error.code}`);
  }

  const signature = String(json.result);
  return {
    signature,
    lamports,
    formatted: `${solAmount} SOL`,
  };
}
