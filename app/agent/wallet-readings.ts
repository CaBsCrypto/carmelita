import { TEMPO_MODERATO_TOKEN } from "@/app/wallets/networks";
import type { TempoWalletReading } from "@/app/wallets/types";

export type WalletRow = { id: string; address: string; chainType: string; network: string; status: string };
export type WalletNetworkView = { id: string; family: string; name: string; nativeAsset: string; rollout: string; chainId?: number | null };
export type WalletReading = {
  address: string; network: string; balance: string; nativeAsset: string; explorerUrl: string;
  chainId?: number; funded?: boolean; faucetUrl?: string;
  balanceKind?: "native" | "tip20";
  tempo?: TempoWalletReading;
  balances?: { native: { asset: string; balance: string }; usdc: { asset: string; balance: string; contract: string } };
};
export type WalletReadings = {
  wallets: WalletRow[]; networks: WalletNetworkView[];
  readings: Record<string, WalletReading>; failedNetworks: string[];
  failures?: Record<string, { code: string; message: string }>;
};

const EVM_CHAINS: Record<string, number> = { "avalanche:fuji": 43113, "bnb:testnet": 97, "base:sepolia": 84532 };

export function walletReadingPath(network: string) {
  if (network === "tempo:moderato") return "/api/agent/wallets/tempo";
  if (network === "avalanche:fuji") return "/api/agent/wallets/avalanche";
  if (network === "solana:devnet") return "/api/agent/wallets/solana";
  if (Object.hasOwn(EVM_CHAINS, network)) return `/api/agent/wallets/evm?network=${encodeURIComponent(network)}`;
  return null;
}

export function tempoReadingToWalletReading(reading: TempoWalletReading): WalletReading | null {
  if (reading.status !== "available" || reading.chainId !== 42431 || reading.testnet !== true
    || reading.caip2 !== "eip155:42431" || reading.network !== "tempo:moderato"
    || !reading.token || reading.token.standard !== "TIP-20" || reading.token.metadataVerified !== true
    || reading.token.address?.toLowerCase() !== TEMPO_MODERATO_TOKEN.address
    || reading.token.decimals !== TEMPO_MODERATO_TOKEN.decimals || reading.token.symbol !== TEMPO_MODERATO_TOKEN.symbol
    || reading.token.name !== TEMPO_MODERATO_TOKEN.name || !/^\d+$/.test(reading.token.balanceAtomic)
    || !/^\d+(?:\.\d+)?$/.test(reading.token.balance) || !reading.block) return null;
  return {
    address: reading.address, network: reading.network, chainId: reading.chainId,
    balance: reading.token.balance,
    // Legacy display label consumed by wallet-center; represents the TIP-20 token here.
    nativeAsset: reading.token.symbol, balanceKind: "tip20", tempo: reading, explorerUrl: reading.explorerUrl,
  };
}

export function readingMatchesWallet(wallet: WalletRow, reading: WalletReading) {
  const sameAddress = wallet.chainType === "ethereum"
    ? wallet.address.toLowerCase() === reading.address?.toLowerCase()
    : wallet.address === reading.address;
  return sameAddress && reading.network === wallet.network && typeof reading.balance === "string"
    && (wallet.network !== "tempo:moderato" || (reading.tempo !== undefined && tempoReadingToWalletReading(reading.tempo) !== null))
    && (!Object.hasOwn(EVM_CHAINS, wallet.network) || reading.chainId === EVM_CHAINS[wallet.network]);
}

export async function fetchWalletReadings(token: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<WalletReadings> {
  const options = { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" as const, signal };
  const response = await fetcher("/api/agent/wallets", options);
  if (!response.ok) throw new Error("wallet_list_unavailable");
  const body = await response.json() as { wallets: WalletRow[]; networks: WalletNetworkView[] };
  signal.throwIfAborted();
  const networks = body.networks.filter((network) => network.rollout !== "planned");
  const enabled = new Set(networks.map((network) => network.id));
  const wallets = body.wallets.filter((wallet) => enabled.has(wallet.network));
  const readings: Record<string, WalletReading> = {};
  const failedNetworks: string[] = [];
  const failures: NonNullable<WalletReadings["failures"]> = {};
  await Promise.all(wallets.filter((wallet) => wallet.status === "active").map(async (wallet) => {
    const path = walletReadingPath(wallet.network);
    if (!path) return;
    try {
      const statusResponse = await fetcher(path, options);
      if (wallet.network === "tempo:moderato") {
        const tempo = await statusResponse.json() as TempoWalletReading;
        const reading = statusResponse.ok ? tempoReadingToWalletReading(tempo) : null;
        if (!reading || !readingMatchesWallet(wallet, reading)) {
          if (tempo.status !== "available" && tempo.error && /^tempo_[a-z_]+$/.test(tempo.error.code)) {
            failures[wallet.network] = { code: tempo.error.code, message: tempo.error.message };
          }
          throw new Error("tempo_reading_unavailable");
        }
        readings[wallet.network] = reading;
        return;
      }
      if (!statusResponse.ok) throw new Error("wallet_balance_unavailable");
      const reading = await statusResponse.json() as WalletReading;
      if (!readingMatchesWallet(wallet, reading)) throw new Error("wallet_response_mismatch");
      readings[wallet.network] = reading;
    } catch {
      if (!signal.aborted) {
        failedNetworks.push(wallet.network);
        failures[wallet.network] ??= { code: "wallet_balance_unavailable", message: "No se pudo consultar el saldo de esta red." };
      }
    }
  }));
  signal.throwIfAborted();
  return { wallets, networks, readings, failedNetworks, failures };
}
