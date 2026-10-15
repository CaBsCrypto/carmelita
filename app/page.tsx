import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita, your personal agent in ChatGPT",
  description: "Your activity in one conversation with Carmelita, your personal agent in ChatGPT. Check registered multichain test wallets, recent Carmelita activity and market data, with permissions you control. Further application connections are in development.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Your personal agent for multichain account queries, recent Carmelita activity and market data in ChatGPT. Wallets use five Testnet / Devnet networks. Your account must allow custom MCP connectors. Further application connections are in development.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, your activity in one conversation. Illustrative multichain wallet query across five test networks. Application connections are in development." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Your activity in one conversation. Check your registered multichain test wallets, recent Carmelita activity and market data through ChatGPT. Connect manually and choose your permissions.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
