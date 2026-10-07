import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentTestnetFaucetClaims } from "@/db/schema";

export const STELLAR_ACTIVATION_COOLDOWN_MS = 60_000;
export type StellarActivationLease = {
  id: string; userId: string; address: string; updatedAt: Date;
};
export type StellarActivationClaim = {
  lease: StellarActivationLease | null; retryAfterMs: number | null;
};
export type StellarActivationClaimStore = {
  acquire(input: { userId: string; address: string; now: Date }): Promise<StellarActivationClaim>;
  write(lease: StellarActivationLease, input: {
    status: "funding" | "confirmed" | "uncertain" | "pending";
    transactionHash: string | null; error: string | null; now: Date;
  }): Promise<boolean>;
};

/** One durable activation reservation per owner/address. Amount zero is a marker,
 * not a requested XLM quantity: Friendbot chooses the Testnet activation amount. */
export function createStellarActivationClaimStore(database: typeof getDb = getDb): StellarActivationClaimStore {
  return {
  async acquire({ userId, address, now }) {
    const db = database();
    const claimWindow = `stellar-activation:${address}`;
    const identity = and(eq(agentTestnetFaucetClaims.userId, userId),
      eq(agentTestnetFaucetClaims.asset, "XLM"), eq(agentTestnetFaucetClaims.claimWindow, claimWindow));
    const [inserted] = await db.insert(agentTestnetFaucetClaims).values({
      id: `stact_${randomUUID()}`, userId, walletAddress: address, asset: "XLM", amount: "0",
      claimWindow, status: "pending", updatedAt: now,
    }).onConflictDoNothing({ target: [agentTestnetFaucetClaims.userId,
      agentTestnetFaucetClaims.asset, agentTestnetFaucetClaims.claimWindow] }).returning();
    if (inserted) return { lease: { id: inserted.id, userId, address, updatedAt: inserted.updatedAt }, retryAfterMs: null };
    const [existing] = await db.select().from(agentTestnetFaucetClaims).where(identity).limit(1);
    if (!existing || existing.walletAddress !== address || Number(existing.amount) !== 0) throw new Error("stellar_activation_claim_invalid");
    const retryAfterMs = Math.max(0, STELLAR_ACTIVATION_COOLDOWN_MS - (now.getTime() - existing.updatedAt.getTime()));
    if (retryAfterMs > 0) return { lease: null, retryAfterMs };
    // Exactly one expired lease wins; the original timestamp also fences its old worker.
    const [leased] = await db.update(agentTestnetFaucetClaims).set({
      status: "pending", error: null, transactionHash: null, updatedAt: now,
    }).where(and(identity, eq(agentTestnetFaucetClaims.id, existing.id),
      eq(agentTestnetFaucetClaims.updatedAt, existing.updatedAt))).returning();
    return leased
      ? { lease: { id: leased.id, userId, address, updatedAt: leased.updatedAt }, retryAfterMs: null }
      : { lease: null, retryAfterMs: STELLAR_ACTIVATION_COOLDOWN_MS };
  },
  async write(lease, input) {
    const [written] = await database().update(agentTestnetFaucetClaims).set({
      status: input.status, transactionHash: input.transactionHash, error: input.error,
      // Funding records keep the lease timestamp until the terminal fenced write.
      updatedAt: input.status === "funding" ? lease.updatedAt : input.now,
    }).where(and(eq(agentTestnetFaucetClaims.id, lease.id),
      eq(agentTestnetFaucetClaims.userId, lease.userId), eq(agentTestnetFaucetClaims.walletAddress, lease.address),
      eq(agentTestnetFaucetClaims.asset, "XLM"), eq(agentTestnetFaucetClaims.claimWindow, `stellar-activation:${lease.address}`),
      eq(agentTestnetFaucetClaims.updatedAt, lease.updatedAt))).returning({ id: agentTestnetFaucetClaims.id });
    return Boolean(written);
  },
  };
}
export const stellarActivationClaims = createStellarActivationClaimStore();
