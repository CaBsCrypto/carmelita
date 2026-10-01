export type RegistryWallet = {
  address: string;
  chainType: string;
  network: string;
  status: string;
  explorerUrl: string | null;
};
export type RegistryResult = {
  wallets: RegistryWallet[];
  walletRegistration: { unregisteredNetworks: string[] };
  walletReadiness: { complete: boolean; missingNetworks: string[] };
  source: string;
  queriedAt: string;
};
const networkNames: Record<string, string> = {
  "stellar:testnet": "Stellar Testnet", "avalanche:fuji": "Avalanche Fuji",
  "bnb:testnet": "BNB Smart Chain Testnet", "base:sepolia": "Base Sepolia", "solana:devnet": "Solana Devnet",
};
const order = ["stellar:testnet", "avalanche:fuji", "bnb:testnet", "base:sepolia", "solana:devnet"];

/** Only render networks and explorer links actually returned by the authoritative registry. */
export function registryNetworkRows(result: RegistryResult) {
  const ids = new Set([...result.wallets.map(wallet => wallet.network), ...result.walletRegistration.unregisteredNetworks]);
  return [...ids].sort((left, right) => order.indexOf(left) - order.indexOf(right)).map(network => {
    const wallet = result.wallets.find(item => item.network === network && item.status === "active")
      ?? result.wallets.find(item => item.network === network);
    const family = ["avalanche:fuji", "bnb:testnet", "base:sepolia"].includes(network) ? "evm" : network.split(":")[0];
    return { network, name: networkNames[network] ?? network, family,
      address: wallet?.address ?? null, status: wallet?.status ?? null, explorerUrl: wallet?.explorerUrl ?? null };
  });
}
