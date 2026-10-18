import BazaarAgentLink from "./bazaar-agent-link";
import { existingOAuthWalletsRequired } from "@/app/wallets/existing-wallet-mode";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Connect your Bazaar agent | Carmelita",
  description: "Connect an existing Bazaar agent to your private order history in Carmelita.",
  robots: { index: false, follow: true },
};

export default function BazaarAgentLinkPage() {
  // The same existing policy controls RootLayout's PrivyProvider createOnLogin.
  // Never start a new login here unless that provider disables wallet creation.
  return <BazaarAgentLink safeSignInAvailable={existingOAuthWalletsRequired()} />;
}
