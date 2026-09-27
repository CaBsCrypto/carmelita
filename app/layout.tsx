import type { Metadata } from "next";
import "./globals.css";
import "./home-experience.css";
import WebMcpRegistry from "./webmcp-registry";
import Providers from "./providers";
import { isEvmExpansionEnabled } from "./wallets/networks";

export const metadata: Metadata = {
  metadataBase: new URL("https://agente-asistente.vercel.app"),
  title: "Carmelita | Knows you. Acts for you.",
  description:
    "Carmelita is a trilingual, non-custodial agent that knows your context and acts within your rules.",
  openGraph: {
    title: "Carmelita | Knows you. Acts for you.",
    description:
      "Carmelita turns requests into controlled actions through policy, explicit authority and durable receipts.",
    url: "https://agente-asistente.vercel.app",
    siteName: "Carmelita",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Carmelita action flow" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita | Knows you. Acts for you.",
    description:
      "Carmelita knows you, acts for you and keeps every sensitive action under your control.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
    process.env.PRIVY_APP_ID?.trim();
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim();

  return (
    <html lang="en">
      <body>
        <Providers appId={appId} clientId={clientId} evmExpansionEnabled={isEvmExpansionEnabled()}>
          <WebMcpRegistry />
          {children}
        </Providers>
      </body>
    </html>
  );
}
