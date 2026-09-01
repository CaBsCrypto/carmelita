"use client";

import { useEffect, useState } from "react";
import { useUser } from "@privy-io/react-auth";
import type { Locale } from "@/app/language-toggle";
import styles from "./wallet-center.module.css";

type WalletRow = {
  id: string;
  address: string;
  chainType: string;
  network: string;
  status: string;
};

type AvalancheStatus = {
  address: string;
  balance: string;
  nativeAsset: string;
  nonce: number;
  funded: boolean;
  explorerUrl: string;
  faucetUrl?: string;
};

type SolanaStatus = {
  address: string;
  network: string;
  balance: string;
  sol: number;
  explorerUrl: string;
};

const copy = {
  en: {
    eyebrow: "YOUR WALLET SYSTEM", title: "One identity. Three wallet families.",
    intro: "Each family has its own address. EVM networks reuse one address while keeping balances and transactions separate.",
    stellar: "Stellar", stellarText: "Your active wallet for XLM, DeFindex, Soroswap and Stellar x402.",
    evm: "EVM", evmText: "Activate one Privy EVM wallet. Avalanche Fuji is the first test network.",
    solana: "Solana", solanaText: "Your active Solana wallet for SOL transactions and SPL token operations on Devnet.",
    active: "ACTIVE", available: "AVAILABLE", network: "Network",
    balance: "Balance", provider: "Provider", activate: "Activate Fuji",
    activating: "Activating...", refresh: "Refresh", faucet: "Get Test AVAX", solanaFaucet: "Get 1 SOL Devnet",
    fundingSolana: "Funding SOL...", explorer: "Explorer", copy: "Copy", copied: "Copied",
    shared: "Same 0x address later works on Base and BNB; funds never cross networks automatically.",
  },
  es: {
    eyebrow: "TU SISTEMA DE WALLETS", title: "Una identidad. Tres familias de wallet.",
    intro: "Cada familia tiene su propia dirección. Las redes EVM reutilizan una dirección, pero mantienen saldos y transacciones separados.",
    stellar: "Stellar", stellarText: "Tu wallet activa para XLM, DeFindex, Soroswap y x402 en Stellar.",
    evm: "EVM", evmText: "Activa una wallet EVM de Privy. Avalanche Fuji será la primera red de prueba.",
    solana: "Solana", solanaText: "Tu wallet activa de Solana en Devnet para transacciones SOL y tokens SPL.",
    active: "ACTIVA", available: "DISPONIBLE", network: "Red",
    balance: "Saldo", provider: "Proveedor", activate: "Activar Fuji",
    activating: "Activando...", refresh: "Actualizar", faucet: "Obtener AVAX Testnet", solanaFaucet: "Obtener 1 SOL Devnet",
    fundingSolana: "Fondeando SOL...", explorer: "Explorador", copy: "Copiar", copied: "Copiada",
    shared: "La misma dirección 0x servirá después en Base y BNB; los fondos nunca cruzan redes automáticamente.",
  },
  pt: {
    eyebrow: "SEU SISTEMA DE WALLETS", title: "Uma identidade. Três famílias de wallet.",
    intro: "Cada família tem seu próprio endereço. Redes EVM reutilizam um endereço, mantendo saldos e transações separados.",
    stellar: "Stellar", stellarText: "Sua wallet ativa para XLM, DeFindex, Soroswap e x402 na Stellar.",
    evm: "EVM", evmText: "Ative uma wallet EVM da Privy. Avalanche Fuji será a primeira rede de teste.",
    solana: "Solana", solanaText: "Sua wallet ativa da Solana na Devnet para transações SOL e tokens SPL.",
    active: "ATIVA", available: "DISPONÍVEL", network: "Rede",
    balance: "Saldo", provider: "Provedor", activate: "Ativar Fuji",
    activating: "Ativando...", refresh: "Atualizar", faucet: "Obter AVAX Testnet", solanaFaucet: "Obter 1 SOL Devnet",
    fundingSolana: "Fondeando SOL...", explorer: "Explorador", copy: "Copiar", copied: "Copiada",
    shared: "O mesmo endereço 0x funcionará depois na Base e BNB; fundos nunca cruzam redes automaticamente.",
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
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [avalanche, setAvalanche] = useState<AvalancheStatus | null>(null);
  const [solana, setSolana] = useState<SolanaStatus | null>(null);
  const [busy, setBusy] = useState<"load" | "activate" | "solana_fund" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const evmWallet = wallets.find((wallet) => wallet.network === "avalanche:fuji" && wallet.status === "active");
  const solanaWallet = wallets.find((wallet) => wallet.network === "solana:devnet" && wallet.status === "active");

  async function authorizedFetch(url: string, init?: RequestInit) {
    const token = await getAccessToken();
    if (!token) throw new Error("authentication_required");
    return fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  }

  async function load() {
    setBusy("load");
    setError(null);
    await refresh();
  }

  async function refresh() {
    try {
      const listResponse = await authorizedFetch("/api/agent/wallets");
      const list = await listResponse.json();
      if (!listResponse.ok) throw new Error(list.error ?? "wallet_list_failed");
      const fetchedWallets = (list.wallets ?? []) as WalletRow[];
      setWallets(fetchedWallets);

      if (fetchedWallets.some((wallet) => wallet.network === "avalanche:fuji")) {
        const statusResponse = await authorizedFetch("/api/agent/wallets/avalanche");
        const status = await statusResponse.json();
        if (statusResponse.ok) setAvalanche(status);
      } else {
        setAvalanche(null);
      }

      if (fetchedWallets.some((wallet) => wallet.network === "solana:devnet")) {
        const solanaResponse = await authorizedFetch("/api/agent/wallets/solana");
        const solanaStatus = await solanaResponse.json();
        if (solanaResponse.ok) setSolana(solanaStatus);
      } else {
        setSolana(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "wallet_center_failed");
    } finally {
      setBusy(null);
    }
  }

  async function activateAvalanche() {
    setBusy("activate");
    setError(null);
    try {
      const response = await authorizedFetch("/api/agent/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: "avalanche:fuji",
          explicitUserConfirmation: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "avalanche_activation_failed");
      await refreshUser();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "avalanche_activation_failed");
      setBusy(null);
    }
  }

  async function fundSolanaDevnet() {
    setBusy("solana_fund");
    setError(null);
    try {
      const response = await authorizedFetch("/api/agent/wallets/solana/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          explicitUserConfirmation: true,
          solAmount: 1,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "solana_airdrop_failed");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "solana_airdrop_failed");
      setBusy(null);
    }
  }

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 1400);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={styles.center}>
      <header className={styles.heading}>
        <div><p className="eyebrow">{t.eyebrow}</p><h2>{t.title}</h2></div>
        <p>{t.intro}</p>
      </header>
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
          <div className={styles.mark}>0x</div><h3>{t.evm} · Avalanche Fuji</h3><p>{t.evmText}</p>
          {evmWallet && <code className={styles.address}>{short(evmWallet.address)}</code>}
          <div className={styles.facts}><span>{t.network}<b>Fuji · 43113</b></span><span>{t.balance}<b>{avalanche ? `${avalanche.balance} AVAX` : "—"}</b></span></div>
          <p className={styles.shared}>{t.shared}</p>
          <div className={styles.actions}>
            {!evmWallet ? <button disabled={Boolean(busy)} onClick={() => void activateAvalanche()}>{busy === "activate" ? t.activating : t.activate}</button> : <>
              <button onClick={() => void copyAddress(evmWallet.address)}>{copied === evmWallet.address ? t.copied : t.copy}</button>
              <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void load()}>{t.refresh}</button>
              {avalanche?.explorerUrl && <a className={styles.secondary} href={avalanche.explorerUrl} target="_blank" rel="noreferrer">{t.explorer}</a>}
              {!avalanche?.funded && avalanche?.faucetUrl && <a href={avalanche.faucetUrl} target="_blank" rel="noreferrer">{t.faucet}</a>}
            </>}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </article>

        <article className={`${styles.card} ${styles.solana}`}>
          <div className={styles.top}><span className={styles.family}>SOLANA</span><b className={styles.badge}>{solanaWallet ? t.active : t.available}</b></div>
          <div className={styles.mark}>S◎</div><h3>{t.solana}</h3><p>{t.solanaText}</p>
          {solanaWallet && <code className={styles.address}>{short(solanaWallet.address)}</code>}
          <div className={styles.facts}>
            <span>{t.network}<b>Solana Devnet</b></span>
            <span>{t.balance}<b>{solana ? solana.balance : "—"}</b></span>
          </div>
          <div className={styles.actions}>
            {solanaWallet && (
              <>
                <button onClick={() => void copyAddress(solanaWallet.address)}>
                  {copied === solanaWallet.address ? t.copied : t.copy}
                </button>
                <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => void load()}>
                  {t.refresh}
                </button>
                <button disabled={Boolean(busy)} onClick={() => void fundSolanaDevnet()}>
                  {busy === "solana_fund" ? t.fundingSolana : t.solanaFaucet}
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
