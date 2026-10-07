import { getDb, hasDatabase } from "@/db";
import { agentUsers } from "@/db/schema";

/** Input must come from the server-verified Privy identity, never OAuth query parameters. */
export async function persistVerifiedOAuthProfile(identity: { id: string; email: string }) {
  if (!identity.id.startsWith("did:privy:") || !identity.email.trim()) throw new Error("stytch_email_required");
  if (!hasDatabase()) throw new Error("database_not_configured");
  const now = new Date();
  const email = identity.email.trim().toLowerCase();
  try {
    await getDb().insert(agentUsers).values({ id: identity.id, email, lastSeenAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: agentUsers.id, set: { email, lastSeenAt: now, updatedAt: now } });
  } catch { throw new Error("wallet_persistence_unavailable"); }
}
