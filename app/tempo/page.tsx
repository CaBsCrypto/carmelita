import Link from "next/link";
import { notFound } from "next/navigation";
import BrandLockup from "@/app/brand-lockup";
import { isTempoTestnetEnabled } from "@/app/wallets/networks";
import TempoClient from "./tempo-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tempo Testnet | Carmelita",
  description: "Consulta PathUSD en Tempo Moderato con tu wallet EVM existente.",
};

export default function TempoPage() {
  if (!isTempoTestnetEnabled()) notFound();
  const configured = Boolean(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || process.env.PRIVY_APP_ID?.trim(),
  );
  return <main className="shell" style={{ padding: "48px 24px" }}>
    <nav aria-label="Navegación de Tempo"><Link href="/" aria-label="Inicio"><BrandLockup /></Link></nav>
    <h1>Tu wallet en Tempo Testnet</h1>
    <p>Consulta PathUSD en Moderato, red 42431, usando tu wallet EVM existente. Los tokens de prueba no tienen valor real.</p>
    {configured ? <TempoClient /> : <p role="status">El acceso a Tempo no está disponible en este momento.</p>}
  </main>;
}
