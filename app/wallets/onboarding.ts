import { persistAgentAccount } from "@/app/agent-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { ensureAvalancheFujiWallet } from "@/app/wallets/avalanche-onboarding";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import type { UserWallet } from "@/app/wallets/types";

type StellarAccount = Awaited<ReturnType<typeof getStellarTestnetAccount>>;
type AgentAccount = Awaited<ReturnType<typeof persistAgentAccount>>;
type AvalancheAccount = Awaited<ReturnType<typeof ensureAvalancheFujiWallet>>;

export type WalletOnboardingDependencies = {
  getOrCreateStellarWallet: (userId: string) => Promise<UserWallet>;
  getStellarAccount: (address: string) => Promise<StellarAccount>;
  persistStellarAccount: (input: {
    userId: string;
    email: string | null;
    wallet: UserWallet;
    activation: "active" | "pending";
  }) => Promise<AgentAccount>;
  ensureAvalancheWallet: (input: {
    userId: string;
    email: string | null;
  }) => Promise<AvalancheAccount>;
};

const defaultDependencies: WalletOnboardingDependencies = {
  getOrCreateStellarWallet: (userId) => getOrCreateUserWallet(userId, "stellar"),
  getStellarAccount: getStellarTestnetAccount,
  persistStellarAccount: persistAgentAccount,
  ensureAvalancheWallet: ensureAvalancheFujiWallet,
};

export async function provisionUserWallets(
  input: { userId: string; email: string | null },
  dependencies: WalletOnboardingDependencies = defaultDependencies,
) {
  if (!input.userId.startsWith("did:privy:")) {
    throw new Error("invalid_privy_user_id");
  }

  const stellar = await dependencies.getOrCreateStellarWallet(input.userId);
  if (
    stellar.family !== "stellar" ||
    stellar.chainType !== "stellar" ||
    stellar.owner !== "user"
  ) {
    throw new Error("privy_invalid_stellar_wallet_response");
  }

  const account = await dependencies.getStellarAccount(stellar.address);
  const activation: "active" | "pending" = account.exists
    ? "active"
    : "pending";
  const agentAccount = await dependencies.persistStellarAccount({
    userId: input.userId,
    email: input.email,
    wallet: stellar,
    activation,
  });
  const avalanche = await dependencies.ensureAvalancheWallet(input);

  return {
    stellar,
    avalanche,
    account,
    activation,
    agentAccount,
    fundsMoved: false as const,
    signingRequired: false as const,
  };
}
