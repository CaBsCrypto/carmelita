import { and, eq } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  commerce,
  offers,
  publicIntent,
  type Intent,
  type Kind,
  type Offer,
  type Receipt,
} from "@/app/domain";
import {
  getPublishedServiceOffer,
} from "@/app/services/provider-store";
import { getCommerceCatalogOffer, legacyCatalogOffer, searchCommerceCatalog } from "@/app/commerce-catalog-read";
import { getDb, hasDatabase } from "@/db";
import {
  auditEvents,
  authorizations,
  commerceIntents,
  policyDecisions,
  receipts,
} from "@/db/schema";

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

async function resolveOffer(id: string): Promise<Offer> {
  const builtIn = offers.find((offer) => offer.id === id);
  if (builtIn) return builtIn;
  if (hasDatabase()) return getPublishedServiceOffer(id);
  throw new Error("offer_not_found");
}

const toIntent = async (id: string): Promise<Intent> => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(commerceIntents)
    .where(eq(commerceIntents.id, id));
  if (!row) throw new Error("intent_not_found");
  const [policy] = await db
    .select()
    .from(policyDecisions)
    .where(eq(policyDecisions.intentId, id));
  const [authorization] = await db
    .select()
    .from(authorizations)
    .where(eq(authorizations.intentId, id));
  const [receipt] = await db
    .select()
    .from(receipts)
    .where(eq(receipts.intentId, id));

  return {
    id: row.id,
    offerId: row.offerId,
    actorId: row.actorId,
    amount: Number(row.amount),
    currency: "USDC",
    network: row.network as Intent["network"],
    status: row.status as Intent["status"],
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    policy: policy
      ? {
          allowed: policy.allowed,
          reasons: policy.reasons,
          evaluatedAt: policy.evaluatedAt.toISOString(),
          policyVersion: "demo-v1",
        }
      : undefined,
    authorization: authorization
      ? {
          token: "",
          authorizedAt: authorization.authorizedAt.toISOString(),
          expiresAt: authorization.expiresAt.toISOString(),
        }
      : undefined,
    receipt: receipt
      ? {
          id: receipt.id,
          intentId: receipt.intentId,
          status: "simulated-settled",
          network: receipt.network as Receipt["network"],
          amount: Number(receipt.amount),
          currency: "USDC",
          transactionRef: receipt.transactionRef,
          executedAt: receipt.executedAt.toISOString(),
          fulfillment: "pending-partner-confirmation",
          replayed: false,
        }
      : undefined,
  };
};

async function audit(
  intentId: string,
  eventType: string,
  actorId?: string,
  payload: Record<string, unknown> = {},
) {
  await getDb()
    .insert(auditEvents)
    .values({
      id: "evt_" + randomUUID(),
      intentId,
      eventType,
      actorId,
      payload,
    });
}

export const backend = {
  mode: () => (hasDatabase() ? "postgres" : "memory"),

  async searchOffers(query = "", kind?: Kind) {
    return (await searchCommerceCatalog({ query, kind })).offers.map(legacyCatalogOffer);
  },

  getOffer: async (id: string) => legacyCatalogOffer((await getCommerceCatalogOffer(id)).offer),

  async createIntent(input: {
    offerId: string;
    actorId: string;
    idempotencyKey: string;
    amount?: number;
  }) {
    if (!hasDatabase()) return commerce.createIntent(input);
    const db = getDb();
    const offer = await resolveOffer(input.offerId);
    const now = Date.now();
    const id = "int_" + randomUUID();
    const inserted = await db
      .insert(commerceIntents)
      .values({
        id,
        offerId: offer.id,
        actorId: input.actorId,
        amount: String(input.amount ?? offer.amount),
        currency: "USDC",
        network: offer.network,
        status: "prepared",
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(now + 900000),
      })
      .onConflictDoNothing({ target: commerceIntents.idempotencyKey })
      .returning({ id: commerceIntents.id });

    if (!inserted.length) {
      const [existing] = await db
        .select({ id: commerceIntents.id })
        .from(commerceIntents)
        .where(eq(commerceIntents.idempotencyKey, input.idempotencyKey));
      return { intent: await toIntent(existing.id), replayed: true };
    }

    await audit(id, "intent.created", input.actorId, {
      offerId: offer.id,
    });
    return { intent: await toIntent(id), replayed: false };
  },

  async evaluatePolicy(id: string) {
    if (!hasDatabase()) return commerce.evaluatePolicy(id);
    const db = getDb();
    const intent = await toIntent(id);
    const reasons: string[] = [];
    if (Date.parse(intent.expiresAt) <= Date.now()) {
      reasons.push("intent_expired");
    }
    if (intent.amount < 0) reasons.push("invalid_amount");
    if (intent.amount > 100) reasons.push("demo_limit_exceeded");
    const allowed = !reasons.length;
    const finalReasons = reasons.length
      ? reasons
      : ["within_demo_limit", "supported_test_network"];

    await db
      .insert(policyDecisions)
      .values({
        id: "pol_" + randomUUID(),
        intentId: id,
        allowed,
        reasons: finalReasons,
        policyVersion: "demo-v1",
      })
      .onConflictDoUpdate({
        target: policyDecisions.intentId,
        set: { allowed, reasons: finalReasons, evaluatedAt: new Date() },
      });
    await db
      .update(commerceIntents)
      .set({
        status: allowed ? "policy_approved" : "rejected",
        updatedAt: new Date(),
      })
      .where(eq(commerceIntents.id, id));
    await audit(id, "policy.evaluated", intent.actorId, {
      allowed,
      reasons: finalReasons,
    });
    return toIntent(id);
  },

  async authorize(id: string, confirmed: boolean) {
    if (!hasDatabase()) return commerce.authorize(id, confirmed);
    if (!confirmed) throw new Error("explicit_confirmation_required");
    const db = getDb();
    const intent = await toIntent(id);
    if (!intent.policy?.allowed || intent.status !== "policy_approved") {
      throw new Error("policy_approval_required");
    }
    const token = "auth_" + randomBytes(24).toString("base64url");
    const now = Date.now();
    await db
      .insert(authorizations)
      .values({
        id: "authz_" + randomUUID(),
        intentId: id,
        tokenHash: tokenHash(token),
        authorizedAt: new Date(now),
        expiresAt: new Date(now + 300000),
      })
      .onConflictDoUpdate({
        target: authorizations.intentId,
        set: {
          tokenHash: tokenHash(token),
          authorizedAt: new Date(now),
          expiresAt: new Date(now + 300000),
          revokedAt: null,
        },
      });
    await db
      .update(commerceIntents)
      .set({ status: "authorized", updatedAt: new Date() })
      .where(eq(commerceIntents.id, id));
    await audit(id, "intent.authorized", intent.actorId);
    return { intent: await toIntent(id), token };
  },

  async execute(id: string, token: string) {
    if (!hasDatabase()) return commerce.execute(id, token);
    const db = getDb();
    const intent = await toIntent(id);
    const [authorization] = await db
      .select()
      .from(authorizations)
      .where(
        and(
          eq(authorizations.intentId, id),
          eq(authorizations.tokenHash, tokenHash(token)),
        ),
      );
    if (!authorization || authorization.revokedAt) {
      throw new Error("invalid_authorization");
    }
    if (authorization.expiresAt.getTime() <= Date.now()) {
      throw new Error("authorization_expired");
    }
    if (intent.status !== "authorized" && intent.status !== "executed") {
      throw new Error("authorization_required");
    }

    const digest = createHash("sha256")
      .update(intent.id + ":" + intent.idempotencyKey)
      .digest("hex");
    const receipt: Receipt = {
      id: "rcpt_" + digest.slice(0, 24),
      intentId: intent.id,
      status: "simulated-settled",
      network: intent.network,
      amount: intent.amount,
      currency: "USDC",
      transactionRef: "demo_" + digest,
      executedAt: new Date().toISOString(),
      fulfillment: "pending-partner-confirmation",
      replayed: false,
    };
    const inserted = await db
      .insert(receipts)
      .values({
        ...receipt,
        amount: String(receipt.amount),
        executedAt: new Date(receipt.executedAt),
      })
      .onConflictDoNothing({ target: receipts.intentId })
      .returning({ id: receipts.id });
    await db
      .update(commerceIntents)
      .set({ status: "executed", updatedAt: new Date() })
      .where(eq(commerceIntents.id, id));
    if (inserted.length) {
      await audit(id, "execution.simulated", intent.actorId, {
        transactionRef: receipt.transactionRef,
      });
    }
    const latest = await toIntent(id);
    return { ...latest.receipt!, replayed: !inserted.length };
  },

  async getReceipt(id: string) {
    if (!hasDatabase()) return commerce.getReceipt(id);
    return (await toIntent(id)).receipt ?? null;
  },
};

export { publicIntent };
