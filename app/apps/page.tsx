import AppsClient from "./apps-client";
export const metadata = { title: "My apps | Carmelita", description: "Choose approved applications for your own Carmelita account. Review permissions and manage your private connections.", robots: { index: false, follow: false } };
export default function AppsPage() {
  return <AppsClient configured={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim())} />;
}
