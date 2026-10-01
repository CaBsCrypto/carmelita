import GuideClient from "./guide-client";

export const metadata = {
  title: "New user guide | Carmelita",
  description:
    "Sign in with Privy, query your Stellar, EVM and Solana test wallets, and explore Carmelita from chat.",
};

export default function GuidePage() {
  return <GuideClient />;
}
