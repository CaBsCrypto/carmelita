import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentActivities, agentUsers } from "@/db/schema";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { enabledEvmNetworks, getWalletNetwork } from "./networks";
import { provisionUserWallets } from "./onboarding";
import { PRIVY_CHAIN_TYPE_BY_FAMILY, type UserWallet, type WalletFamily } from "./types";
import { isValidWalletAddress } from "./privy";

/** Hydrates the legacy bootstrap contract without ever creating a wallet. */
export async function readRegisteredOnboarding(input: { userId: string; email: string | null }) {
  const db = getDb();
  const [rows, users, history] = await Promise.all([
    listPersistedUserWallets(input.userId),
    db.select().from(agentUsers).where(eq(agentUsers.id, input.userId)).limit(1),
    db.select().from(agentActivities).where(and(eq(agentActivities.userId, input.userId)))
      .orderBy(desc(agentActivities.createdAt)).limit(8),
  ]);
  const wallet = (family: WalletFamily): UserWallet => {
    const found = rows.filter(row => row.chainType === PRIVY_CHAIN_TYPE_BY_FAMILY[family]);
    if (!found.length) throw new Error("wallet_preparation_pending");
    if (new Set(found.map(row => row.id)).size !== 1 || found.some(row => !isValidWalletAddress(family, row.address))) {
      throw new Error("wallet_identity_conflict");
    }
    const row = found[0];
    return { id: row.id, address: row.address, family, chainType: PRIVY_CHAIN_TYPE_BY_FAMILY[family], created: false, owner: "user" };
  };
  const requireNetworks = (family: WalletFamily, networks: string[]) => {
    const value = wallet(family);
    if (networks.some(network => !rows.some(row => row.id === value.id && row.network === network))) throw new Error("wallet_preparation_pending");
    return value;
  };
  const result = await provisionUserWallets(input, {
    getOrCreateStellarWallet: async () => requireNetworks("stellar", ["stellar:testnet"]),
    getStellarAccount: address => getStellarTestnetAccount(address, AbortSignal.timeout(8000)),
    persistStellarAccount: async () => ({
      persistence: { configured: true, provider: "Neon Postgres" },
      profile: { id: input.userId, email: users[0]?.email ?? input.email, status: users[0]?.status ?? "active" },
      history: history.map(row => ({ id: row.id, type: row.eventType, summary: row.summary, createdAt: row.createdAt.toISOString() })),
    }),
    ensureEvmWallet: async () => {
      const networks = enabledEvmNetworks();
      return { wallet: requireNetworks("evm", networks.map(row => row.id)), networks: networks.map(({ id, family, name, nativeAsset, chainId, explorerUrl, rollout }) => ({ id, family, name, nativeAsset, chainId, explorerUrl, rollout })), fundsMoved: false, signingRequired: false };
    },
    ensureAvalancheWallet: async () => { throw new Error("wallet_preparation_pending"); },
    ensureSolanaWallet: async () => {
      const network = getWalletNetwork("solana:devnet");
      return { wallet: requireNetworks("solana", [network.id]), network: { id: network.id, family: network.family, name: network.name, nativeAsset: network.nativeAsset, explorerUrl: network.explorerUrl, rollout: network.rollout }, fundsMoved: false, signingRequired: false };
    },
  });
  return result;
}
