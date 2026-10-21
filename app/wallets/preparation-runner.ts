import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentUsers } from "@/db/schema";
import { getPrivyClient } from "@/app/privy-client";
import { persistWalletNetworks } from "@/app/multichain-account";
import { enabledWalletNetworks } from "./networks";
import { getOrCreateUserWallet } from "./privy";
import { claimJob, finishFamily, getStatus, type PreparationClaim } from "./preparation-store";
import { preparationCatalog } from "./preparation-config";
import type { FamilyOutcome } from "./preparation-state";

export function classifyPreparationError(error: unknown): FamilyOutcome {
  const code = error instanceof Error ? error.message : "";
  if (/conflict|ambiguous|invalid_wallet|invalid_.*wallet_response/.test(code)) return { status: "conflict", code: "identity_conflict" };
  if (/configuration|not_configured|invalid_privy_user/.test(code)) return { status: "review", code: "configuration_invalid" };
  return { status: "transient", code: /timeout|abort/i.test(code) ? "provider_timeout" : /database|persistence/.test(code) ? "database_unavailable" : "provider_unavailable" };
}
export async function prepareClaim(claim: PreparationClaim) {
  try {
    const networks = enabledWalletNetworks().filter(network => network.family === claim.family).map(network => network.id);
    if (claim.catalog !== preparationCatalog() || !networks.length) throw new Error("preparation_configuration_invalid");
    // Lookup the owner server-side before attempting any provider creation.
    const user = await getPrivyClient({ timeout: 10_000, maxRetries: 0 }).users()._get(claim.userId);
    if (user.id !== claim.userId) throw new Error("wallet_identity_conflict");
    const wallet = await getOrCreateUserWallet(claim.userId, claim.family);
    await persistWalletNetworks({ userId: claim.userId, email: null, wallet, networks,
      status: claim.family === "stellar" ? "pending" : "active", preserveExistingStatus: true, preparationClaim: claim });
    return await finishFamily(claim.token, claim.family, { status: "complete" });
  } catch (error) {
    return await finishFamily(claim.token, claim.family, classifyPreparationError(error));
  }
}
/** Three independent families, one fenced owner per family; no RPC/faucet/signing. */
export async function processPreparationUser(userId: string) {
  const [user] = await getDb().select({ status: agentUsers.status }).from(agentUsers).where(eq(agentUsers.id, userId)).limit(1);
  if (!user || user.status !== "active") return null;
  const catalog = preparationCatalog();
  const claims = await Promise.all([0, 1, 2].map(() => claimJob(userId, catalog)));
  await Promise.all(claims.filter((claim): claim is PreparationClaim => claim !== null).map(prepareClaim));
  return (await getStatus(userId, catalog))[0] ?? null;
}
