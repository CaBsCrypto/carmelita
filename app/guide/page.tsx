import GuideClient from "./guide-client";

export const metadata = {
  title: "Getting started | Carmelita",
  description:
    "Connect Carmelita with ChatGPT, authorize your account and ask about Stellar Testnet. Follow the manual connection guide or sign in to Carmelita directly.",
};

export default function GuidePage() {
  return <GuideClient />;
}
