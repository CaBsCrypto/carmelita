import { provisionUserWallets, type WalletOnboardingDependencies } from "@/app/wallets/onboarding";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { persistActivatedWallet, persistWalletNetworks } from "@/app/multichain-account";
import { ensureEvmTestnetWallet } from "@/app/wallets/evm-onboarding";
import { ensureAvalancheFujiWallet } from "@/app/wallets/avalanche-onboarding";
import { ensureSolanaDevnetWallet } from "@/app/wallets/solana-onboarding";
import { ensureStellarTestnetActivation } from "@/app/wallets/stellar-activation";

/** Reuse immutable identities and activate Stellar Testnet without creating a user session. */
export const recoveryProvisionDependencies: WalletOnboardingDependencies = {
  activateStellar: ensureStellarTestnetActivation,
  getOrCreateStellarWallet: userId => getOrCreateUserWallet(userId, "stellar"),
  getStellarAccount: address => getStellarTestnetAccount(address, AbortSignal.timeout(8000)),
  persistStellarAccount: async input => {
    await persistWalletNetworks({ ...input, networks: ["stellar:testnet"],
      status: input.activation === "active" ? "active" : "pending",
      preserveExistingStatus: input.activation === "unknown", preserveUserActivity: true });
    return { persistence: { configured: true, provider: "Neon Postgres" },
      profile: { id: input.userId, email: input.email, status: "active" }, history: [] };
  },
  updateStellarStatus: (wallet, input, activation) => persistWalletNetworks({ ...input, wallet,
    networks: ["stellar:testnet"], status: activation, preserveUserActivity: true }),
  ensureEvmWallet: input => ensureEvmTestnetWallet(input, {
    getOrCreateWallet: getOrCreateUserWallet,
    persistNetworks: next => persistWalletNetworks({ ...next, preserveUserActivity: true }),
  }),
  ensureAvalancheWallet: input => ensureAvalancheFujiWallet(input, {
    getOrCreateWallet: getOrCreateUserWallet,
    persistWallet: next => persistActivatedWallet({ ...next, preserveUserActivity: true }),
  }),
  ensureSolanaWallet: input => ensureSolanaDevnetWallet(input, {
    getOrCreateWallet: getOrCreateUserWallet,
    persistWallet: next => persistActivatedWallet({ ...next, preserveUserActivity: true }),
  }),
};

export function provisionRecoveryWallets(input: { userId: string; email: string }) {
  return provisionUserWallets(input, recoveryProvisionDependencies);
}
