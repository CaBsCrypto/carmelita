import { provisionUserWallets } from "@/app/wallets/onboarding";
import { persistVerifiedOAuthProfile } from "./oauth-profile";
import { assertPreviewIsolation, type PreviewIsolationEnvironment } from "@/app/preview-isolation";
import { assertExistingOAuthWallets } from "./existing-oauth-wallets";
import { isTempoTestnetEnabled } from "@/app/wallets/networks";
import { existingOAuthWalletsRequired } from "@/app/wallets/existing-wallet-mode";
export { existingOAuthWalletsRequired } from "@/app/wallets/existing-wallet-mode";

/** Select by raw intent so invalid isolation never falls back to provisioning. */
/** Prepare the authenticated owner's registry before issuing an OAuth grant. */
export async function prepareOAuthWallets(
  identity: { id: string; email: string },
  provision: typeof provisionUserWallets = provisionUserWallets,
  persistProfile: typeof persistVerifiedOAuthProfile = persistVerifiedOAuthProfile,
  options: { env?: PreviewIsolationEnvironment; validateExisting?: typeof assertExistingOAuthWallets } = {},
) {
  const env = options.env ?? process.env;
  if (existingOAuthWalletsRequired(env)) {
    if (env.CARMELITA_TEMPO_PRODUCTION_READ_ENABLED === "true" &&
      (env.VERCEL_ENV === "production" || env.VERCEL_TARGET_ENV === "production")) {
      if (!isTempoTestnetEnabled(env)) throw new Error("oauth_existing_wallets_unavailable");
    } else {
      assertPreviewIsolation(env);
    }
    await (options.validateExisting ?? assertExistingOAuthWallets)(identity.id);
    return;
  }
  // Save the verified identity even when a wallet provider fails; retries reuse this owner.
  await persistProfile(identity);
  // Connecting an app prepares identities; it does not request testnet funding.
  const result = await provision({ userId: identity.id, email: identity.email }, undefined, { activateStellar: false });
  assertWalletPreparationComplete(result);
}

export function assertWalletPreparationComplete(result: Awaited<ReturnType<typeof provisionUserWallets>>) {
  const families = [result.preparation.stellar, result.preparation.evm, result.preparation.solana];
  if (families.some(family => family.status === "conflict")) throw new Error("wallet_identity_conflict");
  if (families.some(family => family.status !== "ready") || !result.stellar || !result.evm || !result.solana) {
    throw new Error("oauth_wallet_preparation_incomplete");
  }
}
