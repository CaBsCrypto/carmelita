"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@privy-io/react-auth";
import type { Locale } from "@/app/language-toggle";
import styles from "./wallet-center.module.css";
import { useWalletReadings } from "./use-wallet-readings";

const copy = {
  en: {
    eyebrow: "YOUR WALLET SYSTEM", title: "One identity. Three wallet families.",
    intro: "Each family has its own address. EVM networks reuse one address while keeping balances and transactions separate.",
    stellar: "Stellar", stellarText: "Your active wallet for XLM, DeFindex, Soroswap and Stellar x402.",
    evm: "EVM", evmText: "One Privy wallet, one address for every enabled EVM test network.",
    solana: "Solana", solanaText: "Your Solana Devnet address and balance. Each additional operation has its own acceptance checks.",
    active: "ACTIVE", available: "AVAILABLE", network: "Network",
    balance: "Balance", provider: "Provider", activate: "Activate Fuji",
    activating: "Activating...", refresh: "Refresh", faucet: "Get Test AVAX", solanaFaucet: "Get 1 SOL Devnet",
    fundingSolana: "Funding SOL...", explorer: "Explorer", copy: "Copy", copied: "Copied",
    shared: "One 0x address, separate balances and fees on every network. Funds do not move between networks automatically.",
    unavailable: "Balance unavailable", loading: "Loading…", notRegistered: "Not registered", failed: "Wallet information could not be loaded. Try again.", actionFailed: "The request failed. Please retry.", receive: "Shared EVM receiving address",
  },
  es: {
    eyebrow: "TU SISTEMA DE WALLETS", title: "Una identidad. Tres familias de wallet.",
    intro: "Cada familia tiene su propia dirección. Las redes EVM reutilizan una dirección, pero mantienen saldos y transacciones separados.",
    stellar: "Stellar", stellarText: "Tu wallet activa para XLM, DeFindex, Soroswap y x402 en Stellar.",
    evm: "EVM", evmText: "Una wallet Privy, una dirección para cada red EVM de prueba habilitada.",
    solana: "Solana", solanaText: "Tu dirección y saldo de Solana Devnet. Cada operación adicional tiene sus propias pruebas de aceptación.",
    active: "ACTIVA", available: "DISPONIBLE", network: "Red",
    balance: "Saldo", provider: "Proveedor", activate: "Activar Fuji",
    activating: "Activando...", refresh: "Actualizar", faucet: "Obtener AVAX Testnet", solanaFaucet: "Obtener 1 SOL Devnet",
    fundingSolana: "Fondeando SOL...", explorer: "Explorador", copy: "Copiar", copied: "Copiada",
    shared: "Una dirección 0x, saldos y comisiones separados en cada red. Los fondos no se mueven entre redes automáticamente.",
    unavailable: "Saldo no disponible", loading: "Cargando…", notRegistered: "No registrada", failed: "No se pudo cargar la información de las wallets. Reintenta.", actionFailed: "La solicitud falló. Vuelve a intentarlo.", receive: "Dirección compartida para recibir en EVM",
  },
  pt: {
    eyebrow: "SEU SISTEMA DE WALLETS", title: "Uma identidade. Três famílias de wallet.",
    intro: "Cada família tem seu próprio endereço. Redes EVM reutilizam um endereço, mantendo saldos e transações separados.",
    stellar: "Stellar", stellarText: "Sua wallet ativa para XLM, DeFindex, Soroswap e x402 na Stellar.",
    evm: "EVM", evmText: "Uma wallet Privy, um endereço para cada rede EVM de teste habilitada.",
    solana: "Solana", solanaText: "Seu endereço e saldo na Solana Devnet. Cada operação adicional tem suas próprias verificações de aceitação.",
    active: "ATIVA", available: "DISPONÍVEL", network: "Rede",
    balance: "Saldo", provider: "Provedor", activate: "Ativar Fuji",
    activating: "Ativando...", refresh: "Atualizar", faucet: "Obter AVAX Testnet", solanaFaucet: "Obter 1 SOL Devnet",
    fundingSolana: "Fondeando SOL...", explorer: "Explorador", copy: "Copiar", copied: "Copiada",
    shared: "Um endereço 0x, saldos e taxas separados em cada rede. Os fundos não se movem entre redes automaticamente.",
    unavailable: "Saldo indisponível", loading: "Carregando…", notRegistered: "Não registrada", failed: "Não foi possível carregar as wallets. Tente novamente.", actionFailed: "A solicitação falhou. Tente novamente.", receive: "Endereço compartilhado para receber em EVM",
  },
};

function short(address: string) {
  return `${address.slice(0, 10)}…${address.slice(-8)}`;
}

export default function WalletCenter({
  locale,
  stellarAddress,
  stellarBalance,
  getAccessToken,
}: {
  locale: Locale;
  stellarAddress: string;
  stellarBalance: string;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const { refreshUser } = useUser();
  const { wallets, networks, readings, loading, failed, reload, owner } = useWalletReadings(getAccessToken);
  const [action, setAction] = useState<{ owner: string | null; kind: "activate" | "solana_fund" | null; failed: boolean }>({ owner: null, kind: null, failed: false });
  const [copied, setCopied] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { request.current?.abort(); if (copyTimer.current) clearTimeout(copyTimer.current); }, [owner]);
  const busy = loading || (action.owner === owner && action.kind !== null);
  const evmWallet = wallets.find((wallet) => wallet.chainType === "ethereum" && wallet.status === "active");
  const evmNetworks = networks.filter((network) => network.family === "evm");
  const solanaWallet = wallets.find((wallet) => wallet.network === "solana:devnet" && wallet.status === "active");
  const solana = readings["solana:devnet"];
  const avalanche = readings["avalanche:fuji"];

  async function existingAction(kind: "activate" | "solana_fund") {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setAction({ owner, kind, failed: false });
    try {
      const token = await getAccessToken();
      controller.signal.throwIfAborted();
      if (!token || !owner) throw new Error("authentication_required");
      const response = await fetch(kind === "activate" ? "/api/agent/wallets" : "/api/agent/wallets/solana/fund", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(kind === "activate" ? { network: "avalanche:fuji", explicitUserConfirmation: true } : { explicitUserConfirmation: true, solAmount: 1 }),
      });
      if (!response.ok) throw new Error("wallet_action_failed");
      if (kind === "activate") await refreshUser();
      controller.signal.throwIfAborted();
      await reload();
      if (!controller.signal.aborted) setAction({ owner, kind: null, failed: false });
    } catch {
      if (!controller.signal.aborted) setAction({ owner, kind: null, failed: true });
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1400);
    } catch { setAction({ owner, kind: null, failed: true }); }
  }
  return (
    <section className={styles.center}>
      <header className={styles.heading}>
        <div><p className="eyebrow">{t.eyebrow}</p><h2>{t.title}</h2></div>
        <p>{t.intro}</p>
      </header>
      {(failed || action.owner === owner && action.failed) && <p className={styles.error} role="alert">{failed ? t.failed : t.actionFailed}</p>}
      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.stellar}`}>
          <div className={styles.top}><span className={styles.family}>STELLAR</span><b className={styles.badge}>{t.active}</b></div>
          <div className={styles.mark}>S</div><h3>{t.stellar}</h3><p>{t.stellarText}</p>
          <code className={styles.address}>{short(stellarAddress)}</code>
          <div className={styles.facts}><span>{t.network}<b>Stellar Testnet</b></span><span>{t.balance}<b>{stellarBalance} XLM</b></span></div>
          <div className={styles.actions}><button onClick={() => void copyAddress(stellarAddress)}>{copied === stellarAddress ? t.copied : t.copy}</button><a className={styles.secondary} href={`https://stellar.expert/explorer/testnet/account/${stellarAddress}`} target="_blank" rel="noreferrer">{t.explorer}</a></div>
        </article>

        <article className={`${styles.card} ${styles.evm}`}>
          <div className={styles.top}><span className={styles.family}>EVM</span><b className={styles.badge}>{evmWallet ? t.active : t.available}</b></div>
          <div className={styles.mark}>0x</div><h3>{t.evm}</h3><p>{t.evmText}</p>
          {evmWallet && <code className={styles.address} aria-label={t.receive} title={evmWallet.address}>{evmWallet.address}</code>}
          <div className={styles.networks}>
            {evmNetworks.map((network) => {
              const wallet = wallets.find((row) => row.network === network.id && row.status === "active");
              const reading = readings[network.id];
              return <div className={styles.networkRow} key={`${wallet?.id ?? "missing"}:${network.id}`}>
                <strong>{network.name}</strong>
                <span>{!wallet ? t.notRegistered : loading ? t.loading : reading ? `${reading.balance} ${reading.nativeAsset}` : t.unavailable}</span>
                {reading?.balances?.usdc && <small>{reading.balances.usdc.balance} USDC</small>}
                {reading?.explorerUrl && <a href={reading.explorerUrl} target="_blank" rel="noreferrer">{t.explorer} ↗</a>}
              </div>;
            })}
          </div>
          <p className={styles.shared}>{t.shared}</p>
          <div className={styles.actions}>
            {!evmWallet ? <button disabled={Boolean(busy) || !owner} onClick={() => void existingAction("activate")}>{action.kind === "activate" ? t.activating : t.activate}</button> : <>
              <button onClick={() => void copyAddress(evmWallet.address)}>{copied === evmWallet.address ? t.copied : t.copy}</button>
              <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void reload()}>{t.refresh}</button>
              {!avalanche?.funded && avalanche?.faucetUrl && <a href={avalanche.faucetUrl} target="_blank" rel="noreferrer">{t.faucet}</a>}
            </>}
          </div>
        </article>

        <article className={`${styles.card} ${styles.solana}`}>
          <div className={styles.top}><span className={styles.family}>SOLANA</span><b className={styles.badge}>{solanaWallet ? t.active : t.available}</b></div>
          <div className={styles.mark}>S◎</div><h3>{t.solana}</h3><p>{t.solanaText}</p>
          {solanaWallet && <code className={styles.address}>{short(solanaWallet.address)}</code>}
          <div className={styles.facts}>
            <span>{t.network}<b>Solana Devnet</b></span>
            <span>{t.balance}<b>{loading ? t.loading : solana ? solana.balance : t.unavailable}</b></span>
          </div>
          <div className={styles.actions}>
            {solanaWallet && (
              <>
                <button onClick={() => void copyAddress(solanaWallet.address)}>
                  {copied === solanaWallet.address ? t.copied : t.copy}
                </button>
                <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void reload()}>
                  {t.refresh}
                </button>
                <button disabled={Boolean(busy)} onClick={() => void existingAction("solana_fund")}>
                  {action.kind === "solana_fund" ? t.fundingSolana : t.solanaFaucet}
                </button>
                {solana?.explorerUrl && (
                  <a className={styles.secondary} href={solana.explorerUrl} target="_blank" rel="noreferrer">
                    {t.explorer}
                  </a>
                )}
              </>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
