import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Developers | Carmelita",
  description: "Propose your service to Carmelita with a simple form and send it for review. Prepare a read-only pilot with clear permissions; submitting does not publish or activate the integration.",
};

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return children;
}
