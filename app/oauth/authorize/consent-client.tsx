"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import LanguageToggle, { useLocale } from "../../language-toggle";
import { AUTHORIZATION_TIMEOUT_MS, CONSENT_TIMEOUT_MS, ConsentRequestError, createConsentDecision, requestConsentPreflight, type ConsentPreflight } from "./consent-request";
import styles from "./consent.module.css";

const copy = {
  es: {
    eyebrow: "CONEXIÓN SEGURA", title: "Conecta Carmelita con tu chat", wants: "quiere conectarse con Carmelita",
    lede: "Ingresa con tu correo para crear o recuperar tu cuenta Carmelita y revisa los permisos que pide esta aplicación. Puedes denegar o revocar el acceso después.",
    loading: "Cargando el inicio de sesión…", login: "Continuar con Privy", inspecting: "Revisando los permisos solicitados…", account: "Cuenta Carmelita", permissions: "La aplicación solicita", permission: "Permiso", deny: "Denegar", allow: "Autorizar conexión", working: "Preparando cuenta y conexión…", continue: "Continuar a",
    ready: "La respuesta de autorización está lista. Continúa para terminar la conexión en tu chat.",
    warning: "Al autorizar, prepararemos o recuperaremos tus mismas direcciones de wallets. Si hace falta, intentaremos activar Stellar Testnet recibiendo XLM del Friendbot oficial; son fondos de prueba sin valor real. Si el servicio externo falla, la activación quedará pendiente y podrás reintentar conservando tu dirección. agent:read permite lectura de billeteras, catálogo y actividad. El historial de conversaciones requiere agent:conversation, si aparece en esta lista. Esta conexión no autoriza pagos, operaciones Mainnet ni financiación en USDC.",
    recover: "Comienza una conexión nueva desde ChatGPT. La misma aprobación no se volverá a enviar desde esta página.", guide: "Ver guía de conexión",
    scopes: { openid: "Identificar tu cuenta Carmelita", email: "Compartir tu correo verificado", profile: "Leer tu perfil básico", offline_access: "Mantener la conexión hasta que la revoques", "agent:read": "Leer tus billeteras, el catálogo y tu actividad", "agent:plan": "Preparar planes y vistas previas", "agent:context": "Usar contexto personal autorizado", "agent:conversation": "Consultar y continuar tus conversaciones en Carmelita" },
    errors: { wallet_preparation_failed: "No pudimos preparar todas tus wallets. Inicia una conexion nueva para reintentar; las direcciones registradas se conservan.", wallet_identity_conflict: "Hay un conflicto de identidad entre tus wallets. Contacta soporte antes de reintentar.", session_unavailable: "La sesión Privy no está disponible.", inspection_failed: "No pudimos revisar esta conexión. Comienza una nueva desde ChatGPT.", inspection_timeout: "La revisión tardó demasiado. Comienza una conexión nueva desde ChatGPT.", authorization_failed: "No pudimos completar la autorización. Comienza una conexión nueva desde ChatGPT.", authorization_uncertain: "El estado de la conexión es incierto. Comienza una conexión nueva desde ChatGPT; no repitas esta aprobación.", redirect_invalid: "El destino de la respuesta no es válido. Comienza una conexión nueva desde ChatGPT.", cancelled: "La conexión se canceló al cambiar de sesión." },
  },
  en: {
    eyebrow: "SECURE CONNECTION", title: "Connect Carmelita to your chat", wants: "wants to connect with Carmelita",
    lede: "Sign in with your email to create or recover your Carmelita account and review the permissions requested by this application. You can deny access or revoke it later.",
    loading: "Loading secure sign-in…", login: "Continue with Privy", inspecting: "Checking the requested permissions…", account: "Carmelita account", permissions: "The application requests", permission: "Permission", deny: "Deny", allow: "Allow connection", working: "Preparing account and connection…", continue: "Continue to",
    ready: "The authorization response is ready. Continue to finish connecting in your chat.",
    warning: "When you authorize, we prepare or recover your same wallet addresses. If needed, we attempt to activate Stellar Testnet by receiving XLM from the official Friendbot; these test funds have no real value. If the external service fails, activation remains pending and you can retry with the same address. agent:read allows wallet, catalog and activity reads. Conversation history requires agent:conversation, if shown in this list. This connection does not authorize payments, Mainnet operations or USDC funding.",
    recover: "Start a new connection from ChatGPT. This page will not send the same approval again.", guide: "Open connection guide",
    scopes: { openid: "Identify your Carmelita account", email: "Share your verified email", profile: "Read your basic profile", offline_access: "Stay connected until you revoke access", "agent:read": "Read your wallets, the catalog and your activity", "agent:plan": "Prepare plans and previews", "agent:context": "Use authorized personal context", "agent:conversation": "Read and continue your Carmelita conversations" },
    errors: { wallet_preparation_failed: "We could not prepare all your wallets. Start a new connection to retry; registered addresses are preserved.", wallet_identity_conflict: "Your account has a wallet identity conflict. Contact support before retrying.", session_unavailable: "Your Privy session is unavailable.", inspection_failed: "We could not inspect this connection. Start a new connection from ChatGPT.", inspection_timeout: "Inspecting the connection took too long. Start a new connection from ChatGPT.", authorization_failed: "Authorization could not be completed. Start a new connection from ChatGPT.", authorization_uncertain: "Connection status is uncertain. Start a new connection from ChatGPT; do not repeat this approval.", redirect_invalid: "The response destination is invalid. Start a new connection from ChatGPT.", cancelled: "The connection was cancelled when the session changed." },
  },
  pt: {
    eyebrow: "CONEXÃO SEGURA", title: "Conecte Carmelita ao seu chat", wants: "quer se conectar à Carmelita",
    lede: "Entre com seu e-mail para criar ou recuperar sua conta Carmelita e confira as permissões solicitadas pelo aplicativo. Você pode negar o acesso ou revogá-lo depois.",
    loading: "Carregando o login…", login: "Continuar com Privy", inspecting: "Conferindo as permissões solicitadas…", account: "Conta Carmelita", permissions: "O aplicativo solicita", permission: "Permissão", deny: "Negar", allow: "Autorizar conexão", working: "Preparando conta e conexão…", continue: "Continuar para",
    ready: "A resposta de autorização está pronta. Continue para concluir a conexão no seu chat.",
    warning: "Ao autorizar, preparamos ou recuperamos os mesmos endereços das suas carteiras. Se necessário, tentamos ativar a Stellar Testnet recebendo XLM do Friendbot oficial; esses fundos de teste não têm valor real. Se o serviço externo falhar, a ativação ficará pendente e você poderá tentar novamente com o mesmo endereço. agent:read permite consultar carteiras, catálogo e atividade. O histórico de conversas exige agent:conversation, se aparecer nesta lista. Esta conexão não autoriza pagamentos, operações Mainnet nem financiamento em USDC.",
    recover: "Inicie uma conexão nova pelo ChatGPT. Esta página não enviará a mesma aprovação novamente.", guide: "Ver guia de conexão",
    scopes: { openid: "Identificar sua conta Carmelita", email: "Compartilhar seu e-mail verificado", profile: "Ler seu perfil básico", offline_access: "Manter a conexão até você revogá-la", "agent:read": "Consultar suas carteiras, o catálogo e sua atividade", "agent:plan": "Preparar planos e prévias", "agent:context": "Usar contexto pessoal autorizado", "agent:conversation": "Consultar e continuar suas conversas na Carmelita" },
    errors: { wallet_preparation_failed: "Nao foi possivel preparar todas as carteiras. Inicie uma nova conexao para tentar novamente; os enderecos registrados serao preservados.", wallet_identity_conflict: "Ha um conflito de identidade entre as carteiras. Contate o suporte antes de tentar novamente.", session_unavailable: "Sua sessão Privy está indisponível.", inspection_failed: "Não foi possível conferir a conexão. Inicie uma conexão nova pelo ChatGPT.", inspection_timeout: "A revisão demorou demais. Inicie uma conexão nova pelo ChatGPT.", authorization_failed: "Não foi possível concluir a autorização. Inicie uma conexão nova pelo ChatGPT.", authorization_uncertain: "O estado da conexão é incerto. Inicie uma conexão nova pelo ChatGPT; não repita esta aprovação.", redirect_invalid: "O destino da resposta é inválido. Inicie uma conexão nova pelo ChatGPT.", cancelled: "A conexão foi cancelada quando a sessão mudou." },
  },
};

export default function ConsentClient() {
  const privy = usePrivy();
  const owner = privy.authenticated ? privy.user?.id : undefined;
  // A new verified SDK identity receives a new UI and request lifetime; old responses cannot enter it.
  return <ConsentSession key={owner || "signed-out"} ready={privy.ready} authenticated={privy.authenticated} owner={owner} email={privy.user?.email?.address} login={privy.login} getAccessToken={privy.getAccessToken} />;
}

function ConsentSession({ ready, authenticated, owner, email, login, getAccessToken }: {
  ready: boolean; authenticated: boolean; owner?: string; email?: string;
  login: () => void; getAccessToken: () => Promise<string | null>;
}) {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [preflight, setPreflight] = useState<ConsentPreflight | null>(null);
  const [error, setError] = useState<ConsentRequestError["code"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [decisionStarted, setDecisionStarted] = useState(false);
  const context = useRef<{ controller: AbortController; submit: ReturnType<typeof createConsentDecision> } | null>(null);

  // Abort during the identity switch commit, before a late token can continue in a microtask.
  useLayoutEffect(() => () => { context.current?.controller.abort(); }, []);

  useEffect(() => {
    if (!ready || !authenticated || !owner) return;
    const controller = new AbortController();
    const query = window.location.search;
    const current = { controller, submit: createConsentDecision(query, getAccessToken, fetch, AUTHORIZATION_TIMEOUT_MS, controller.signal) };
    context.current = current;
    requestConsentPreflight(query, getAccessToken, fetch, CONSENT_TIMEOUT_MS, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPreflight(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof ConsentRequestError ? cause.code : "inspection_failed"); });
    return () => { controller.abort(); if (context.current === current) context.current = null; };
  }, [ready, authenticated, owner, getAccessToken]);

  async function decide(consentGranted: boolean) {
    const current = context.current;
    if (!current || current.controller.signal.aborted || !preflight || decisionStarted) return;
    setDecisionStarted(true);
    setBusy(true);
    setError(null);
    try {
      const redirect = await current.submit(consentGranted);
      if (!current.controller.signal.aborted) setRedirectUri(redirect);
    } catch (cause) {
      if (!current.controller.signal.aborted) setError(cause instanceof ConsentRequestError ? cause.code : "authorization_failed");
    } finally { if (!current.controller.signal.aborted) setBusy(false); }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="oauth-title">
        <div className={styles.top}><div className={styles.brand}><span aria-hidden="true">C</span> Carmelita</div><LanguageToggle locale={locale} onChange={setLocale} compact /></div>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h1 id="oauth-title">{preflight ? `${preflight.client.clientName} ${t.wants}` : t.title}</h1>
        <p className={styles.lede}>{t.lede}</p>
        {!ready && <p className={styles.status} role="status">{t.loading}</p>}
        {ready && !authenticated && <button className={styles.primary} onClick={login}>{t.login}</button>}
        {ready && authenticated && !preflight && !error && <p className={styles.status} role="status">{t.inspecting}</p>}
        {preflight && (
          <>
            {email && <p className={styles.description}>{t.account}: {email}</p>}
            {preflight.client.clientDescription && <p className={styles.description}>{preflight.client.clientDescription}</p>}
            <div className={styles.permissions}><h2>{t.permissions}</h2><ul>{preflight.requestedScopes.map(scope => <li key={scope}><span aria-hidden="true">✓</span><div>{(t.scopes as Record<string, string>)[scope] || t.permission}<br /><code>{scope}</code></div></li>)}</ul></div>
            <p className={styles.warning}>{t.warning}</p>
            {redirectUri ? <><p className={styles.status} role="status">{t.ready}</p><div className={styles.actions}><a className={styles.primary} href={redirectUri} rel="noreferrer">{t.continue} {preflight.client.clientName}</a></div></> : <div className={styles.actions}><button className={styles.secondary} disabled={busy || decisionStarted} onClick={() => decide(false)}>{t.deny}</button><button className={styles.primary} disabled={busy || decisionStarted} onClick={() => decide(true)}>{busy ? t.working : t.allow}</button></div>}
          </>
        )}
        {error && <><p className={styles.error} role="alert">{t.errors[error]}</p>{decisionStarted && <p className={styles.description}>{t.recover}</p>}</>}
        <p className={styles.footer}><Link href="/connect-chatgpt">{t.guide}</Link></p>
      </section>
    </main>
  );
}
