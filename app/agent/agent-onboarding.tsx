"use client";

/* eslint-disable @next/next/no-img-element */

import { usePrivy, useUser } from "@privy-io/react-auth";
import AgentChat from "./agent-chat";
import AgentMemoryVault from "./agent-memory-vault";
import WalletCenter from "./wallet-center";
import WebMcpInspector from "./webmcp-inspector";
import AgentExternalAccess from "./agent-external-access";
import AgentConnectedApps from "./agent-connected-apps";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Locale, useLocale } from "../language-toggle";
import { sessionCloseCopy, useSessionClose } from "../use-session-close";

const onboardingUi = {
  en: {
    loading: "Preparing secure sign-in...",
    entryEyebrow: "WORK WITH CARMELITA",
    entryTitle: "Sign in once. Your test wallets arrive with you.",
    entryText: "Continue with email, Google or a passkey. Your Stellar, EVM and Solana wallets belong to you. Enabled EVM test networks share one address.",
    create: "Work with Carmelita",
    boundary: "No seed phrase or wallet password required during onboarding.",
    onboarding: "CHAT-GUIDED ONBOARDING",
    steps: ["Authenticate with Privy", "Recover your three wallet families", "Review each test network and balance", "Approve each financial action separately"],
    workspace: "CARMELITA WORKSPACE",
    ready: "Carmelita is ready.",
    creating: "Preparing your Stellar, EVM and Solana wallets...",
    authenticated: "Authenticated with Privy",
    signout: "Sign out",
    provisioning: "Provisioning automatically",
    pipeline: "Identity · wallet ownership · chat-controlled setup",
    error: "We could not finish wallet provisioning.",
    retry: "Retry safely",
    stellarWallet: "STELLAR WALLET", evmWallet: "EVM WALLET", solanaWallet: "SOLANA WALLET", ownership: "Ownership", owned: "User-owned", network: "Network", created: "Created", existing: "Existing wallet", justNow: "Just now", active: "ACTIVE", pending: "PENDING", explorer: "View on explorer", shared: "One address for all enabled EVM test networks. Each network keeps its own balance and fees.",
  },
  es: {
    loading: "Preparando ingreso seguro...",
    entryEyebrow: "TRABAJA CON CARMELITA",
    entryTitle: "Ingresa una vez. Tus wallets de prueba llegan contigo.",
    entryText: "Continúa con email, Google o passkey. Tus wallets Stellar, EVM y Solana te pertenecen. Las redes EVM de prueba habilitadas comparten una dirección.",
    create: "Carmelita trabaja contigo",
    boundary: "No necesitas seed phrase ni contraseña de wallet durante el onboarding.",
    onboarding: "ONBOARDING DESDE EL CHAT",
    steps: ["Autenticar con Privy", "Recuperar tus tres familias de wallet", "Revisar cada red de prueba y su saldo", "Aprobar cada acción financiera por separado"],
    workspace: "ESPACIO DE CARMELITA",
    ready: "Carmelita está lista.",
    creating: "Preparando tus wallets Stellar, EVM y Solana...",
    authenticated: "Autenticado con Privy",
    signout: "Cerrar sesión",
    provisioning: "Provisionando automáticamente",
    pipeline: "Identidad · propiedad de wallet · configuración por chat",
    error: "No pudimos terminar la creación de la wallet.",
    retry: "Reintentar de forma segura",
    stellarWallet: "WALLET STELLAR", evmWallet: "WALLET EVM", solanaWallet: "WALLET SOLANA", ownership: "Propiedad", owned: "Del usuario", network: "Red", created: "Creación", existing: "Wallet existente", justNow: "Ahora", active: "ACTIVA", pending: "PENDIENTE", explorer: "Ver en explorador", shared: "Una dirección para todas las redes EVM de prueba habilitadas. Cada red mantiene su saldo y sus comisiones.",
  },
  pt: {
    loading: "Preparando login seguro...",
    entryEyebrow: "CONHEÇA CARMELITA",
    entryTitle: "Entre uma vez. Suas wallets de teste acompanham você.",
    entryText: "Continue com email, Google ou passkey. Suas wallets Stellar, EVM e Solana pertencem a você. As redes EVM de teste habilitadas compartilham um endereço.",
    create: "Carmelita trabalha com voc\u00ea",
    boundary: "Nenhuma seed phrase ou senha de wallet é necessária durante o onboarding.",
    onboarding: "ONBOARDING PELO CHAT",
    steps: ["Autenticar com Privy", "Recuperar suas três famílias de wallet", "Revisar cada rede de teste e seu saldo", "Aprovar cada ação financeira separadamente"],
    workspace: "ESPAÇO DA CARMELITA",
    ready: "Carmelita está pronta.",
    creating: "Preparando suas wallets Stellar, EVM e Solana...",
    authenticated: "Autenticado com Privy",
    signout: "Sair",
    provisioning: "Provisionando automaticamente",
    pipeline: "Identidade · propriedade da wallet · configuração pelo chat",
    error: "Não foi possível concluir a criação da wallet.",
    retry: "Tentar novamente com segurança",
    stellarWallet: "WALLET STELLAR", evmWallet: "WALLET EVM", solanaWallet: "WALLET SOLANA", ownership: "Propriedade", owned: "Do usuário", network: "Rede", created: "Criação", existing: "Wallet existente", justNow: "Agora", active: "ATIVA", pending: "PENDENTE", explorer: "Ver no explorador", shared: "Um endereço para todas as redes EVM de teste habilitadas. Cada rede mantém seu saldo e suas taxas.",
  },
};
type BootstrapWallet = {
  id: string;
  address: string;
  chainType: string;
  created: boolean;
  owner: "user";
};

type BootstrapResult = {
  user: { id: string; email: string | null };
  profile: { id: string; email: string | null; status: string };
  persistence: { configured: boolean; provider: string };
  history: { id: string; type: string; summary: string; createdAt: string }[];
  wallet: BootstrapWallet;
  wallets: {
    stellar: BootstrapWallet;
    avalanche: BootstrapWallet;
    evm: BootstrapWallet;
    solana: BootstrapWallet;
  };
  evm: { wallet: BootstrapWallet; networks: { id: string; name: string; explorerUrl: string }[]; fundsMoved: false; signingRequired: false };
  solana: { network: { id: string; name: string; explorerUrl: string } };
  avalanche: {
    network: { id: "avalanche:fuji"; name: string; explorerUrl: string };
    fundsMoved: false;
    signingRequired: false;
  };
  walletArchitecture: {
    active: readonly ["stellar"];
    future: readonly ["ethereum", "solana"];
    evmNetworks: readonly ["base", "bnb", "avalanche"];
  };
  account: {
    exists: boolean;
    sequence: string | null;
    balances: { asset: string; balance: string }[];
  };
  activation: "active" | "activated" | "pending";
};


type TravelHotel = {
  hotelId: string;
  packageId: string;
  name: string;
  thumbnail?: string;
  rating?: number | null;
  star?: number | null;
  totalPriceUSD: number;
  pricePerNightUSD: number;
  currency: string;
  mealType?: string;
  address?: string;
  refundability?: string;
  cancellationPolicyString?: string;
};

type TravelSearchResult = {
  sessionId: string;
  searchedAt: string;
  hotels: TravelHotel[];
};

function shortAddress(address: string) {
  return address.slice(0, 12) + "..." + address.slice(-10);
}

export default function AgentOnboarding({
  configured,
  autoLogin = false,
}: {
  configured: boolean;
  autoLogin?: boolean;
}) {
  const { locale } = useLocale();
  if (!configured) return <PrivySetupRequired />;
  return <PrivyAgent locale={locale} autoLogin={autoLogin} />;
}

function PrivySetupRequired() {
  return (
    <section className="agent-entry shell">
      <div>
        <p className="eyebrow">ONE-TIME FOUNDER SETUP</p>
        <h1>Automatic wallets are ready for credentials.</h1>
        <p>
          Add the public Privy App ID and server App Secret to enable login.
          Users will not create or manage a wallet password themselves.
        </p>
      </div>
      <aside className="agent-setup-list">
        <strong>Required environment</strong>
        <code>NEXT_PUBLIC_PRIVY_APP_ID</code>
        <code>PRIVY_APP_ID</code>
        <code>PRIVY_APP_SECRET</code>
      </aside>
    </section>
  );
}

function PrivyAgent({
  locale,
  autoLogin,
}: {
  locale: Locale;
  autoLogin: boolean;
}) {
  const t = onboardingUi[locale];
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const session = useSessionClose();
  const userId = user?.id;
  const { refreshUser } = useUser();
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [status, setStatus] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [travelResult, setTravelResult] = useState<TravelSearchResult | null>(null);
  const [travelStatus, setTravelStatus] = useState<"idle" | "searching" | "error">("idle");
  const [travelError, setTravelError] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<TravelHotel | null>(null);
  const bootstrappedFor = useRef<string | null>(null);
  const loginStarted = useRef(false);
  const bootstrapRequest = useRef<AbortController | null>(null);

  const bootstrap = useCallback(async (force = false) => {
    if (!userId || (!force && bootstrappedFor.current === userId)) return;
    bootstrapRequest.current?.abort();
    const controller = new AbortController();
    bootstrapRequest.current = controller;
    bootstrappedFor.current = userId;
    setStatus("creating");
    setError(null);

    try {
      const token = await getAccessToken();
      controller.signal.throwIfAborted();
      if (!token) throw new Error("Authentication token unavailable");
      const response = await fetch("/api/agent/bootstrap", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Wallet bootstrap failed");
      // The wallet may have just been created by the Privy server SDK. Refresh
      // the browser identity so extended-chain signing can discover it without
      // forcing the user through a sign-out/sign-in cycle.
      await refreshUser();
      controller.signal.throwIfAborted();
      if (body.user?.id !== userId) throw new Error("wallet_response_mismatch");
      setResult(body);
      setStatus("ready");
    } catch (caught) {
      if (controller.signal.aborted) {
        if (bootstrapRequest.current === controller) bootstrappedFor.current = null;
        return;
      }
      bootstrappedFor.current = null;
      setError(caught instanceof Error ? caught.message : "Wallet bootstrap failed");
      setStatus("error");
    }
  }, [getAccessToken, refreshUser, userId]);

  useEffect(() => {
    if (!autoLogin || !ready || authenticated || loginStarted.current) return;
    loginStarted.current = true;
    async function openPrivy() {
      try {
        await login();
      } catch {
        loginStarted.current = false;
      }
    }
    void openPrivy();
  }, [authenticated, autoLogin, login, ready]);

  useEffect(() => () => {
    bootstrapRequest.current?.abort();
    bootstrappedFor.current = null;
  }, [authenticated, userId]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;
    const task = window.setTimeout(() => void bootstrap(), 0);
    return () => { window.clearTimeout(task); bootstrapRequest.current?.abort(); };
  }, [ready, authenticated, user?.id, bootstrap]);

  async function signOut() {
    bootstrappedFor.current = null;
    bootstrapRequest.current?.abort();
    setResult(null);
    setStatus("idle");
    await session.close();
  }


  async function searchTravel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setTravelStatus("searching");
    setTravelError(null);
    setSelectedHotel(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication token unavailable");
      const response = await fetch("/api/agent/travel/search", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location: String(form.get("location") ?? ""),
          checkIn: String(form.get("checkIn") ?? ""),
          checkOut: String(form.get("checkOut") ?? ""),
          guests: Number(form.get("guests") ?? 1),
          maxPrice: Number(form.get("maxPrice") ?? 0) || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Travel search failed");
      setTravelResult(body);
      setTravelStatus("idle");
    } catch (caught) {
      setTravelError(caught instanceof Error ? caught.message : "Travel search failed");
      setTravelStatus("error");
    }
  }

  if (!ready) {
    return (
      <section className="agent-entry shell agent-loading">
        <i />
        <strong>{t.loading}</strong>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="agent-entry shell">
        <div>
          <p className="eyebrow">{t.entryEyebrow}</p>
          <h1>{t.entryTitle}</h1>
          <p>
            {t.entryText}
          </p>
          <button className="agent-primary" disabled={session.closing || session.state === "failed"} onClick={() => login()}>
            {t.create}
          </button>
          <small>{t.boundary}</small>
          {session.state === "failed" && <p role="alert">{sessionCloseCopy[locale].failed} <button onClick={() => void session.close()}>{sessionCloseCopy[locale].retry}</button></p>}
        </div>
        <aside className="agent-onboarding-preview">
          <header><span>{t.onboarding}</span><b>TESTNET</b></header>
          <ol>
            <li><b>01</b><span>{t.steps[0]}</span></li>
            <li><b>02</b><span>{t.steps[1]}</span></li>
            <li><b>03</b><span>{t.steps[2]}</span></li>
            <li><b>04</b><span>{t.steps[3]}</span></li>
          </ol>
        </aside>
      </section>
    );
  }

  return (
    <section className="agent-workspace shell">
      <header>
        <div>
          <p className="eyebrow">{t.workspace}</p>
          <h1>{status === "ready" ? t.ready : t.creating}</h1>
          <p>{result?.profile.email ?? user?.email?.address ?? t.authenticated}</p>
        </div>
        <button className="agent-signout" disabled={session.closing} onClick={() => void signOut()}>{session.closing ? sessionCloseCopy[locale].closing : t.signout}</button>
      </header>
      {session.state === "failed" && <p role="alert">{sessionCloseCopy[locale].failed}</p>}

      {status === "creating" && (
        <div className="agent-provisioning">
          <i />
          <div><strong>{t.provisioning}</strong><span>{t.pipeline}</span></div>
        </div>
      )}

      {status === "error" && (
        <div className="agent-bootstrap-error">
          <strong>{t.error}</strong>
          <span>{error}</span>
          <button onClick={() => bootstrap(true)}>{t.retry}</button>
        </div>
      )}

      {result && result.user.id === user?.id && (
        <>
        <AgentChat
          key={result.user.id}
          email={result.profile.email ?? user?.email?.address ?? "Privy account"}
          walletAddress={result.wallet.address}
          walletBalance={
            result.account.balances.find((balance) => balance.asset === "XLM")?.balance ??
            "0"
          }
          getAccessToken={getAccessToken}
        />
        <AgentMemoryVault getAccessToken={getAccessToken} />

        <AgentExternalAccess locale={locale} getAccessToken={getAccessToken} />
        <AgentConnectedApps locale={locale} getAccessToken={getAccessToken} />

        <WalletCenter
          key={result.user.id}
          locale={locale}
          stellarAddress={result.wallet.address}
          stellarBalance={
            result.account.balances.find((balance) => balance.asset === "XLM")?.balance ?? "0"
          }
          getAccessToken={getAccessToken}
        />
        <WebMcpInspector locale={locale} getAccessToken={getAccessToken} />


        <div className="agent-wallet-grid">
          <article className="agent-wallet-card">
            <header><span>{t.stellarWallet}</span><b>{result.activation === "pending" ? t.pending : t.active}</b></header>
            <div className="agent-wallet-mark">S</div>
            <h2>{shortAddress(result.wallet.address)}</h2><code>{result.wallet.address}</code>
            <dl><div><dt>{t.ownership}</dt><dd>{t.owned}</dd></div><div><dt>{t.network}</dt><dd>Stellar Testnet</dd></div>
              <div><dt>{t.created}</dt><dd>{result.wallet.created ? t.justNow : t.existing}</dd></div></dl>
          </article>
          <article className="agent-wallet-card">
            <header><span>{t.evmWallet}</span><b>{t.active}</b></header>
            <div className="agent-wallet-mark">0x</div>
            <h2>{shortAddress(result.wallets.evm.address)}</h2><code>{result.wallets.evm.address}</code>
            <p>{t.shared}</p>
            <dl><div><dt>{t.ownership}</dt><dd>{t.owned}</dd></div>
              <div><dt>{t.created}</dt><dd>{result.wallets.evm.created ? t.justNow : t.existing}</dd></div></dl>
            {result.evm.networks.map((network) => <a key={network.id} href={`${network.explorerUrl}/address/${result.wallets.evm.address}`} target="_blank" rel="noreferrer">{network.name} · {t.explorer}</a>)}
          </article>
          <article className="agent-wallet-card">
            <header><span>{t.solanaWallet}</span><b>{t.active}</b></header>
            <div className="agent-wallet-mark">◎</div>
            <h2>{shortAddress(result.wallets.solana.address)}</h2><code>{result.wallets.solana.address}</code>
            <dl><div><dt>{t.ownership}</dt><dd>{t.owned}</dd></div><div><dt>{t.network}</dt><dd>Solana Devnet</dd></div>
              <div><dt>{t.created}</dt><dd>{result.wallets.solana.created ? t.justNow : t.existing}</dd></div></dl>
            <a href={`https://explorer.solana.com/address/${result.wallets.solana.address}?cluster=devnet`} target="_blank" rel="noreferrer">{t.explorer}</a>
          </article>          <div className="agent-ready-panel">
            <p className="eyebrow">AUTOMATIC BOOTSTRAP COMPLETE</p>
            <h2>Your agent now has a wallet identity.</h2>
            <p>
              Future actions can prepare intents and request scoped authorization
              from this wallet. Login alone never authorizes a payment.
            </p>
            <div className="agent-balances">
              {(result.account.balances.length
                ? result.account.balances
                : [{ asset: "XLM", balance: "Activation pending" }]
              ).map((balance) => (
                <span key={balance.asset}><b>{balance.asset}</b>{balance.balance}</span>
              ))}
            </div>
            <a href="/demo">Continue to the action console</a>
          </div>
        </div>

        <section className="agent-account-overview">
          <article>
            <p className="eyebrow">ACCOUNT</p>
            <h2>Your identity follows every authorized action.</h2>
            <dl>
              <div><dt>Email</dt><dd>{result.profile.email ?? "Privy account"}</dd></div>
              <div><dt>Account status</dt><dd>{result.profile.status}</dd></div>
              <div><dt>Data store</dt><dd>{result.persistence.configured ? "Neon connected" : "Local mode"}</dd></div>
              <div><dt>User ID</dt><dd>{result.profile.id.slice(0, 22) + "..."}</dd></div>
            </dl>
          </article>
          <article>
            <p className="eyebrow">RECENT HISTORY</p>
            <h2>Activity saved to your account.</h2>
            {result.history.length ? (
              <ol>
                {result.history.map((event) => (
                  <li key={event.id}>
                    <span>{event.summary}</span>
                    <time>{new Date(event.createdAt).toLocaleString()}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="agent-empty-history">
                {result.persistence.configured
                  ? "Your first account activity will appear here."
                  : "Connect Neon to persist account history across sessions."}
              </p>
            )}
          </article>
        </section>

        <section className="agent-travel">
          <header>
            <div>
              <p className="eyebrow">LIVE TRAVALA SEARCH</p>
              <h2>Ask your agent to find a place to stay.</h2>
              <p>Real hotel inventory and prices. Search only: booking and payment remain disabled.</p>
            </div>
            <span>READ-ONLY MCP</span>
          </header>

          <form onSubmit={searchTravel}>
            <label>Where<input name="location" placeholder="Santiago, Chile" required minLength={2} /></label>
            <label>Check-in<input name="checkIn" type="date" required /></label>
            <label>Check-out<input name="checkOut" type="date" required /></label>
            <label>
              Guests
              <select name="guests" defaultValue="2">
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
            <label>Max USD/night<input name="maxPrice" type="number" min="1" max="10000" placeholder="200" /></label>
            <button disabled={travelStatus === "searching"}>
              {travelStatus === "searching" ? "Searching Travala..." : "Search hotels"}
            </button>
          </form>

          {travelError && <p className="agent-travel-error">{travelError}</p>}

          {travelResult && (
            <>
              <div className="agent-travel-summary">
                <strong>{travelResult.hotels.length} live options found</strong>
                <span>Prices can change until a booking is confirmed.</span>
              </div>
              <div className="agent-hotel-list">
                {travelResult.hotels.map((hotel) => (
                  <article key={hotel.packageId} className={selectedHotel?.packageId === hotel.packageId ? "selected" : ""}>
                    {hotel.thumbnail ? (
                      <img src={hotel.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="agent-hotel-placeholder">TRAVALA</div>
                    )}
                    <div>
                      <small>{hotel.star ? hotel.star + "-STAR HOTEL" : "HOTEL"}</small>
                      <h3>{hotel.name}</h3>
                      <p>{hotel.address ?? hotel.refundability ?? "Live Travala inventory"}</p>
                      <div className="agent-hotel-meta">
                        {hotel.rating != null && <span>Rating <b>{hotel.rating}</b></span>}
                        {hotel.refundability && <span>{hotel.refundability}</span>}
                        {hotel.mealType && <span>{hotel.mealType.replaceAll("_", " ")}</span>}
                      </div>
                    </div>
                    <footer>
                      <strong>{"$" + hotel.totalPriceUSD.toFixed(2)}</strong>
                      <small>{"$" + hotel.pricePerNightUSD.toFixed(2)} / night</small>
                      <button type="button" onClick={() => setSelectedHotel(hotel)}>
                        {selectedHotel?.packageId === hotel.packageId ? "Selected" : "Select"}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            </>
          )}

          {selectedHotel && (
            <aside className="agent-travel-selection">
              <div>
                <p className="eyebrow">PREPARED FOR REVIEW</p>
                <h3>{selectedHotel.name}</h3>
                <p>{selectedHotel.cancellationPolicyString ?? "Review final conditions before booking."}</p>
              </div>
              <div>
                <strong>{"$" + selectedHotel.totalPriceUSD.toFixed(2)} USD</strong>
                <span>Booking disabled in the Stellar MVP</span>
              </div>
            </aside>
          )}
        </section>
        </>
      )}
    </section>
  );
}
