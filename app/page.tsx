import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita, in ChatGPT",
  description: "Connect Carmelita with ChatGPT to consult your account, wallet balances and status, and Web3 market data. Start with Stellar Testnet.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita, in ChatGPT",
    description: "Your Carmelita account and Web3 data, in a conversation. Manual setup with a ChatGPT account that allows custom MCP connectors.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, in ChatGPT. Your account and Web3 data, with an illustrative Stellar Testnet query." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, in ChatGPT",
    description: "Ask about your Carmelita account, Stellar Testnet wallet status and Web3 market data from ChatGPT.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
