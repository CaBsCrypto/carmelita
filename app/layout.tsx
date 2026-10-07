import type { Metadata } from "next";
import "./globals.css";
import "./home-experience.css";
import WebMcpRegistry from "./webmcp-registry";
import Providers from "./providers";
import { isEvmExpansionEnabled } from "./wallets/networks";
import { connectionConfiguration } from "./connect-chatgpt/connection-config";
import { ConnectionEnvironmentProvider } from "./connect-chatgpt/connection-environment";

export const metadata: Metadata = {
  metadataBase: new URL("https://carmelita.browns.studio"),
  title: "Carmelita | Wallets and market, in one conversation",
  description:
    "Ask about your Testnet wallets, token prices and network TVL in English, Spanish or Portuguese.",
  openGraph: {
    title: "Carmelita | Wallets and market, in one conversation",
    description:
      "Check Testnet wallets and Mainnet market data with Carmelita.",
    url: "https://carmelita.browns.studio",
    siteName: "Carmelita",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Carmelita action flow" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita | Wallets and market, in one conversation",
    description:
      "Check Testnet wallets and Mainnet market data with Carmelita.",
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
          <ConnectionEnvironmentProvider value={{ ...connectionConfiguration({ CARMELITA_PUBLIC_ORIGIN: process.env.CARMELITA_PUBLIC_ORIGIN, VERCEL_ENV: process.env.VERCEL_ENV }), signInAvailable: Boolean(appId && process.env.PRIVY_APP_SECRET?.trim()) }}>
          <WebMcpRegistry />
          {children}
          </ConnectionEnvironmentProvider>
        </Providers>
      </body>
    </html>
  );
}
