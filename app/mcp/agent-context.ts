import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentExternalConnections,
  agentUsers,
  agentWallets,
} from "@/db/schema";

type PublicWallet = {
  address: string;
  chainType: string;
  network: string;
  status: string;
};

const MCP_WALLET_NETWORKS = ["stellar:testnet", "avalanche:fuji", "solana:devnet"] as const;

export function buildMcpWalletContext(wallets: PublicWallet[]) {
  const ordered = [...wallets].sort((left, right) =>
    left.network.localeCompare(right.network) || left.address.localeCompare(right.address),
  );
  const activeNetworks = new Set(
    ordered.filter((wallet) => wallet.status === "active").map((wallet) => wallet.network),
  );
  const visible = ordered.filter(
    (wallet) => wallet.status === "active" || !activeNetworks.has(wallet.network),
  );
  const active = (network: typeof MCP_WALLET_NETWORKS[number]) =>
    ordered.find((wallet) => wallet.network === network && wallet.status === "active") ?? null;
  const walletsByNetwork = {
    stellarTestnet: active("stellar:testnet"),
    avalancheFuji: active("avalanche:fuji"),
    solanaDevnet: active("solana:devnet"),
  };
  const missingNetworks = MCP_WALLET_NETWORKS.filter((network) => !active(network));
  return {
    wallets: visible,
    walletsByNetwork,
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
    db
      .select({
        address: agentWallets.address,
        chainType: agentWallets.chainType,
        network: agentWallets.network,
        status: agentWallets.status,
      })
      .from(agentWallets)
      .where(eq(agentWallets.userId, userId)),
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
