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
  title: "Carmelita, your personal agent in ChatGPT",
  description:
    "Your activity in one conversation. Connect Carmelita with ChatGPT to check your registered multichain test wallets, recent Carmelita activity and market data. Choose your permissions. Further application connections are in development.",
  openGraph: {
    title: "Carmelita, your personal agent in ChatGPT",
    description:
      "Your personal agent for multichain account queries, recent Carmelita activity and market data in ChatGPT. Wallets use Testnet / Devnet. Connect manually and choose your permissions. Further application connections are in development.",
    url: "https://carmelita.browns.studio",
    siteName: "Carmelita",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, your activity in one conversation. Illustrative multichain wallet query across five test networks. Application connections are in development." }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, your personal agent in ChatGPT",
    description:
      "Your activity in one conversation. Check your registered multichain test wallets, recent Carmelita activity and market data through ChatGPT. Connect manually and choose your permissions.",
    images: ["/brand/carmelita-landing-social.png"],
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
