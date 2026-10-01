import GuideClient from "./guide-client";

export const metadata = {
  title: "New user guide | Carmelita",
  description:
    "Sign in with Privy, check Testnet wallets and explore market queries. Connecting ChatGPT is optional.",
};

export default function GuidePage() {
  return <GuideClient />;
}
