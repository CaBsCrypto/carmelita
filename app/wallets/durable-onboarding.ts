import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentUsers } from "@/db/schema";
import { enqueue } from "./preparation-store";
import { preparationCatalog } from "./preparation-config";
import { processPreparationUser } from "./preparation-runner";
import { readRegisteredOnboarding } from "./registered-onboarding";

/** Only the normal authenticated login may enroll an account for preparation. */
export async function durableOnboarding(input: { userId: string; email: string | null }) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  const db = getDb();
  try {
    await db.insert(agentUsers).values({ id: input.userId, email: input.email }).onConflictDoUpdate({ target: agentUsers.id,
      set: { email: sql`coalesce(${input.email}, ${agentUsers.email})`, lastSeenAt: new Date(), updatedAt: new Date() } });
    const [user] = await db.select({ status: agentUsers.status }).from(agentUsers).where(eq(agentUsers.id, input.userId));
    if (user?.status !== "active") throw new Error("account_disabled");
    await enqueue(input.userId, preparationCatalog(), "normal_login");
  } catch (error) {
    if (error instanceof Error && error.message === "account_disabled") throw error;
    throw new Error("wallet_persistence_unavailable");
  }
  const recovery = await processPreparationUser(input.userId);
  const onboarding = await readRegisteredOnboarding(input);
  for (const family of recovery?.families ?? []) {
    if (family.status === "complete") continue;
    onboarding.preparation[family.family] = {
      status: family.status === "conflict" ? "conflict" : "failed",
      error: family.errorCode ?? "wallet_preparation_pending",
      retryable: family.retryable && family.status !== "running",
    };
  }
  return { ...onboarding, recovery };
}
