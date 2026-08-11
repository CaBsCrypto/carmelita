import { desc } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { agentUsers, agentWallets } from "@/db/schema";
import { WALLET_NETWORKS } from "@/app/wallets/networks";
import type { WalletNetworkId } from "@/app/wallets/types";

export const REQUIRED_ADMIN_WALLET_NETWORKS = [
  "stellar:testnet",
  "avalanche:fuji",
] as const;

export type AdminWalletRecord = {
  address: string;
  chainType: string;
  network: string;
  networkName: string;
  status: string;
  explorerUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminWalletUser = {
  privyDid: string;
  email: string | null;
  status: string;
  lastSeenAt: string;
  createdAt: string;
  wallets: AdminWalletRecord[];
  missingNetworks: string[];
  duplicateNetworks: string[];
  complete: boolean;
};

type UserRow = {
  id: string;
  email: string | null;
  status: string;
  lastSeenAt: Date;
  createdAt: Date;
};

type WalletRow = {
  userId: string;
  address: string;
  chainType: string;
  network: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function walletExplorerUrl(networkId: string, address: string) {
  const network = WALLET_NETWORKS[networkId as WalletNetworkId];
  if (!network) return null;
  if (network.family === "stellar") return `${network.explorerUrl}/account/${address}`;
  if (network.family === "evm") return `${network.explorerUrl}/address/${address}`;
  return `${network.explorerUrl}&address=${address}`;
}

export function buildAdminWalletRegistry(users: UserRow[], wallets: WalletRow[]) {
  const byUser = new Map<string, WalletRow[]>();
  for (const wallet of wallets) {
    const current = byUser.get(wallet.userId) ?? [];
    current.push(wallet);
    byUser.set(wallet.userId, current);
  }

  const records: AdminWalletUser[] = users.map((user) => {
    const owned = byUser.get(user.id) ?? [];
    const counts = new Map<string, number>();
    for (const wallet of owned) counts.set(wallet.network, (counts.get(wallet.network) ?? 0) + 1);
    const missingNetworks = REQUIRED_ADMIN_WALLET_NETWORKS.filter(
      (network) => !counts.has(network),
    );
    const duplicateNetworks = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([network]) => network);

    return {
      privyDid: user.id,
      email: user.email,
      status: user.status,
      lastSeenAt: user.lastSeenAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      wallets: owned
        .map((wallet) => ({
          address: wallet.address,
          chainType: wallet.chainType,
          network: wallet.network,
          networkName:
            WALLET_NETWORKS[wallet.network as WalletNetworkId]?.name ?? wallet.network,
          status: wallet.status,
          explorerUrl: walletExplorerUrl(wallet.network, wallet.address),
          createdAt: wallet.createdAt.toISOString(),
          updatedAt: wallet.updatedAt.toISOString(),
        }))
        .sort((left, right) => left.network.localeCompare(right.network)),
      missingNetworks: [...missingNetworks],
      duplicateNetworks,
      complete: missingNetworks.length === 0 && duplicateNetworks.length === 0,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      users: records.length,
      wallets: records.reduce((total, user) => total + user.wallets.length, 0),
      completeUsers: records.filter((user) => user.complete).length,
      needsAttention: records.filter((user) => !user.complete).length,
      missingStellar: records.filter((user) => user.missingNetworks.includes("stellar:testnet")).length,
      missingAvalanche: records.filter((user) => user.missingNetworks.includes("avalanche:fuji")).length,
    },
    users: records,
  };
}

export async function listAdminWalletRegistry() {
  if (!hasDatabase()) throw new Error("database_not_configured");
  const db = getDb();
  const [users, wallets] = await Promise.all([
    db.select({
      id: agentUsers.id,
      email: agentUsers.email,
      status: agentUsers.status,
      lastSeenAt: agentUsers.lastSeenAt,
      createdAt: agentUsers.createdAt,
    }).from(agentUsers).orderBy(desc(agentUsers.lastSeenAt)),
    db.select({
      userId: agentWallets.userId,
      address: agentWallets.address,
      chainType: agentWallets.chainType,
      network: agentWallets.network,
      status: agentWallets.status,
      createdAt: agentWallets.createdAt,
      updatedAt: agentWallets.updatedAt,
    }).from(agentWallets).orderBy(desc(agentWallets.updatedAt)),
  ]);
  return buildAdminWalletRegistry(users, wallets);
}
