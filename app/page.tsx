import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita, your personal agent in ChatGPT",
  description: "Consult your Carmelita account, activity and Web3 data from ChatGPT. Start with an illustrative Stellar Testnet query. Application connections are in development.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Your account, activity and useful information, in a conversation. Connect manually with a ChatGPT account that allows custom MCP connectors.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita, your personal agent in ChatGPT. Illustrative Stellar Testnet query. Application connections are in development." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita, your personal agent in ChatGPT",
    description: "Consult your account, activity and Web3 information in ChatGPT. Application connections are in development.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
