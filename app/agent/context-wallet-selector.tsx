"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/app/language-toggle";
import { useWalletReadings } from "./use-wallet-readings";

const copy = {
  en: { wallets: "Wallets", identity: "Privy identity", address: "Address", balances: "Balances", network: "Network", open: "Open multichain wallet selector", explorer: "View on explorer", loading: "Loading wallet", unavailable: "Not registered", active: "Active", failed: "Wallet information unavailable", balanceFailed: "Balance unavailable", shared: "One EVM address. Separate balances and fees on each network.", families: "wallet families", networks: "networks" },
  es: { wallets: "Wallets", identity: "Identidad Privy", address: "Dirección", balances: "Saldos", network: "Red", open: "Abrir selector de wallets multichain", explorer: "Ver en explorador", loading: "Cargando wallet", unavailable: "No registrada", active: "Activa", failed: "Información de wallets no disponible", balanceFailed: "Saldo no disponible", shared: "Una dirección EVM. Saldos y comisiones separados en cada red.", families: "familias de wallet", networks: "redes" },
  pt: { wallets: "Wallets", identity: "Identidade Privy", address: "Endereço", balances: "Saldos", network: "Rede", open: "Abrir seletor de wallets multichain", explorer: "Ver no explorador", loading: "Carregando wallet", unavailable: "Não registrada", active: "Ativa", failed: "Informações das wallets indisponíveis", balanceFailed: "Saldo indisponível", shared: "Um endereço EVM. Saldos e taxas separados em cada rede.", families: "famílias de wallet", networks: "redes" },
} as const;

function shortAddress(address: string) { return `${address.slice(0, 8)}…${address.slice(-6)}`; }

export default function ContextWalletSelector({ locale, stellarAddress, stellarXlmBalance, stellarUsdcBalance, getAccessToken }: {
  locale: Locale; stellarAddress: string; stellarXlmBalance: string; stellarUsdcBalance: string | null;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const { wallets, networks, readings, loading, failed } = useWalletReadings(getAccessToken);
  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const evmWallet = wallets.find((wallet) => wallet.chainType === "ethereum" && wallet.status === "active");
  const solanaWallet = wallets.find((wallet) => wallet.network === "solana:devnet" && wallet.status === "active");
  const solana = readings["solana:devnet"];
  const evmNetworks = networks.filter((network) => network.family === "evm");

  return (
    <details className="context-wallet-selector" ref={detailsRef}>
      <summary aria-label={t.open}>
        <span className="context-wallet-icon" aria-hidden="true">◎</span>
        <span><small>{t.wallets}</small><strong>Stellar + EVM + Solana</strong></span><i aria-hidden="true">⌄</i>
      </summary>
      <div className="context-wallet-menu">
        <header><span>{t.identity}</span><b>{[stellarAddress, evmWallet, solanaWallet].filter(Boolean).length} {t.families} · {networks.length} {t.networks}</b></header>
        {failed && <p role="alert">{t.failed}</p>}
        <article className="context-wallet-network is-active">
          <div className="context-wallet-network-heading"><span className="context-chain-mark">S</span><div><strong>Stellar</strong><small>Testnet</small></div><i>{t.active}</i></div>
          <dl>
            <div><dt>{t.address}</dt><dd title={stellarAddress}>{shortAddress(stellarAddress)}</dd></div>
            <div><dt>{t.balances}</dt><dd>{stellarXlmBalance} XLM · {stellarUsdcBalance ?? "—"} USDC</dd></div>
            <div><dt>{t.network}</dt><dd>Stellar Testnet</dd></div>
          </dl>
          <a href={`https://stellar.expert/explorer/testnet/account/${stellarAddress}`} target="_blank" rel="noreferrer">{t.explorer} ↗</a>
        </article>
        <article className={`context-wallet-network ${evmWallet ? "is-active" : ""}`}>
          <div className="context-wallet-network-heading"><span className="context-chain-mark">0x</span><div><strong>EVM</strong><small>Testnet</small></div><i>{evmWallet ? t.active : loading ? "…" : t.unavailable}</i></div>
          {evmWallet && <dl><div><dt>{t.address}</dt><dd title={evmWallet.address}>{shortAddress(evmWallet.address)}</dd></div></dl>}
          <p>{t.shared}</p>
          {evmNetworks.map((network) => {
            const wallet = wallets.find((row) => row.network === network.id && row.status === "active");
            const reading = readings[network.id];
            return <div key={`${wallet?.id ?? "missing"}:${network.id}`}>
              <dl><div><dt>{network.name}</dt><dd>{!wallet ? t.unavailable : reading ? `${reading.balance} ${reading.nativeAsset}` : loading ? t.loading : t.balanceFailed}</dd></div>
                {reading?.balances?.usdc && <div><dt>USDC</dt><dd>{reading.balances.usdc.balance}</dd></div>}
              </dl>
              {reading?.explorerUrl && <a href={reading.explorerUrl} target="_blank" rel="noreferrer">{network.name} · {t.explorer} ↗</a>}
            </div>;
          })}
        </article>
        <article className={`context-wallet-network ${solanaWallet ? "is-active" : ""}`}>
          <div className="context-wallet-network-heading"><span className="context-chain-mark">◎</span><div><strong>Solana</strong><small>Devnet</small></div><i>{solanaWallet ? t.active : loading ? "…" : t.unavailable}</i></div>
          {solanaWallet ? <>
            <dl><div><dt>{t.address}</dt><dd title={solanaWallet.address}>{shortAddress(solanaWallet.address)}</dd></div>
              <div><dt>{t.balances}</dt><dd>{solana?.balance ?? (loading ? t.loading : t.balanceFailed)}</dd></div>
              <div><dt>{t.network}</dt><dd>Solana Devnet</dd></div></dl>
            {solana?.explorerUrl && <a href={solana.explorerUrl} target="_blank" rel="noreferrer">{t.explorer} ↗</a>}
          </> : <p>{loading ? t.loading : t.unavailable}</p>}
        </article>
      </div>
    </details>
  );
}
