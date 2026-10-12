import type { Metadata } from "next";
import ConsentClient from "./consent-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authorize a connection | Carmelita",
  description: "Sign in to Carmelita, review the requested permissions and choose whether to authorize this connection.",
  robots: { index: false, follow: false },
};

export default function OAuthAuthorizePage() {
  return <ConsentClient />;
}
