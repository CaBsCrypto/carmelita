import { offers, type Kind, type Offer } from "@/app/domain";
import { hasDatabase } from "@/db";
import { readPublishedServiceOffer, readPublishedServiceOffers } from "@/app/services/public-offer-read-store";

export type PublicCatalogOffer = Offer & { catalogSource: "built_in_demo" | "published_provider" };
export type CommerceCatalogDependencies = {
  hasDatabase: () => boolean;
  demoOffers: readonly Offer[];
  listPublished: (query: string, kind?: Kind) => Promise<Offer[]>;
  getPublished: (offerId: string) => Promise<Offer>;
  now: () => Date;
};

const defaults: CommerceCatalogDependencies = {
  hasDatabase, demoOffers: offers, listPublished: readPublishedServiceOffers,
  getPublished: readPublishedServiceOffer, now: () => new Date(),
};

function metadata(dependencies: CommerceCatalogDependencies) {
  return {
    status: "ok" as const,
    source: "Carmelita public service catalog",
    queriedAt: dependencies.now().toISOString(),
    readOnly: true as const,
    dataScope: "public_catalog_metadata" as const,
    operationalAvailability: "not_established" as const,
    authority: { transactionPrepared: false, fundsMoved: false, reservationCreated: false },
  };
}

function publicCatalogOffer(offer: Offer, catalogSource: PublicCatalogOffer["catalogSource"]): PublicCatalogOffer {
  return {
    id: offer.id, merchant: offer.merchant, title: offer.title, description: offer.description,
    kind: offer.kind, amount: offer.amount, currency: offer.currency,
    network: offer.network, availability: offer.availability, catalogSource,
  };
}

/** The public catalog contains demo descriptions and published provider descriptions.
 * Neither publication nor this read proves payment, booking or fulfillment availability.
 */
export async function searchCommerceCatalog(
  input: { query?: string; kind?: Kind } = {},
  dependencies: CommerceCatalogDependencies = defaults,
) {
  const normalized = (input.query ?? "").trim().toLowerCase();
  const demos: PublicCatalogOffer[] = dependencies.demoOffers.filter((offer) =>
    (!input.kind || offer.kind === input.kind) && (!normalized ||
      `${offer.title} ${offer.description} ${offer.merchant}`.toLowerCase().includes(normalized)),
  ).map((offer) => publicCatalogOffer(offer, "built_in_demo"));
  const configured = dependencies.hasDatabase();
  const published: PublicCatalogOffer[] = configured
    ? (await dependencies.listPublished(input.query ?? "", input.kind))
      .map((offer) => publicCatalogOffer(offer, "published_provider"))
    : [];
  return {
    ...metadata(dependencies), offers: [...demos, ...published],
    status: configured ? "ok" as const : "partial" as const,
    publishedCatalogStatus: configured ? "available" as const : "not_configured" as const,
    demoOfferCount: demos.length,
    publishedOfferCount: published.length,
  };
}

export async function getCommerceCatalogOffer(
  offerId: string,
  dependencies: CommerceCatalogDependencies = defaults,
) {
  // Keep the legacy resolution order for identifiers shared with built-in demos.
  const demo = dependencies.demoOffers.find((offer) => offer.id === offerId);
  const offer: PublicCatalogOffer = demo
    ? publicCatalogOffer(demo, "built_in_demo")
    : dependencies.hasDatabase()
      ? publicCatalogOffer(await dependencies.getPublished(offerId), "published_provider")
      : (() => { throw new Error("offer_not_found"); })();
  return {
    ...metadata(dependencies), offer,
    status: demo ? "partial" as const : "ok" as const,
  };
}

/** Preserve the existing public commerce/MCP DTO while using the same service. */
export function legacyCatalogOffer(offer: PublicCatalogOffer): Offer {
  return {
    id: offer.id, merchant: offer.merchant, title: offer.title, description: offer.description,
    kind: offer.kind, amount: offer.amount, currency: offer.currency,
    network: offer.network, availability: offer.availability,
  };
}
