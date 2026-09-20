import { and, desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { agentUsers, agentWallets, agentWalletNetworks } from "@/db/schema";
import { enabledWalletNetworks, WALLET_NETWORKS } from "@/app/wallets/networks";
import { isValidWalletAddress } from "@/app/wallets/privy";
import type { WalletNetworkId } from "@/app/wallets/types";

export const REQUIRED_ADMIN_WALLET_NETWORKS = [
  "stellar:testnet",
  "avalanche:fuji",
  "solana:devnet",
  "bnb:testnet",
  "base:sepolia",
] as const;

export type AdminWalletRecord = {
  address: string;
  chainType: string;
  network: string;
  networkName: string;
  status: string;
  validAddress: boolean;
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
  inactiveNetworks: string[];
  invalidAddressNetworks: string[];
  registeredComplete: boolean;
  complete: boolean;
  uniqueWallets: number;
  networkAssociations: number;
  evmIdentityConflict: boolean;
};

type UserRow = {
  id: string;
  email: string | null;
  status: string;
  lastSeenAt: Date;
  createdAt: Date;
};

type WalletRow = {
  id?: string;
  userId: string;
  address: string;
  chainType: string;
  network: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function validWallet(wallet: WalletRow) {
  const network = WALLET_NETWORKS[wallet.network as WalletNetworkId];
  if (!network) return false;
  const expectedType = network.family === "evm" ? "ethereum" : network.family;
  return wallet.chainType === expectedType && isValidWalletAddress(network.family, wallet.address);
}

function identityKey(wallet: WalletRow) {
  return wallet.id ?? `${wallet.chainType}:${wallet.chainType === "ethereum" ? wallet.address.toLowerCase() : wallet.address}`;
}

function walletExplorerUrl(networkId: string, address: string) {
  const network = WALLET_NETWORKS[networkId as WalletNetworkId];
  if (!network) return null;
  if (network.family === "stellar") return `${network.explorerUrl}/account/${address}`;
  if (network.family === "evm") return `${network.explorerUrl}/address/${address}`;
  const url = new URL(network.explorerUrl);
  url.pathname = `/address/${address}`;
  return url.toString();
}

export function buildAdminWalletRegistry(users: UserRow[], wallets: WalletRow[], enabledNetworks = enabledWalletNetworks()) {
  const enabled = new Set(enabledNetworks.map((network) => network.id));
  const required = REQUIRED_ADMIN_WALLET_NETWORKS.filter((network) => enabled.has(network));
  const byUser = new Map<string, WalletRow[]>();
  for (const wallet of wallets) {
    if (!enabled.has(wallet.network as WalletNetworkId)) continue;
    const current = byUser.get(wallet.userId) ?? [];
    current.push(wallet);
    byUser.set(wallet.userId, current);
  }

  const records: AdminWalletUser[] = users.map((user) => {
    const owned = byUser.get(user.id) ?? [];
    const counts = new Map<string, number>();
    for (const wallet of owned) counts.set(wallet.network, (counts.get(wallet.network) ?? 0) + 1);
    const missingNetworks = required.filter(
      (network) => !counts.has(network),
    );
    const duplicateNetworks = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([network]) => network);
    const inactiveNetworks = owned
      .filter((wallet) => wallet.status !== "active")
      .map((wallet) => wallet.network);
    const invalidAddressNetworks = owned
      .filter((wallet) => !validWallet(wallet))
      .map((wallet) => wallet.network);
    const evm = owned.filter((wallet) => wallet.chainType === "ethereum");
    const evmIdentityConflict = new Set(evm.map(identityKey)).size > 1 || new Set(evm.map((wallet) => wallet.address.toLowerCase())).size > 1;
    const registeredComplete = missingNetworks.length === 0 && duplicateNetworks.length === 0 && !evmIdentityConflict;

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
          validAddress: validWallet(wallet),
          explorerUrl: walletExplorerUrl(wallet.network, wallet.address),
          createdAt: wallet.createdAt.toISOString(),
          updatedAt: wallet.updatedAt.toISOString(),
        }))
        .sort((left, right) => left.network.localeCompare(right.network)),
      missingNetworks: [...missingNetworks],
      duplicateNetworks,
      inactiveNetworks: [...new Set(inactiveNetworks)],
      invalidAddressNetworks: [...new Set(invalidAddressNetworks)],
      registeredComplete,
      complete: registeredComplete && inactiveNetworks.length === 0 && invalidAddressNetworks.length === 0,
      uniqueWallets: new Set(owned.map(identityKey)).size,
      networkAssociations: owned.length,
      evmIdentityConflict,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    networks: enabledNetworks.map(({ id, name }) => ({ id, name })),
    summary: {
      users: records.length,
      // Preserve the legacy wallet-identity count; network bindings have their own metric.
      wallets: records.reduce((total, user) => total + user.uniqueWallets, 0),
      uniqueWallets: records.reduce((total, user) => total + user.uniqueWallets, 0),
      networkAssociations: records.reduce((total, user) => total + user.networkAssociations, 0),
      completeUsers: records.filter((user) => user.complete).length,
      needsAttention: records.filter((user) => !user.complete).length,
      missingStellar: records.filter((user) => user.missingNetworks.includes("stellar:testnet")).length,
      missingSolana: records.filter((user) => user.missingNetworks.includes("solana:devnet")).length,
      missingAvalanche: records.filter((user) => user.missingNetworks.includes("avalanche:fuji")).length,
      missingBnb: records.filter((user) => user.missingNetworks.includes("bnb:testnet")).length,
      missingBase: records.filter((user) => user.missingNetworks.includes("base:sepolia")).length,
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
      id: agentWallets.id,
      userId: agentWallets.userId,
      address: agentWallets.address,
      chainType: agentWallets.chainType,
      network: agentWalletNetworks.network,
      status: agentWalletNetworks.status,
      createdAt: agentWalletNetworks.createdAt,
      updatedAt: agentWalletNetworks.updatedAt,
    }).from(agentWallets).innerJoin(agentWalletNetworks, and(eq(agentWalletNetworks.walletId, agentWallets.id), eq(agentWalletNetworks.userId, agentWallets.userId))).orderBy(desc(agentWalletNetworks.updatedAt)),
  ]);
  return buildAdminWalletRegistry(users, wallets);
}
