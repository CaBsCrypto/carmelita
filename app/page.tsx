import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita, your personal agent in ChatGPT",
  description: "Ask Carmelita about your Stellar Testnet account and market data from ChatGPT. Connect your account manually and choose the permissions you share. Further application connections are in development.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Your personal information and market data, in the same conversation. Start with an illustrative Stellar Testnet query. Your ChatGPT account must allow custom MCP connectors. Further application connections are in development.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, your personal agent in ChatGPT. Illustrative Stellar Testnet query. Application connections are in development." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Ask about your Stellar Testnet account and market data with Carmelita in ChatGPT. Connect manually and authorize your account. Further application connections are in development.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
