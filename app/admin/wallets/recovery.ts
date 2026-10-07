import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { agentActivities, agentUsers } from "@/db/schema";
import { getPrivyUserIdentity } from "@/app/privy-stellar";
import { assertWalletPreparationComplete } from "@/app/stytch/authorize-with-wallets";
import { listAdminWalletRegistry, type AdminWalletUser } from "./data";
import { provisionRecoveryWallets } from "./recovery-provision";

type VerifiedIdentity = { id: string; email: string };
export type WalletRecoveryDependencies = {
  registeredUser: (id: string) => Promise<{ id: string; status: string } | null>;
  identity: typeof getPrivyUserIdentity;
  persistProfile: (identity: VerifiedIdentity) => Promise<void>;
  provision: typeof provisionRecoveryWallets;
  registryUser: (id: string) => Promise<AdminWalletUser | null>;
  audit: (input: { userId: string; actor: string; outcome: "started" | "completed" | "failed" }) => Promise<void>;
};

const defaults: WalletRecoveryDependencies = {
  registeredUser: async id => {
    if (!hasDatabase()) throw new Error("database_not_configured");
    const [user] = await getDb().select({ id: agentUsers.id, status: agentUsers.status })
      .from(agentUsers).where(eq(agentUsers.id, id)).limit(1);
    return user ?? null;
  },
  identity: getPrivyUserIdentity,
  persistProfile: async identity => {
    const [user] = await getDb().update(agentUsers).set({ email: identity.email, updatedAt: new Date() })
      .where(and(eq(agentUsers.id, identity.id), eq(agentUsers.status, "active")))
      .returning({ id: agentUsers.id });
    if (!user) throw new Error("registered_user_inactive");
  },
  provision: provisionRecoveryWallets,
  registryUser: async id => (await listAdminWalletRegistry()).users.find(user => user.privyDid === id) ?? null,
  audit: async ({ userId, actor, outcome }) => {
    await getDb().insert(agentActivities).values({ id: randomUUID(), userId,
      eventType: `wallet.recovery.${outcome}`,
      summary: outcome === "completed" ? "Wallet registration recovered by an administrator" : "Administrator wallet recovery " + outcome,
      metadata: { source: "admin", actor, outcome, fundsMoved: false, signingRequired: false } });
  },
};

async function verifiedTarget(privyDid: string, dependencies: WalletRecoveryDependencies): Promise<VerifiedIdentity> {
  if (!/^did:privy:[A-Za-z0-9]+$/.test(privyDid) || privyDid.length > 128) throw new Error("invalid_request");
  const registered = await dependencies.registeredUser(privyDid);
  if (!registered || registered.id !== privyDid) throw new Error("registered_user_not_found");
  if (registered.status !== "active") throw new Error("registered_user_inactive");
  const identity = await dependencies.identity(privyDid).catch(() => { throw new Error("provider_identity_unavailable"); });
  if (identity.id !== privyDid) throw new Error("privy_identity_mismatch");
  const email = identity.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("verified_email_required");
  return { id: privyDid, email };
}

export async function inspectWalletRecovery(privyDid: string, dependencies = defaults) {
  const identity = await verifiedTarget(privyDid, dependencies);
  return { identity, fundsMoved: false, signingRequired: false };
}

export async function recoverRegisteredWallets(
  input: { privyDid: string; expectedEmail: string; actor: string }, dependencies = defaults,
) {
  const identity = await verifiedTarget(input.privyDid, dependencies);
  if (identity.email !== input.expectedEmail.trim().toLowerCase()) throw new Error("recovery_inspection_changed");
  const event = { userId: identity.id, actor: input.actor };
  await dependencies.audit({ ...event, outcome: "started" });
  try {
    await dependencies.persistProfile(identity);
    const preparation = await dependencies.provision({ userId: identity.id, email: identity.email });
    assertWalletPreparationComplete(preparation);
    const user = await dependencies.registryUser(identity.id);
    if (!user || user.privyDid !== identity.id || !user.registeredComplete || user.invalidAddressNetworks.length || user.status !== "active") {
      throw new Error("oauth_wallet_preparation_incomplete");
    }
    await dependencies.audit({ ...event, outcome: "completed" });
    return { identity, user, registrationComplete: true, networkActivationComplete: user.complete,
      fundsMoved: false, signingRequired: false };
  } catch (error) {
    await dependencies.audit({ ...event, outcome: "failed" }).catch(() => {});
    throw error;
  }
}
