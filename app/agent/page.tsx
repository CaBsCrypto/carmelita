import Link from "next/link";
import BrandLockup from "../brand-lockup";
import AgentOnboarding from "./agent-onboarding";
import { LanguageControl } from "../language-toggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your agent | Carmelita",
  description: "Meet Carmelita with user-owned Stellar, EVM and Solana test wallets. Enabled EVM networks share one address and keep separate balances.",
};

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string | string[]; draft?: string | string[] }>;
}) {
  const configured = Boolean(
    (process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ||
      process.env.PRIVY_APP_ID?.trim()) &&
      process.env.PRIVY_APP_SECRET?.trim(),
  );
  const params = await searchParams;
  const autoLogin = params.connect === "privy";
  const initialDraft = typeof params.draft === "string" && params.draft.length <= 2000 && /^\/(?:consulta|query|consultar)\s/.test(params.draft) ? params.draft : "";

  return (
    <main className="agent-page">
      <nav className="demo-nav shell">
        <Link className="brand" href="/">
          <BrandLockup />
        </Link>
        <div>
          <span>PRIVY · MULTICHAIN</span>
          <LanguageControl compact />
          <Link href="/guide">Guide</Link>
          <Link href="/demo">Demo</Link>
        </div>
      </nav>
      <AgentOnboarding configured={configured} autoLogin={autoLogin} initialDraft={initialDraft} />
    </main>
  );
}
