import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { agentActivities } from "@/db/schema";
import { persistWalletNetworks } from "@/app/multichain-account";
import type { UserWallet } from "@/app/wallets/types";

export async function persistAgentAccount(input: {
  userId: string;
  email: string | null;
  wallet: UserWallet;
  activation: "active" | "activated" | "pending";
}) {
  if (!hasDatabase()) {
    return {
      persistence: { configured: false, provider: "Neon Postgres" },
      profile: { id: input.userId, email: input.email, status: "active" },
      history: [] as { id: string; type: string; summary: string; createdAt: string }[],
    };
  }

  // Account schema is installed by the explicit migration step. Stellar uses
  // the same immutable identity and atomic network binding as the other chains.
  await persistWalletNetworks({
    userId: input.userId,
    email: input.email,
    wallet: input.wallet,
    networks: ["stellar:testnet"],
    status: input.activation === "pending" ? "pending" : "active",
  });
  const db = getDb();
  await db.insert(agentActivities).values({
    id: randomUUID(),
    userId: input.userId,
    eventType: "session.started",
    summary: "Signed in securely with Privy",
    metadata: { provider: "privy" },
  });

  const history = await db
    .select({
      id: agentActivities.id,
      type: agentActivities.eventType,
      summary: agentActivities.summary,
      createdAt: agentActivities.createdAt,
    })
    .from(agentActivities)
    .where(eq(agentActivities.userId, input.userId))
    .orderBy(desc(agentActivities.createdAt))
    .limit(8);

  return {
    persistence: { configured: true, provider: "Neon Postgres" },
    profile: { id: input.userId, email: input.email, status: "active" },
    history: history.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
