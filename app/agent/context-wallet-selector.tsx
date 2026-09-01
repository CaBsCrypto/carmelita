"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/app/language-toggle";

type WalletRow = { id: string; address: string; chainType: string; network: string; status: string };
type AvalancheStatus = {
  address: string; chainId: number; balance: string; nativeAsset: string; explorerUrl: string;
  balances?: {
    native: { asset: string; balance: string };
    usdc: { asset: string; balance: string; contract: string };
  };
};

type SolanaStatus = { address: string; network: string; balance: string; sol: number; explorerUrl: string };

const copy = {
  en: { wallets: "Wallets", identity: "Privy identity", stellar: "Stellar", avalanche: "Avalanche", solana: "Solana", testnet: "Testnet", fuji: "Fuji Testnet", devnet: "Devnet", address: "Address", balances: "Balances", network: "Network", open: "Open multichain wallet selector", explorer: "View on explorer", loading: "Loading wallet", unavailable: "Not activated", active: "Active" },
  es: { wallets: "Wallets", identity: "Identidad Privy", stellar: "Stellar", avalanche: "Avalanche", solana: "Solana", testnet: "Testnet", fuji: "Fuji Testnet", devnet: "Devnet", address: "Dirección", balances: "Saldos", network: "Red", open: "Abrir selector de wallets multichain", explorer: "Ver en explorador", loading: "Cargando wallet", unavailable: "No activada", active: "Activa" },
  pt: { wallets: "Wallets", identity: "Identidade Privy", stellar: "Stellar", avalanche: "Avalanche", solana: "Solana", testnet: "Testnet", fuji: "Fuji Testnet", devnet: "Devnet", address: "Endereço", balances: "Saldos", network: "Rede", open: "Abrir seletor de wallets multichain", explorer: "Ver no explorador", loading: "Carregando wallet", unavailable: "Não ativada", active: "Ativa" },
} as const;

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function ContextWalletSelector({ locale, stellarAddress, stellarXlmBalance, stellarUsdcBalance, getAccessToken }: {
  locale: Locale;
  stellarAddress: string;
  stellarXlmBalance: string;
  stellarUsdcBalance: string | null;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [avalanche, setAvalanche] = useState<AvalancheStatus | null>(null);
  const [solana, setSolana] = useState<SolanaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadWallets() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const listResponse = await fetch("/api/agent/wallets", { headers, cache: "no-store" });
        const list = await listResponse.json();
        if (!listResponse.ok) return;
        const nextWallets = (list.wallets ?? []) as WalletRow[];
        if (active) setWallets(nextWallets);
        if (nextWallets.some((wallet) => wallet.network === "avalanche:fuji")) {
          const statusResponse = await fetch("/api/agent/wallets/avalanche", { headers, cache: "no-store" });
          const status = await statusResponse.json();
          if (active && statusResponse.ok) setAvalanche(status);
        }
        if (nextWallets.some((wallet) => wallet.network === "solana:devnet")) {
          const solanaResponse = await fetch("/api/agent/wallets/solana", { headers, cache: "no-store" });
          const solanaStatus = await solanaResponse.json();
          if (active && solanaResponse.ok) setSolana(solanaStatus);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadWallets();
    return () => { active = false };
  }, [getAccessToken]);

  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const evmWallet = wallets.find((wallet) => wallet.network === "avalanche:fuji" && wallet.status === "active");
  const solanaWallet = wallets.find((wallet) => wallet.network === "solana:devnet" && wallet.status === "active");

  return (
    <details className="context-wallet-selector" ref={detailsRef}>
      <summary aria-label={t.open}>
        <span className="context-wallet-icon" aria-hidden="true">◎</span>
        <span><small>{t.wallets}</small><strong>Stellar + Avalanche + Solana</strong></span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className="context-wallet-menu">
        <header><span>{t.identity}</span><b>{[true, evmWallet, solanaWallet].filter(Boolean).length} {t.wallets.toLowerCase()}</b></header>
        <article className="context-wallet-network is-active">
          <div className="context-wallet-network-heading">
            <span className="context-chain-mark">S</span><div><strong>{t.stellar}</strong><small>{t.testnet}</small></div><i>{t.active}</i>
          </div>
          <dl>
            <div><dt>{t.address}</dt><dd title={stellarAddress}>{shortAddress(stellarAddress)}</dd></div>
            <div><dt>{t.balances}</dt><dd>{stellarXlmBalance} XLM · {stellarUsdcBalance ?? "—"} USDC</dd></div>
            <div><dt>{t.network}</dt><dd>Stellar Testnet</dd></div>
          </dl>
          <a href={`https://stellar.expert/explorer/testnet/account/${stellarAddress}`} target="_blank" rel="noreferrer">{t.explorer} ↗</a>
        </article>
        <article className={`context-wallet-network ${evmWallet ? "is-active" : ""}`}>
          <div className="context-wallet-network-heading">
            <span className="context-chain-mark">A</span><div><strong>{t.avalanche}</strong><small>{t.fuji}</small></div><i>{evmWallet ? t.active : loading ? "…" : t.unavailable}</i>
          </div>
          {evmWallet ? <>
            <dl>
              <div><dt>{t.address}</dt><dd title={evmWallet.address}>{shortAddress(evmWallet.address)}</dd></div>
              <div><dt>{t.balances}</dt><dd>{avalanche?.balances?.native.balance ?? avalanche?.balance ?? "—"} AVAX · {avalanche?.balances?.usdc.balance ?? "—"} USDC</dd></div>
              <div><dt>{t.network}</dt><dd>Fuji · 43113</dd></div>
            </dl>
            {avalanche?.explorerUrl && <a href={avalanche.explorerUrl} target="_blank" rel="noreferrer">{t.explorer} ↗</a>}
          </> : <p>{loading ? t.loading : t.unavailable}</p>}
        </article>
        <article className={`context-wallet-network ${solanaWallet ? "is-active" : ""}`}>
          <div className="context-wallet-network-heading">
            <span className="context-chain-mark">◎</span><div><strong>{t.solana}</strong><small>{t.devnet}</small></div><i>{solanaWallet ? t.active : loading ? "…" : t.unavailable}</i>
          </div>
          {solanaWallet ? <>
            <dl>
              <div><dt>{t.address}</dt><dd title={solanaWallet.address}>{shortAddress(solanaWallet.address)}</dd></div>
              <div><dt>{t.balances}</dt><dd>{solana?.balance ?? "—"}</dd></div>
              <div><dt>{t.network}</dt><dd>Solana Devnet</dd></div>
            </dl>
            {solana?.explorerUrl && <a href={solana.explorerUrl} target="_blank" rel="noreferrer">{t.explorer} ↗</a>}
          </> : <p>{loading ? t.loading : t.unavailable}</p>}
        </article>
      </div>
    </details>
  );
}
