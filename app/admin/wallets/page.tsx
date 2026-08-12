import { requireAdminPage } from "@/app/admin/auth";
import { buildAdminWalletRegistry, listAdminWalletRegistry } from "@/app/admin/wallets/data";
import { hasDatabase } from "@/db";
import WalletRegistry from "./wallet-registry";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users & wallets | Carmelita",
  description: "Private registry for validating user-owned Testnet wallets.",
  robots: { index: false, follow: false },
};

export default async function AdminWalletsPage() {
  const identity = await requireAdminPage("/admin/wallets");
  const registry = hasDatabase()
    ? await listAdminWalletRegistry()
    : buildAdminWalletRegistry([], []);
  return <WalletRegistry initialRegistry={registry} founderName={identity.displayName} />;
}
