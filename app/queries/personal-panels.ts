import { executeWebReadQuery } from "./adapters";
import { readOwnWalletRegistry } from "./personal";
import { getWalletNetwork, WALLET_NETWORKS } from "@/app/wallets/networks";
import { AVALANCHE_X402 } from "@/app/x402-avalanche/config";
import { FUJI_DISTRIBUTION_AMOUNT, fujiClaimWindow, getFujiDistributorConfig } from "@/app/wallets/avalanche-policy";
import type { diagnoseEvmWallet } from "@/app/wallets/evm-rpc";

export type PersonalPanelDependencies = {
  registry: typeof readOwnWalletRegistry;
  execute: typeof executeWebReadQuery;
  distributorConfig: typeof getFujiDistributorConfig;
};
const defaultDependencies: PersonalPanelDependencies = {
  registry: readOwnWalletRegistry, execute: executeWebReadQuery, distributorConfig: getFujiDistributorConfig,
};

/** Bounds the whole legacy panel read, including its registry and provider stages. */
export async function withPersonalPanelReadDeadline<T>(read: () => Promise<T>, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("read_query_timeout")), timeoutMs);
  });
  try { return await Promise.race([read(), deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

type WalletStatus = {
  address: string;
  network: string;
  chainType: string;
  registrationStatus: string;
  explorerUrl: string | null;
  native: { balance: string | null; status: string; error?: string };
  tokens: Array<{ asset: string; contract: string | null; balance: string | null; status: string; error?: string }>;
  diagnostics?: Awaited<ReturnType<typeof diagnoseEvmWallet>> | null;
  solana?: { sol: number; lamports: number; formatted: string };
};

/** Legacy panel DTOs retain their fields while reusing the shared owner-bound reads. */
export async function readWalletListPanel(userId: string, dependencies: PersonalPanelDependencies = defaultDependencies) {
  const { rows } = await dependencies.registry(userId);
  const wallets = rows.filter((wallet) => wallet.userId === userId)
    .map(({ id, walletId, address, chainType, network, status, updatedAt }) => ({ id, walletId, address, chainType, network, status, updatedAt }));
  return {
    wallets,
    networks: Object.keys(WALLET_NETWORKS).map(getWalletNetwork).map((network) => ({
      id: network.id, family: network.family, name: network.name, nativeAsset: network.nativeAsset,
      rollout: network.rollout, active: wallets.some((wallet) => wallet.network === network.id),
    })),
  };
}

export async function readAvalancheWalletPanel(userId: string, dependencies: PersonalPanelDependencies = defaultDependencies) {
  const { rows } = await dependencies.registry(userId);
  const own = rows.find((row) => row.userId === userId && row.chainType === "ethereum"
    && row.network === "avalanche:fuji" && row.status === "active");
  if (!own) throw new Error("avalanche_not_activated");
  const result = await dependencies.execute("personal.wallets.status", { networks: ["avalanche:fuji"] }, userId) as { wallets: WalletStatus[] };
  const reading = result.wallets.find((row) => row.network === "avalanche:fuji" && row.chainType === "ethereum"
    && row.registrationStatus === "active" && row.address.toLowerCase() === own.address.toLowerCase());
  if (!reading) throw new Error("avalanche_not_activated");
  if (reading.native.status !== "ok" || !reading.diagnostics) throw new Error(reading.native.error ?? "evm_rpc_failed");
  const usdc = reading.tokens.find((token) => token.contract?.toLowerCase() === AVALANCHE_X402.asset.address.toLowerCase());
  if (!usdc || usdc.status !== "ok") throw new Error(usdc?.error ?? "evm_rpc_failed");
  const distributor = dependencies.distributorConfig();
  return {
    ...reading.diagnostics,
    balances: {
      native: { asset: reading.diagnostics.nativeAsset, balance: reading.diagnostics.balance },
      usdc: { asset: AVALANCHE_X402.asset.symbol, balance: usdc.balance, contract: AVALANCHE_X402.asset.address },
    },
    faucetUrl: "https://faucets.chain.link/fuji",
    funding: {
      automaticEnabled: distributor.enabled, automaticReason: distributor.enabled ? null : distributor.reason,
      amount: FUJI_DISTRIBUTION_AMOUNT, claimWindow: fujiClaimWindow(),
      primaryFaucetUrl: "https://faucets.chain.link/fuji", officialFaucetUrl: "https://core.app/tools/testnet-faucet",
      network: "avalanche:fuji",
    },
  };
}

export async function readSolanaWalletPanel(userId: string, dependencies: PersonalPanelDependencies = defaultDependencies) {
  const { rows } = await dependencies.registry(userId);
  const own = rows.find((row) => row.userId === userId && row.chainType === "solana"
    && row.network === "solana:devnet" && row.status === "active");
  if (!own) throw new Error("solana_not_activated");
  const result = await dependencies.execute("personal.wallets.status", { networks: ["solana:devnet"] }, userId) as { wallets: WalletStatus[] };
  const reading = result.wallets.find((row) => row.network === "solana:devnet" && row.chainType === "solana"
    && row.registrationStatus === "active" && row.address === own.address);
  if (!reading) throw new Error("solana_not_activated");
  if (reading.native.status !== "ok" || !reading.solana) throw new Error("solana_balance_unavailable");
  return {
    address: own.address, network: "solana:devnet", nativeAsset: "SOL", balance: reading.solana.formatted,
    sol: reading.solana.sol, lamports: reading.solana.lamports, explorerUrl: reading.explorerUrl,
  };
}

export async function readConnectionsPanel(userId: string, dependencies: PersonalPanelDependencies = defaultDependencies) {
  const result = await dependencies.execute("personal.connections", {}, userId) as {
    connections: Array<{ provider: string; status: string; scopes: string[]; tokenExpiresAt: string | null; updatedAt: string }>;
  };
  return { connections: result.connections.map(({ provider, status, scopes, tokenExpiresAt, updatedAt }) => ({ provider, status, scopes, tokenExpiresAt, updatedAt })) };
}
