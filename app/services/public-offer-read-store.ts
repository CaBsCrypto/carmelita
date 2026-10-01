import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { serviceOffers, serviceProviders } from "@/db/schema";
import type { Kind, Offer } from "@/app/domain";

type PublicOfferRow = {
  id: string;
  merchant: string;
  title: string;
  description: string;
  kind: string;
  amount: string;
  currency: string;
  network: string;
};

type ReadDatabase = Pick<ReturnType<typeof getDb>, "select">;

// Same bounds/enums as provider publication inputs; database text is not proof
// of a valid public contract. Generated spo_<UUID> IDs fit the additive limit.
const publicOfferRowSchema = z.object({
  id: z.string().min(1).max(128),
  merchant: z.string().min(2).max(160),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  kind: z.enum(["finance", "reservation", "task", "travel", "product", "service"]),
  amount: z.string().max(30),
  currency: z.literal("USDC"),
  network: z.enum(["stellar-testnet", "base-sepolia", "avalanche-fuji", "offchain-demo"]),
});

// Deliberately exclude provider identity/contact, metadata and credentials.
const publicColumns = {
  id: serviceOffers.id,
  merchant: serviceProviders.name,
  title: serviceOffers.title,
  description: serviceOffers.description,
  kind: serviceOffers.kind,
  amount: serviceOffers.amount,
  currency: serviceOffers.currency,
  network: serviceOffers.network,
};

function publicOffer(row: PublicOfferRow): Offer {
  const parsed = publicOfferRowSchema.safeParse(row);
  if (!parsed.success) throw new Error("commerce_catalog_invalid_offer");
  const offer = parsed.data;
  const amount = Number(offer.amount);
  if (!/^\d+(?:\.\d{1,7})?$/.test(offer.amount) || !Number.isFinite(amount) || amount > 1_000_000) {
    throw new Error("commerce_catalog_invalid_amount");
  }
  return {
    id: offer.id, merchant: offer.merchant, title: offer.title, description: offer.description,
    kind: offer.kind, amount, currency: offer.currency,
    network: offer.network, availability: "partner_pending",
  };
}

/** Pure SELECT: a catalog query must not provision its schema or providers. */
export async function readPublishedServiceOffers(
  query = "",
  kind?: Kind,
  database: ReadDatabase = getDb(),
): Promise<Offer[]> {
  const rows = await database.select(publicColumns).from(serviceOffers)
    .innerJoin(serviceProviders, eq(serviceOffers.providerId, serviceProviders.id))
    .where(eq(serviceOffers.status, "published"));
  const normalized = query.trim().toLowerCase();
  return rows.map(publicOffer).filter((offer) =>
    (!kind || offer.kind === kind) && (!normalized ||
      `${offer.title} ${offer.description} ${offer.merchant}`.toLowerCase().includes(normalized)),
  );
}

/** A requested ID never exposes a draft, paused or archived provider offer. */
export async function readPublishedServiceOffer(
  offerId: string,
  database: ReadDatabase = getDb(),
): Promise<Offer> {
  const rows = await database.select(publicColumns).from(serviceOffers)
    .innerJoin(serviceProviders, eq(serviceOffers.providerId, serviceProviders.id))
    .where(and(eq(serviceOffers.id, offerId), eq(serviceOffers.status, "published")))
    .limit(1);
  if (!rows[0]) throw new Error("offer_not_found");
  return publicOffer(rows[0]);
}
