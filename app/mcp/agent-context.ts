import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentExternalConnections,
  agentUsers,
} from "@/db/schema";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { enabledWalletNetworks } from "@/app/wallets/networks";
import { walletExplorerUrl } from "@/app/wallets/explorer";
import { PRIVY_CHAIN_TYPE_BY_FAMILY, type WalletNetworkId } from "@/app/wallets/types";

type PublicWallet = {
  address: string;
  chainType: string;
  network: string;
  status: string;
};

const MCP_WALLET_ORDER = ["stellar:testnet", "avalanche:fuji", "solana:devnet", "bnb:testnet", "base:sepolia"] as const;

export function buildMcpWalletContext(wallets: PublicWallet[]) {
  const networks = enabledWalletNetworks().sort((left, right) => MCP_WALLET_ORDER.indexOf(left.id) - MCP_WALLET_ORDER.indexOf(right.id));
  // Project fields explicitly: persisted rows also carry private provider IDs.
  const ordered = wallets.filter((wallet) => networks.some((network) =>
    wallet.network === network.id && wallet.chainType === PRIVY_CHAIN_TYPE_BY_FAMILY[network.family],
  )).map(({ address, chainType, network, status }) => ({
    address, chainType, network, status,
    registrationState: status === "active" ? "registered" as const : status === "pending" ? "pending_registration" as const : "unknown" as const,
    registrationStatusScope: "internal_registry" as const,
    explorerUrl: walletExplorerUrl(network, address),
  })).sort((left, right) =>
    left.network.localeCompare(right.network) || left.address.localeCompare(right.address),
  );
  const activeNetworks = new Set(
    ordered.filter((wallet) => wallet.status === "active").map((wallet) => wallet.network),
  );
  const visible = ordered.filter(
    (wallet) => wallet.status === "active" || !activeNetworks.has(wallet.network),
  );
  const active = (network: WalletNetworkId) =>
    ordered.find((wallet) => wallet.network === network && wallet.status === "active") ?? null;
  const walletsByNetwork = {
    stellarTestnet: active("stellar:testnet"),
    avalancheFuji: active("avalanche:fuji"),
    solanaDevnet: active("solana:devnet"),
    bnbTestnet: active("bnb:testnet"),
    baseSepolia: active("base:sepolia"),
  };
  const missingNetworks = networks.filter((network) => !active(network.id)).map((network) => network.id);
  return {
    wallets: visible,
    walletsByNetwork,
    walletRegistration: {
      registered: visible.length > 0,
      statusSemantics: {
        scope: "internal_registry" as const,
        active: "registered" as const,
        pending: "pending_registration" as const,
        onChainActivity: "not_inferred" as const,
        balance: "not_inferred" as const,
      },
      pendingRegistration: visible.filter((wallet) => wallet.status === "pending"),
      // Retained DTO alias; these rows await registration, not proven on-chain activation.
      pendingActivation: visible.filter((wallet) => wallet.status === "pending"),
      unregisteredNetworks: networks.filter((network) => !visible.some((wallet) => wallet.network === network.id)).map((network) => network.id),
      onboardingRequired: visible.length === 0,
      guidance: visible.length === 0 ? "Complete wallet onboarding in Carmelita. Connecting ChatGPT does not create wallets." : null,
    },
    walletReadiness: {
      complete: missingNetworks.length === 0,
      missingNetworks,
      suppressedStaleWallets: ordered.length - visible.length,
    },
  };
}

export async function getAgentMcpContext(userId: string) {
  const db = getDb();
  const [users, wallets, connections] = await Promise.all([
    db
      .select({
        id: agentUsers.id,
        email: agentUsers.email,
        status: agentUsers.status,
        lastSeenAt: agentUsers.lastSeenAt,
      })
      .from(agentUsers)
      .where(eq(agentUsers.id, userId))
      .limit(1),
    listPersistedUserWallets(userId),
    db
      .select({
        provider: agentExternalConnections.provider,
        status: agentExternalConnections.status,
        scopes: agentExternalConnections.scopes,
        updatedAt: agentExternalConnections.updatedAt,
      })
      .from(agentExternalConnections)
      .where(eq(agentExternalConnections.userId, userId)),
  ]);
  if (!users[0]) throw new Error("agent_user_not_found");
  return {
    user: users[0],
    ...buildMcpWalletContext(wallets),
    connections,
    authority: {
      paymentSigning: "not_enabled",
      custody: false,
      writeToolsRequireExplicitApproval: true,
    },
  };
}
