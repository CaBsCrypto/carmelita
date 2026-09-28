import { requireAdminPage } from "@/app/admin/auth";
import { buildAdminWalletRegistry, listAdminWalletRegistry } from "@/app/admin/wallets/data";
import { hasDatabase } from "@/db";
import { readOperationalDiagnostics } from "./operational-diagnostics";
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
  const diagnostics = await readOperationalDiagnostics(identity);
  return <>
    <WalletRegistry initialRegistry={registry} founderName={identity.displayName} />
    {diagnostics && <details><summary>Verificación operativa de producción</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>}
  </>;
}
