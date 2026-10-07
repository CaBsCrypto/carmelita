import { provisionUserWallets } from "@/app/wallets/onboarding";
import { persistVerifiedOAuthProfile } from "./oauth-profile";

/** Prepare the authenticated owner's registry before issuing an OAuth grant. */
export async function prepareOAuthWallets(
  identity: { id: string; email: string },
  provision: typeof provisionUserWallets = provisionUserWallets,
  persistProfile: typeof persistVerifiedOAuthProfile = persistVerifiedOAuthProfile,
) {
  // Save the verified identity even when a wallet provider fails; retries reuse this owner.
  await persistProfile(identity);
  const result = await provision({ userId: identity.id, email: identity.email });
  assertWalletPreparationComplete(result);
}

export function assertWalletPreparationComplete(result: Awaited<ReturnType<typeof provisionUserWallets>>) {
  const families = [result.preparation.stellar, result.preparation.evm, result.preparation.solana];
  if (families.some(family => family.status === "conflict")) throw new Error("wallet_identity_conflict");
  if (families.some(family => family.status !== "ready") || !result.stellar || !result.evm || !result.solana) {
    throw new Error("oauth_wallet_preparation_incomplete");
  }
}
