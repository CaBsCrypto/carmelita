import type { Metadata } from "next";
import HomeExperience from "./home-experience";

export const metadata: Metadata = {
  title: "Carmelita | Your wallets, in ChatGPT",
  description: "Connect Carmelita with ChatGPT to check your own wallet addresses across Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet and Stellar Testnet.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carmelita | Your wallets, in ChatGPT",
    description: "Connect your account and ask about your wallets on five test networks. Manual setup with a compatible ChatGPT account.",
    url: "/", siteName: "Carmelita", type: "website",
    images: [{ url: "/brand/carmelita-landing-social.png", width: 1200, height: 630, alt: "Carmelita: your wallets, in ChatGPT. Testnet and Devnet." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carmelita | Your wallets, in ChatGPT",
    description: "Check your wallet addresses on five test networks from a conversation.",
    images: ["/brand/carmelita-landing-social.png"],
  },
};

export default HomeExperience;
