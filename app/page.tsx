import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita, your personal agent in ChatGPT",
  description: "Your personal agent in ChatGPT for Stellar Testnet, personal information and market data from sources such as CoinGecko and CoinMarketCap. UNBLCK is a linked-service pilot with access validation pending.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Stellar, market data and linked-service information in a conversation. Connect manually with a ChatGPT account that allows custom MCP connectors. UNBLCK requires linked access; pilot access validation is pending.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, your personal agent in ChatGPT. Illustrative Stellar Testnet query. Application connections are in development." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Stellar Testnet, personal information and market-data sources in ChatGPT. Linked-service pilots require their own account connection.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
