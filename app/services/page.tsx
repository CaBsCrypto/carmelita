import type { Metadata } from "next";
import { readBazaarCatalog } from "@/app/connectors/bazaar-catalog";
import ServicesClient from "./services-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service catalog | Carmelita",
  description: "Explore the services and workflows listed in Bazaar, check their reported availability and see which features still need validation. Listing does not enable purchases or service execution.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const catalog = await readBazaarCatalog();
  return <ServicesClient catalog={catalog} />;
}
