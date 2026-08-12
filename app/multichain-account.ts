import { desc, eq, or } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { agentActivities, agentUsers, agentWallets } from "@/db/schema";
import type { UserWallet, WalletNetworkId } from "@/app/wallets/types";

type ExistingWalletIdentity = {
  id: string;
  userId: string;
  address: string;
};

export function assertWalletIdentityAvailable(
  existing: ExistingWalletIdentity[],
  input: { id: string; userId: string; address: string },
) {
  for (const row of existing) {
    if (row.userId !== input.userId) throw new Error("wallet_ownership_conflict");
    if (row.id === input.id && row.address !== input.address) throw new Error("wallet_identity_conflict");
    if (row.address === input.address && row.id !== input.id) throw new Error("wallet_identity_conflict");
  }
}

export function walletCreatedActivityId(walletId: string, network: WalletNetworkId) {
  return `wallet-created:${walletId}:${network}`;
}

export async function persistActivatedWallet(input: {
  userId: string;
  email: string | null;
  wallet: UserWallet;
  network: WalletNetworkId;
}) {
  if (!hasDatabase()) throw new Error("database_not_configured");
  const db = getDb();
  const now = new Date();

  await db.insert(agentUsers).values({
    id: input.userId,
    email: input.email,
    status: "active",
    lastSeenAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: agentUsers.id,
    set: { email: input.email, status: "active", lastSeenAt: now, updatedAt: now },
  });

  const existing = await db.select({
    id: agentWallets.id,
    userId: agentWallets.userId,
    address: agentWallets.address,
  }).from(agentWallets).where(or(
    eq(agentWallets.id, input.wallet.id),
    eq(agentWallets.address, input.wallet.address),
  ));
  assertWalletIdentityAvailable(existing, {
    id: input.wallet.id,
    userId: input.userId,
    address: input.wallet.address,
  });

  await db.insert(agentWallets).values({
    id: input.wallet.id,
    userId: input.userId,
    address: input.wallet.address,
    chainType: input.wallet.chainType,
    network: input.network,
    status: "active",
    updatedAt: now,
  }).onConflictDoUpdate({
    target: agentWallets.id,
    set: {
      address: input.wallet.address,
      chainType: input.wallet.chainType,
      network: input.network,
      status: "active",
      updatedAt: now,
    },
  });

  const persisted = await db.select({
    id: agentWallets.id,
    userId: agentWallets.userId,
    address: agentWallets.address,
  }).from(agentWallets).where(or(
    eq(agentWallets.id, input.wallet.id),
    eq(agentWallets.address, input.wallet.address),
  ));
  assertWalletIdentityAvailable(persisted, {
    id: input.wallet.id,
    userId: input.userId,
    address: input.wallet.address,
  });

  if (input.wallet.created) {
    await db.insert(agentActivities).values({
      id: walletCreatedActivityId(input.wallet.id, input.network),
      userId: input.userId,
      eventType: "wallet.created",
      summary: `${input.wallet.family.toUpperCase()} wallet activated on ${input.network}`,
      metadata: {
        walletId: input.wallet.id,
        address: input.wallet.address,
        family: input.wallet.family,
        chainType: input.wallet.chainType,
        network: input.network,
        provider: "privy",
      },
    }).onConflictDoNothing({ target: agentActivities.id });
  }

  return input.wallet;
}

export async function listPersistedUserWallets(userId: string) {
  if (!hasDatabase()) return [];
  return getDb().select({
    id: agentWallets.id,
    address: agentWallets.address,
    chainType: agentWallets.chainType,
    network: agentWallets.network,
    status: agentWallets.status,
    updatedAt: agentWallets.updatedAt,
  }).from(agentWallets)
    .where(eq(agentWallets.userId, userId))
    .orderBy(desc(agentWallets.updatedAt));
}
