import { persistActivatedWallet } from "@/app/multichain-account";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import { getWalletNetwork } from "@/app/wallets/networks";
import type { UserWallet } from "@/app/wallets/types";

export const SOLANA_ONBOARDING_NETWORK = "solana:devnet" as const;

type SolanaOnboardingDependencies = {
  getOrCreateWallet: (userId: string, family: "solana") => Promise<UserWallet>;
  persistWallet: (input: {
    userId: string;
    email: string | null;
    wallet: UserWallet;
    network: typeof SOLANA_ONBOARDING_NETWORK;
  }) => Promise<UserWallet>;
};

const defaultDependencies: SolanaOnboardingDependencies = {
  getOrCreateWallet: (userId, family) => getOrCreateUserWallet(userId, family),
  persistWallet: persistActivatedWallet,
};

export async function ensureSolanaDevnetWallet(
  input: { userId: string; email: string | null },
  dependencies: SolanaOnboardingDependencies = defaultDependencies,
) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  const wallet = await dependencies.getOrCreateWallet(input.userId, "solana");
  if (wallet.family !== "solana" || wallet.chainType !== "solana" || wallet.owner !== "user") {
    throw new Error("privy_invalid_solana_wallet_response");
  }

  await dependencies.persistWallet({
    userId: input.userId,
    email: input.email,
    wallet,
    network: SOLANA_ONBOARDING_NETWORK,
  });

  const network = getWalletNetwork(SOLANA_ONBOARDING_NETWORK);
  return {
    wallet,
    network: {
      id: network.id,
      family: network.family,
      name: network.name,
      nativeAsset: network.nativeAsset,
      explorerUrl: network.explorerUrl,
      rollout: network.rollout,
    },
    fundsMoved: false as const,
    signingRequired: false as const,
  };
}
