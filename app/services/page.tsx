import type { Metadata } from "next";
import { readBazaarCatalog } from "@/app/connectors/bazaar-catalog";
import ServicesClient from "./services-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servicios | Carmelita",
  description: "Explora los servicios y flujos publicados en Bazaar. Consulta su disponibilidad y las funciones que siguen pendientes de validación.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const catalog = await readBazaarCatalog();
  return <ServicesClient catalog={catalog} />;
}
