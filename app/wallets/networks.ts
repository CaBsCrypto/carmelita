import {
  walletNetworkIdSchema,
  type WalletFamily,
  type WalletNetworkId,
} from "@/app/wallets/types";

export type WalletNetwork = {
  id: WalletNetworkId;
  family: WalletFamily;
  name: string;
  nativeAsset: string;
  testnet: true;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
  testUsdcAddress?: `0x${string}`;
  chainId: number | null;
  rollout: "active" | "experimental" | "planned";
};

export const WALLET_NETWORKS: Record<WalletNetworkId, WalletNetwork> = {
  "stellar:testnet": {
    id: "stellar:testnet", family: "stellar", name: "Stellar Testnet",
    nativeAsset: "XLM", testnet: true,
    rpcUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    chainId: null, rollout: "active",
  },
  "base:sepolia": {
    id: "base:sepolia", family: "evm", name: "Base Sepolia",
    nativeAsset: "ETH", testnet: true, rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org", chainId: 84532,
    rollout: "planned",
  },
  "solana:devnet": {
    id: "solana:devnet", family: "solana", name: "Solana Devnet",
    nativeAsset: "SOL", testnet: true, rpcUrl: "https://api.devnet.solana.com",
    explorerUrl: "https://explorer.solana.com/?cluster=devnet", chainId: null,
    rollout: "experimental",
  },
  "avalanche:fuji": {
    id: "avalanche:fuji", family: "evm", name: "Avalanche Fuji",
    nativeAsset: "AVAX", testnet: true,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://subnets-test.avax.network/c-chain", chainId: 43113,
    faucetUrl: "https://core.app/tools/testnet-faucet/?subnet=c&token=c",
    testUsdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    rollout: "experimental",
  },
  "bnb:testnet": {
    id: "bnb:testnet", family: "evm", name: "BNB Smart Chain Testnet",
    nativeAsset: "tBNB", testnet: true,
    rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    explorerUrl: "https://testnet.bscscan.com", chainId: 97,
    rollout: "planned",
  },
};

export function getWalletNetwork(input: string) {
  const network = WALLET_NETWORKS[walletNetworkIdSchema.parse(input)];
  return isEvmExpansionNetwork(network.id) && isEvmExpansionEnabled()
    ? { ...network, rollout: "experimental" as const }
    : network;
}

export function isEvmExpansionNetwork(input: string) {
  return input === "bnb:testnet" || input === "base:sepolia";
}

export function isEvmExpansionEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED !== "true") return false;
  if (env.VERCEL_ENV === "production") {
    return env.CARMELITA_PREVIEW_ISOLATED !== "true"
      && env.CARMELITA_PREVIEW_DATABASE_URL === undefined
      && env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED === undefined;
  }
  return env.VERCEL_ENV === "preview" && env.CARMELITA_PREVIEW_ISOLATED === "true";
}

export function isWalletNetworkEnabled(input: string) {
  const parsed = walletNetworkIdSchema.safeParse(input);
  return parsed.success && getWalletNetwork(parsed.data).rollout !== "planned";
}

export function enabledWalletNetworks() {
  return Object.keys(WALLET_NETWORKS).filter(isWalletNetworkEnabled).map(getWalletNetwork);
}

export function enabledEvmNetworks() {
  return enabledWalletNetworks().filter((network) => network.family === "evm")
    .sort((left, right) => {
      const order = ["avalanche:fuji", "bnb:testnet", "base:sepolia"];
      return order.indexOf(left.id) - order.indexOf(right.id);
    });
}

export function networksForFamily(family: WalletFamily) {
  return Object.values(WALLET_NETWORKS).filter((network) => network.family === family);
}

export function assertNetworkMatchesFamily(networkId: WalletNetworkId, family: WalletFamily) {
  const network = WALLET_NETWORKS[networkId];
  if (network.family !== family) throw new Error("wallet_network_family_mismatch");
  return network;
}
