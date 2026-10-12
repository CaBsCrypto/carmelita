import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Desarrolladores | Carmelita",
  description: "Propón tu servicio a Carmelita con un formulario sencillo y envíalo a revisión. Prepara un piloto de lectura con permisos claros; el envío no publica automáticamente la integración.",
};

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return children;
}
