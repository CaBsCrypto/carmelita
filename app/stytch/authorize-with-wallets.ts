import { provisionUserWallets } from "@/app/wallets/onboarding";
import { persistVerifiedOAuthProfile } from "./oauth-profile";
import { assertPreviewIsolation, type PreviewIsolationEnvironment } from "@/app/preview-isolation";
import { assertExistingOAuthWallets } from "./existing-oauth-wallets";

/** Select by raw intent so invalid isolation never falls back to provisioning. */
export function existingOAuthWalletsRequired(env: PreviewIsolationEnvironment = process.env): boolean {
  return env.CARMELITA_TEMPO_TESTNET_ENABLED === "true" &&
    (env.VERCEL_ENV === "preview" || env.CARMELITA_PREVIEW_ISOLATED === "true");
}

/** Prepare the authenticated owner's registry before issuing an OAuth grant. */
export async function prepareOAuthWallets(
  identity: { id: string; email: string },
  provision: typeof provisionUserWallets = provisionUserWallets,
  persistProfile: typeof persistVerifiedOAuthProfile = persistVerifiedOAuthProfile,
  options: { env?: PreviewIsolationEnvironment; validateExisting?: typeof assertExistingOAuthWallets } = {},
) {
  const env = options.env ?? process.env;
  if (existingOAuthWalletsRequired(env)) {
    assertPreviewIsolation(env);
    await (options.validateExisting ?? assertExistingOAuthWallets)(identity.id);
    return;
  }
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
