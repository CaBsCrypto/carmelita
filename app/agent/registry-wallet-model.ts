import type { WalletRow, WalletNetworkView } from "./wallet-readings";

const explorers: Record<string, string> = {
  "stellar:testnet": "https://stellar.expert/explorer/testnet/account/",
  "avalanche:fuji": "https://explorer-test.avax.network/c-chain/address/",
  "bnb:testnet": "https://testnet.bscscan.com/address/",
  "base:sepolia": "https://sepolia.basescan.org/address/",
  "solana:devnet": "https://explorer.solana.com/address/",
};

export function registryNetworkRows(wallets: WalletRow[], networks: WalletNetworkView[]) {
  return networks.filter(network => network.rollout !== "planned").map(network => {
    const wallet = wallets.find(item => item.network === network.id);
    const prefix = explorers[network.id];
    return { id: network.id, name: network.name, address: wallet?.address ?? null,
      status: wallet?.status ?? null,
      explorerUrl: wallet && prefix ? prefix + wallet.address + (network.id === "solana:devnet" ? "?cluster=devnet" : "") : null };
  });
}
