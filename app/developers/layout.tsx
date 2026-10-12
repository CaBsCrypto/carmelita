import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Developers — Build for a multichain agent | Carmelita",
  description: "Propose an API or MCP integration alongside Carmelita's multichain accounts, recent Carmelita activity and market data. Start with a reviewed read-only pilot and permissions per account; submission does not approve or activate your service.",
};

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return children;
}
