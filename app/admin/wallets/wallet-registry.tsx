"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLockup from "@/app/brand-lockup";
import type { AdminWalletUser } from "@/app/admin/wallets/data";

type Registry = {
  generatedAt: string;
  summary: {
    users: number;
    wallets: number;
    completeUsers: number;
    needsAttention: number;
    missingStellar: number;
    missingAvalanche: number;
  };
  users: AdminWalletUser[];
};

function shortDid(value: string) {
  return value.length > 30 ? `${value.slice(0, 18)}…${value.slice(-8)}` : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WalletRegistry({
  initialRegistry,
  founderName,
}: {
  initialRegistry: Registry;
  founderName: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<"all" | "complete" | "attention">("all");
  const [network, setNetwork] = useState<"all" | "stellar:testnet" | "avalanche:fuji">("all");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return initialRegistry.users.filter((user) => {
      const searchable = [user.email, user.privyDid, ...user.wallets.flatMap((wallet) => [wallet.address, wallet.network])]
        .filter(Boolean).join(" ").toLowerCase();
      return (
        (!needle || searchable.includes(needle)) &&
        (health === "all" || (health === "complete" ? user.complete : !user.complete)) &&
        (network === "all" || user.wallets.some((wallet) => wallet.network === network))
      );
    });
  }, [health, initialRegistry.users, network, search]);

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <main className="admin-page wallet-registry-page">
      <header className="admin-topbar">
        <Link className="brand" href="/"><BrandLockup /></Link>
        <div>
          <span className="admin-live"><i /> Private workspace</span>
          <span className="admin-founder">{founderName}</span>
          <Link className="admin-stellar-link" href="/admin">Waitlist</Link>
          <Link className="admin-stellar-link" href="/admin/providers">MCP Providers</Link>
          <Link className="admin-stellar-link" href="/admin/stellar">Stellar Lab</Link>
        </div>
      </header>

      <div className="admin-main wallet-registry-shell">
        <section className="admin-heading wallet-registry-heading">
          <div>
            <p className="eyebrow">IDENTITY & WALLET INTEGRITY</p>
            <h1>Users and Testnet wallets.</h1>
            <p>Inspect whether every persisted Privy identity has one Stellar wallet and one EVM wallet assigned to Avalanche Fuji. Public addresses only; Explorer links provide the on-chain check.</p>
          </div>
          <div className="admin-heading-actions">
            <button type="button" onClick={() => router.refresh()}>Refresh registry</button>
            <small>Generated {formatDate(initialRegistry.generatedAt)}</small>
          </div>
        </section>

        <section className="wallet-registry-kpis" aria-label="Wallet integrity summary">
          <article><span>Privy users</span><strong>{initialRegistry.summary.users}</strong><small>Persisted identities</small></article>
          <article><span>Wallets</span><strong>{initialRegistry.summary.wallets}</strong><small>Public addresses indexed</small></article>
          <article className="good"><span>Complete</span><strong>{initialRegistry.summary.completeUsers}</strong><small>Stellar + Avalanche</small></article>
          <article className={initialRegistry.summary.needsAttention ? "warning" : "good"}><span>Needs attention</span><strong>{initialRegistry.summary.needsAttention}</strong><small>{initialRegistry.summary.missingStellar} Stellar · {initialRegistry.summary.missingAvalanche} Avalanche</small></article>
        </section>

        <section className="wallet-registry-workspace">
          <header>
            <div><p className="eyebrow">REGISTRY</p><h2>Verify every onboarding</h2></div>
            <p><strong>{filtered.length}</strong> of {initialRegistry.users.length} users</p>
          </header>

          <div className="wallet-registry-filters">
            <label><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, Privy DID or address…" /></label>
            <label><span>Integrity</span><select value={health} onChange={(event) => setHealth(event.target.value as typeof health)}><option value="all">All users</option><option value="complete">Complete</option><option value="attention">Needs attention</option></select></label>
            <label><span>Network</span><select value={network} onChange={(event) => setNetwork(event.target.value as typeof network)}><option value="all">All networks</option><option value="stellar:testnet">Stellar Testnet</option><option value="avalanche:fuji">Avalanche Fuji</option></select></label>
            <button type="button" onClick={() => { setSearch(""); setHealth("all"); setNetwork("all"); }}>Clear</button>
          </div>

          <div className="wallet-user-list">
            {filtered.length === 0 && <div className="wallet-registry-empty">No users match those filters.</div>}
            {filtered.map((user) => (
              <article className="wallet-user" key={user.privyDid}>
                <header>
                  <div><span className="wallet-user-avatar">{(user.email || "P").charAt(0).toUpperCase()}</span><div><strong>{user.email || "Email unavailable"}</strong><code title={user.privyDid}>{shortDid(user.privyDid)}</code></div></div>
                  <div><span className={user.complete ? "wallet-health complete" : "wallet-health attention"}>{user.complete ? "Complete" : "Needs attention"}</span><small>Last seen {formatDate(user.lastSeenAt)}</small></div>
                </header>
                {!user.complete && <div className="wallet-integrity-alert">{user.missingNetworks.map((item) => <span key={`missing:${item}`}>Missing {item}</span>)}{user.duplicateNetworks.map((item) => <span key={`duplicate:${item}`}>Duplicate {item}</span>)}</div>}
                <div className="wallet-records">
                  <div className="wallet-record-head"><span>Network</span><span>Public address</span><span>Status</span><span>Created</span><span /></div>
                  {user.wallets.map((wallet) => (
                    <div className="wallet-record" key={`${wallet.network}:${wallet.address}`}>
                      <div><strong>{wallet.networkName}</strong><small>{wallet.chainType}</small></div>
                      <code>{wallet.address}</code><span className="wallet-record-status">{wallet.status}</span><time dateTime={wallet.createdAt}>{formatDate(wallet.createdAt)}</time>
                      <div className="wallet-record-actions"><button type="button" onClick={() => copyAddress(wallet.address)}>{copied === wallet.address ? "Copied" : "Copy"}</button>{wallet.explorerUrl && <a href={wallet.explorerUrl} target="_blank" rel="noreferrer">Explorer ↗</a>}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
