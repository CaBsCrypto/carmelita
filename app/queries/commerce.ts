import { z } from "zod";
import { getCommerceCatalogOffer, searchCommerceCatalog } from "@/app/commerce-catalog-read";
import { defineQuery } from "./types";

type CommerceQueryDependencies = {
  search: (input: { query: string; kind?: "finance" | "reservation" | "task" | "travel" | "product" | "service" }) => Promise<unknown>;
  detail: (offerId: string) => Promise<unknown>;
};
const defaults: CommerceQueryDependencies = { search: searchCommerceCatalog, detail: getCommerceCatalogOffer };

async function catalogRead(operation: () => Promise<unknown>) {
  try { return await operation(); }
  catch (error) {
    const missing = error instanceof Error && error.message === "offer_not_found";
    return {
      status: missing ? "not_found" : "unavailable",
      code: missing ? "offer_not_found" : "commerce_catalog_unavailable",
      source: "Carmelita public service catalog", readOnly: true,
      dataScope: "public_catalog_metadata",
    };
  }
}

export function createCommerceQueries(overrides: Partial<CommerceQueryDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides };
  return [
    defineQuery({
      id: "commerce.catalog.search", toolName: "read_commerce_catalog_search", title: "Search the public service catalog",
      description: "Read matching built-in demo and published provider offer descriptions. Distinguish catalogSource; publication is not proof of booking, payment, fulfillment or execution availability. Never prepare an intent or expose drafts, provider contacts or credentials.",
      inputSchema: z.object({
        query: z.string().max(120).default(""),
        kind: z.enum(["finance", "reservation", "task", "travel", "product", "service"]).optional(),
      }).strict(),
      scope: "agent:read", dataScope: "public_catalog_metadata",
      execute: (input) => catalogRead(() => dependencies.search(input)),
    }),
    defineQuery({
      id: "commerce.catalog.detail", toolName: "read_commerce_catalog_detail", title: "Read a public service catalog offer",
      description: "Read one built-in demo or published provider offer by its public identifier. Private draft/paused/archived offers remain missing. This read grants no authorization and creates no intent, reservation or payment.",
      inputSchema: z.object({ offerId: z.string().min(1).max(128) }).strict(),
      scope: "agent:read", dataScope: "public_catalog_metadata",
      execute: ({ offerId }) => catalogRead(() => dependencies.detail(offerId)),
    }),
  ];
}

export const commerceQueries = createCommerceQueries();
