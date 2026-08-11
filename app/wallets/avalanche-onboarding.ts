import { persistActivatedWallet } from "@/app/multichain-account";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import { getWalletNetwork } from "@/app/wallets/networks";
import type { UserWallet } from "@/app/wallets/types";

export const AVALANCHE_ONBOARDING_NETWORK = "avalanche:fuji" as const;

type AvalancheOnboardingDependencies = {
  getOrCreateWallet: (userId: string, family: "evm") => Promise<UserWallet>;
  persistWallet: (input: {
    userId: string;
    email: string | null;
    wallet: UserWallet;
    network: typeof AVALANCHE_ONBOARDING_NETWORK;
  }) => Promise<UserWallet>;
};

const defaultDependencies: AvalancheOnboardingDependencies = {
  getOrCreateWallet: (userId, family) => getOrCreateUserWallet(userId, family),
  persistWallet: persistActivatedWallet,
};

export async function ensureAvalancheFujiWallet(
  input: { userId: string; email: string | null },
  dependencies: AvalancheOnboardingDependencies = defaultDependencies,
) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  const wallet = await dependencies.getOrCreateWallet(input.userId, "evm");
  if (wallet.family !== "evm" || wallet.chainType !== "ethereum" || wallet.owner !== "user") {
    throw new Error("privy_invalid_evm_wallet_response");
  }

  await dependencies.persistWallet({
    userId: input.userId,
    email: input.email,
    wallet,
    network: AVALANCHE_ONBOARDING_NETWORK,
  });

  const network = getWalletNetwork(AVALANCHE_ONBOARDING_NETWORK);
  return {
    wallet,
    network: {
      id: network.id,
      family: network.family,
      name: network.name,
      nativeAsset: network.nativeAsset,
      chainId: network.chainId,
      explorerUrl: network.explorerUrl,
      rollout: network.rollout,
    },
    fundsMoved: false as const,
    signingRequired: false as const,
  };
}
