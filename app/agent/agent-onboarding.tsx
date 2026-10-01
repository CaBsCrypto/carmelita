"use client";

import { usePrivy, useUser } from "@privy-io/react-auth";
import AgentChat from "./agent-chat";
import AgentMemoryVault from "./agent-memory-vault";
import RegistryWalletPanel from "./registry-wallet-panel";
import WorkspaceAvailability from "./workspace-availability";
import AgentPanel from "./agent-panel";
import { workspaceCopy } from "./workspace-copy";
import { workspaceCommands } from "./workspace-queries";
import { LanguageControl } from "../language-toggle";
import BrandLockup from "../brand-lockup";
import Link from "next/link";
import WebMcpInspector, { WebMcpProvider } from "./webmcp-inspector";
import AgentExternalAccess from "./agent-external-access";
import AgentConnectedApps from "./agent-connected-apps";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Locale, useLocale } from "../language-toggle";
import { sessionCloseCopy, useSessionClose } from "../use-session-close";
import { requestTravelSearch } from "./travel-search-request";

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

const preparationCopy = {
 en: { partial: "Some wallets still need preparation. You can continue using Carmelita.", retry: "Retry preparation", ready: "Registered", failed: "Preparation unavailable", conflict: "Identity conflict — review required", unknown: "Activation not checked", unavailable: "Balance unavailable" },
 es: { partial: "Falta preparar algunas wallets. Puedes seguir usando Carmelita.", retry: "Reintentar preparación", ready: "Registrada", failed: "Preparación no disponible", conflict: "Conflicto de identidad — requiere revisión", unknown: "Activación sin comprobar", unavailable: "Saldo no disponible" },
 pt: { partial: "Algumas wallets ainda precisam de preparação. Você pode continuar usando Carmelita.", retry: "Tentar preparação novamente", ready: "Registrada", failed: "Preparação indisponível", conflict: "Conflito de identidade — revisão necessária", unknown: "Ativação não verificada", unavailable: "Saldo indisponível" },
};

type BootstrapResult = {
  preparation: Record<"stellar" | "evm" | "solana", { status: "ready" | "failed" | "conflict"; error: string | null; retryable: boolean }>;
  user: { id: string; email: string | null };
  profile?: { id: string; email: string | null; status: string };
  persistence?: { configured: boolean; provider: string };
  history?: { id: string; type: string; summary: string; createdAt: string }[];
  wallet: BootstrapWallet | null;
  wallets: {
    stellar: BootstrapWallet | null;
    avalanche: BootstrapWallet | null;
    evm: BootstrapWallet | null;
    solana: BootstrapWallet | null;
  };
  evm: { wallet: BootstrapWallet | null; networks: { id: string; name: string; explorerUrl: string }[]; fundsMoved: false; signingRequired: false } | null;
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
  } | null;
  activation: "active" | "activated" | "pending" | "unknown";
};


type TravelHotel = {
  hotelId: string;
  packageId: string;
  name: string;
  thumbnail?: string;
  rating?: number | null;
  star?: number | null;
  totalPriceUSD: number | null;
  pricePerNightUSD: number | null;
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

export default function AgentOnboarding({
  configured,
  autoLogin = false,
  initialDraft = "",
}: {
  configured: boolean;
  autoLogin?: boolean;
  initialDraft?: string;
}) {
  const { locale } = useLocale();
  if (!configured) return <PrivySetupRequired locale={locale} />;
  return <PrivyAgent locale={locale} autoLogin={autoLogin} initialDraft={initialDraft} />;
}

function PrivySetupRequired({ locale }: { locale: Locale }) {
  const t = workspaceCopy[locale];
  const text = {
    es: "El ingreso no está disponible temporalmente. Puedes consultar la guía y volver a intentarlo más tarde.",
    en: "Sign-in is temporarily unavailable. You can read the guide and try again later.",
    pt: "O acesso está temporariamente indisponível. Consulte o guia e tente novamente mais tarde.",
  }[locale];
  return <section className="agent-visitor shell">
    <header className="workspace-header"><Link className="brand" href="/"><BrandLockup /></Link><span className="workspace-testnet">Testnet</span><LanguageControl compact /></header>
    <div className="visitor-chat"><h1>{t.welcome}</h1><p role="status">{text}</p><Link href="/guide">{t.guide}</Link></div>
  </section>;
}

function PrivyAgent({
  locale,
  autoLogin,
  initialDraft,
}: {
  locale: Locale;
  autoLogin: boolean;
  initialDraft: string;
}) {
  const { authenticated, user } = usePrivy();
  // An owner change discards all prior profile, travel and chat state together.
  return <PrivyWorkspace key={authenticated ? user?.id ?? "pending_identity" : "signed_out"} locale={locale} autoLogin={autoLogin} initialDraft={initialDraft} />;
}

function PrivyWorkspace({
  locale,
  autoLogin,
  initialDraft,
}: {
  locale: Locale;
  autoLogin: boolean;
  initialDraft: string;
}) {
  const t = onboardingUi[locale];
  const pc = preparationCopy[locale];
  const w = workspaceCopy[locale];
  const [panel, setPanel] = useState<"wallets" | "functions" | "account" | "developers" | "travel" | null>(null);
  const [draftSuggestion, setDraftSuggestion] = useState<{ id: number; text: string }>();
  const [connectionsContainer, setConnectionsContainer] = useState<HTMLElement | null>(null);
  const suggestionId = useRef(0);
  const workspaceRef = useRef<HTMLElement>(null);
  function suggest(text: string) { setPanel(null); setDraftSuggestion({ id: ++suggestionId.current, text }); }
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const session = useSessionClose();
  const userId = user?.id;
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fitVisibleViewport = () => workspaceRef.current?.style.setProperty("--workspace-height", `${viewport.height}px`);
    fitVisibleViewport();
    viewport.addEventListener("resize", fitVisibleViewport);
    return () => viewport.removeEventListener("resize", fitVisibleViewport);
  }, [authenticated, ready]);
  const { refreshUser } = useUser();
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [status, setStatus] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [travelResult, setTravelResult] = useState<TravelSearchResult | null>(null);
  const [travelStatus, setTravelStatus] = useState<"idle" | "searching" | "error">("idle");
  const [travelError, setTravelError] = useState<string | null>(null);
  const bootstrappedFor = useRef<string | null>(null);
  const loginStarted = useRef(false);
  const bootstrapRequest = useRef<AbortController | null>(null);
  const travelRequest = useRef<AbortController | null>(null);

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
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Wallet bootstrap failed");
      controller.signal.throwIfAborted();
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
    travelRequest.current?.abort();
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
    travelRequest.current?.abort();
    setResult(null);
    setStatus("idle");
    await session.close();
  }


  async function searchTravel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    travelRequest.current?.abort();
    const controller = new AbortController();
    travelRequest.current = controller;
    setTravelStatus("searching");
    setTravelError(null);
    try {
      const body = await requestTravelSearch<TravelSearchResult>({
        location: String(form.get("location") ?? ""),
        checkIn: String(form.get("checkIn") ?? ""),
        checkOut: String(form.get("checkOut") ?? ""),
        guests: Number(form.get("guests") ?? 1),
        maxPrice: Number(form.get("maxPrice") ?? 0) || undefined,
      }, getAccessToken, controller.signal);
      controller.signal.throwIfAborted();
      setTravelResult(body);
      setTravelStatus("idle");
    } catch (caught) {
      if (controller.signal.aborted) return;
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
    return <section className="agent-visitor shell">
      <header className="workspace-header"><Link className="brand" href="/"><BrandLockup /></Link><span className="workspace-testnet">Testnet</span><LanguageControl compact /></header>
      <div className="visitor-chat"><h1>{w.welcome}</h1><p>{w.welcomeText}</p><button className="workspace-button" disabled={session.closing || session.state === "failed"} onClick={() => login()}>{w.signIn}</button><Link href="/guide">{w.guide}</Link></div>
      {session.state === "failed" && <p role="alert">{sessionCloseCopy[locale].failed} <button onClick={() => void session.close()}>{sessionCloseCopy[locale].retry}</button></p>}
    </section>;
  }
  const current = result?.user.id === userId ? result : null;
  const stellar = current?.wallet ?? null;
  const partial = current && Object.values(current.preparation).some(item => item.status !== "ready");
  return <WebMcpProvider key={userId} locale={locale} getAccessToken={getAccessToken}>
    <section ref={workspaceRef} className="agent-workspace agent-chat-first shell">
      <header className="workspace-header">
        <Link className="brand" href="/"><BrandLockup /></Link><span className="workspace-testnet">Testnet</span>
        <nav aria-label={w.functions}>
          <button onClick={() => setPanel("functions")}>{w.functions}</button>
          <button onClick={() => setPanel("wallets")}>{w.wallets}</button>
          <button onClick={() => setPanel("account")}>{w.account}</button>
        </nav>
      </header>
      {session.state === "failed" && <p role="alert" className="workspace-notice">{sessionCloseCopy[locale].failed}</p>}
      {status === "creating" && <p role="status" className="workspace-notice">{w.preparing}</p>}
      {status === "error" && <div role="alert" className="workspace-notice workspace-warning"><span>{w.failed}</span><button onClick={() => void bootstrap(true)}>{w.retry}</button></div>}
      {partial && status !== "creating" && <div role="status" className="workspace-notice workspace-warning"><span>{w.partial}</span>{Object.values(current.preparation).some(item => item.retryable) && <button onClick={() => void bootstrap(true)}>{w.retry}</button>}</div>}
      <AgentChat key={userId} email={current?.profile?.email ?? user?.email?.address ?? t.authenticated}
        walletAddress={stellar?.address ?? ""} walletBalance={current?.account?.balances.find(balance => balance.asset === "XLM")?.balance ?? pc.unavailable}
        getAccessToken={getAccessToken} initialDraft={initialDraft} draftSuggestion={draftSuggestion} readyForQueries={Boolean(current) || status === "error"} onNavigateToChat={() => setPanel(null)}
        showConnections={panel === "account"} connectionsContainer={connectionsContainer} />
      {panel && <AgentPanel title={w[panel === "travel" ? "travel" : panel]} closeLabel={w.close} onClose={() => setPanel(null)}>
        {panel === "wallets" && <RegistryWalletPanel key={userId} locale={locale} getAccessToken={getAccessToken} onQueryBalances={() => suggest(workspaceCommands[1])} />}
        {panel === "functions" && <div className="workspace-functions">
          <p>{w.exampleNote}</p><p>{w.availability}</p><h3>{w.consultations}</h3>
          <article><h4>{w.wallets}</h4><p>{w.registryNote}</p><button onClick={() => suggest(workspaceCommands[0])}>{w.fill}</button></article>
          <article><h4>{w.price}</h4><p>{w.marketNote}</p><button onClick={() => suggest(workspaceCommands[2])}>{w.fill}</button></article>
          <article><h4>{w.capabilities}</h4><button onClick={() => suggest(workspaceCommands[6])}>{w.fill}</button></article>
          <WorkspaceAvailability key={userId} locale={locale} getAccessToken={getAccessToken} />
          <h3>{w.connections}</h3><p>{w.chatgptNote}</p><p>{w.notionNote}</p><button onClick={() => setPanel("account")}>{w.connections}</button>
          <article><h4>Travala</h4><p>{w.travelNote}</p><button onClick={() => setPanel("travel")}>{w.travel}</button></article>
          <details><summary>{w.advanced}</summary><p>{w.advancedNote}</p><button onClick={() => suggest(workspaceCommands[6])}>{w.capabilities}</button></details>
          <button onClick={() => setPanel("developers")}>{w.developers}</button><Link href="/guide">{w.guide}</Link>
        </div>}
        {panel === "account" && <div className="workspace-account">
          <LanguageControl /><h3>{w.identity}</h3><p>{current?.profile?.email ?? user?.email?.address ?? t.authenticated}</p>
          <button disabled={session.closing} onClick={() => void signOut()}>{session.closing ? sessionCloseCopy[locale].closing : w.signout}</button>
          <details><summary>{w.connections}</summary><AgentConnectedApps key={userId} locale={locale} getAccessToken={getAccessToken} /><div ref={setConnectionsContainer} id="agent-account-connections" /></details>
          <details><summary>{w.memory}</summary><AgentMemoryVault key={userId} getAccessToken={getAccessToken} /></details>
          <details><summary>{w.activity}</summary>{current?.history?.length ? <ol>{current.history.map(event => <li key={event.id}><p>{event.summary}</p><time>{new Date(event.createdAt).toLocaleString(locale)}</time></li>)}</ol> : <p>{w.empty}</p>}</details>
          <button onClick={() => setPanel("developers")}>{w.developers}</button><Link href="/guide">{w.guide}</Link>
        </div>}
        {panel === "developers" && <div className="workspace-developers"><p>{w.developerNote}</p>
          <h3>{w.commands}</h3><p>{w.exampleNote}</p><Link href="/developers">{w.developers}</Link>{workspaceCommands.map(command => <button key={command} onClick={() => suggest(command)}><code>{command}</code></button>)}
          <details><summary>{w.diagnostics}</summary><WebMcpInspector locale={locale} getAccessToken={getAccessToken} /></details>
          <details><summary>{w.credentials}</summary><AgentExternalAccess key={userId} locale={locale} getAccessToken={getAccessToken} /></details>
          {status === "error" && <details><summary>{w.help}</summary><p>{error}</p></details>}
        </div>}
        {panel === "travel" && <section className="agent-travel"><p>{w.travelNote}</p><form onSubmit={searchTravel}>
          <label>{w.where}<input name="location" placeholder="Santiago, Chile" required minLength={2} /></label>
          <label>{w.checkIn}<input name="checkIn" type="date" required /></label><label>{w.checkOut}<input name="checkOut" type="date" required /></label>
          <label>{w.guests}<select name="guests" defaultValue="2">{[1,2,3,4,5,6].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>{w.maxPrice}<input name="maxPrice" type="number" min="1" max="10000" placeholder="200" /></label>
          <button disabled={travelStatus === "searching"}>{travelStatus === "searching" ? w.searching : w.search}</button>
        </form>{travelError && <p role="alert">{w.travelError}</p>}
          {travelResult && <div aria-live="polite"><p>{travelResult.hotels.length} {w.options}</p>{travelResult.hotels.map(hotel => <article key={hotel.packageId}><h3>{hotel.name}</h3><p>{hotel.address}</p><p>{hotel.totalPriceUSD === null ? w.unavailable : `USD ${hotel.totalPriceUSD.toFixed(2)}`} · {hotel.pricePerNightUSD === null ? w.unavailable : `USD ${hotel.pricePerNightUSD.toFixed(2)}`} / {w.night}</p></article>)}</div>}
        </section>}
      </AgentPanel>}
    </section>
  </WebMcpProvider>;
}
