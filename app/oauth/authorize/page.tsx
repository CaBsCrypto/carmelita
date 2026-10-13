import ConsentClient from "./consent-client";
import { existingOAuthWalletsRequired } from "@/app/stytch/authorize-with-wallets";

export const dynamic = "force-dynamic";

export default function OAuthAuthorizePage() {
  return <ConsentClient existingWalletsOnly={existingOAuthWalletsRequired()} />;
}
