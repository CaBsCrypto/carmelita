import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Desarrolladores | Carmelita",
  description: "Prepara una integración piloto de lectura con Carmelita. Revisa el MCP personal, los permisos, los ejemplos de consulta y la evidencia disponible.",
};

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return children;
}
