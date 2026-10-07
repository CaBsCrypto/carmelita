import { provisionUserWallets } from "@/app/wallets/onboarding";

/** Prepare the authenticated owner's registry before issuing an OAuth grant. */
export async function prepareOAuthWallets(
  identity: { id: string; email: string },
  provision: typeof provisionUserWallets = provisionUserWallets,
) {
  const result = await provision({ userId: identity.id, email: identity.email });
  const families = [result.preparation.stellar, result.preparation.evm, result.preparation.solana];
  if (families.some(family => family.status === "conflict")) throw new Error("wallet_identity_conflict");
  if (families.some(family => family.status !== "ready") || !result.stellar || !result.evm || !result.solana) {
    throw new Error("oauth_wallet_preparation_incomplete");
  }
}
