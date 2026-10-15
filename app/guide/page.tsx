import GuideClient from "./guide-client";

export const metadata = {
  title: "Getting started | Carmelita",
  description:
    "Connect your personal agent with ChatGPT and explore your multichain test accounts, recent Carmelita activity and market quotes. Follow the manual guide and authorize read-only access.",
};

export default function GuidePage() {
  return <GuideClient />;
}
