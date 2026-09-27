export type WalletRow = { id: string; address: string; chainType: string; network: string; status: string };
export type WalletNetworkView = { id: string; family: string; name: string; nativeAsset: string; rollout: string; chainId?: number | null };
export type WalletReading = {
  address: string; network: string; balance: string; nativeAsset: string; explorerUrl: string;
  chainId?: number; funded?: boolean; faucetUrl?: string;
  balances?: { native: { asset: string; balance: string }; usdc: { asset: string; balance: string; contract: string } };
};
export type WalletReadings = {
  wallets: WalletRow[]; networks: WalletNetworkView[];
  readings: Record<string, WalletReading>; failedNetworks: string[];
};

const EVM_CHAINS: Record<string, number> = { "avalanche:fuji": 43113, "bnb:testnet": 97, "base:sepolia": 84532 };

export function walletReadingPath(network: string) {
  if (network === "avalanche:fuji") return "/api/agent/wallets/avalanche";
  if (network === "solana:devnet") return "/api/agent/wallets/solana";
  if (Object.hasOwn(EVM_CHAINS, network)) return `/api/agent/wallets/evm?network=${encodeURIComponent(network)}`;
  return null;
}

export function readingMatchesWallet(wallet: WalletRow, reading: WalletReading) {
  const sameAddress = wallet.chainType === "ethereum"
    ? wallet.address.toLowerCase() === reading.address?.toLowerCase()
    : wallet.address === reading.address;
  return sameAddress && reading.network === wallet.network && typeof reading.balance === "string"
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
  await Promise.all(wallets.filter((wallet) => wallet.status === "active").map(async (wallet) => {
    const path = walletReadingPath(wallet.network);
    if (!path) return;
    try {
      const statusResponse = await fetcher(path, options);
      if (!statusResponse.ok) throw new Error("wallet_balance_unavailable");
      const reading = await statusResponse.json() as WalletReading;
      if (!readingMatchesWallet(wallet, reading)) throw new Error("wallet_response_mismatch");
      readings[wallet.network] = reading;
    } catch {
      if (!signal.aborted) failedNetworks.push(wallet.network);
    }
  }));
  signal.throwIfAborted();
  return { wallets, networks, readings, failedNetworks };
}
