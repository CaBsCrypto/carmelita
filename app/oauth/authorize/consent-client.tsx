"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import BrandLockup from "../../brand-lockup";
import LanguageToggle, { useLocale } from "../../language-toggle";
import { AUTHORIZATION_TIMEOUT_MS, CONSENT_TIMEOUT_MS, ConsentRequestError, createConsentDecision, requestConsentPreflight, type ConsentPreflight } from "./consent-request";
import access from "../../account-access.module.css";
import styles from "./consent.module.css";

const copy = {
  es: {
    eyebrow: "Conexión segura", title: "Conecta Carmelita con tu chat", wants: "quiere conectarse con Carmelita",
    lede: "Ingresa con tu correo para crear o recuperar tu cuenta Carmelita y revisa los permisos que pide esta aplicación. Puedes denegar o revocar el acceso después.",
    loading: "Cargando el inicio de sesión…", login: "Iniciar sesión o crear cuenta", inspecting: "Revisando los permisos solicitados…", account: "Cuenta Carmelita", permissions: "La aplicación solicita", permission: "Permiso", deny: "Denegar", allow: "Autorizar conexión", working: "Preparando cuenta y conexión…", continue: "Continuar a",
    ready: "La respuesta de autorización está lista. Continúa para terminar la conexión en tu chat.",
    deniedReady: "El acceso fue denegado. Continúa para volver a tu chat sin conectar Carmelita.",
    existingLede: "Inicia sesión con tu cuenta Carmelita existente y revisa los permisos que solicita esta aplicación. Puedes denegar o revocar el acceso después.",
    existingWorking: "Comprobando billeteras y conexión…",
    existingLogin: "Iniciar sesión con mi cuenta existente",
    existingWarning: "Esta conexión comprueba que tus billeteras existentes pertenecen a tu cuenta, sin crear direcciones ni solicitar fondos. agent:read permite leer tus billeteras, catálogo y actividad; agent:context permite usar tu contexto autorizado. Si autorizas agent:wallet:associate, podrás guardar la asociación de tu EVM existente con Tempo Moderato mediante una orden explícita en el chat. La conexión no concede permiso para firmar ni enviar pagos.",
    warning: "Al autorizar, preparamos o recuperamos tus direcciones de wallets y guardamos su registro antes de conectar tu chat. La activación de Stellar Testnet puede quedar pendiente; esta autorización no solicita fondos. agent:read permite lectura de billeteras, catálogo y actividad. El historial de conversaciones requiere agent:conversation, si aparece en esta lista. Esta conexión no autoriza firmas, pagos ni operaciones Mainnet.",
    recover: "Comienza una conexión nueva desde ChatGPT. La misma aprobación no se volverá a enviar desde esta página.", guide: "Ver guía de conexión",
    scopes: { openid: "Identificar tu cuenta Carmelita", email: "Compartir tu correo verificado", profile: "Leer tu perfil básico", offline_access: "Mantener la conexión hasta que la revoques", "agent:read": "Leer tus billeteras, el catálogo y tu actividad", "agent:plan": "Preparar planes y vistas previas", "agent:context": "Usar contexto personal autorizado", "agent:conversation": "Consultar y continuar tus conversaciones en Carmelita", "agent:wallet:associate": "Guardar la asociación de tu EVM existente con Tempo Moderato cuando lo pidas en el chat; sin crear wallets, firmar ni mover fondos" },
    errors: { wallet_preparation_failed: "No pudimos preparar todas tus wallets. Inicia una conexión nueva para reintentar; las direcciones registradas se conservan.", wallet_identity_conflict: "Hay un conflicto de identidad entre tus wallets. Contacta soporte antes de reintentar.", session_unavailable: "La sesión Privy no está disponible.", inspection_failed: "No pudimos revisar esta conexión. Comienza una nueva desde ChatGPT.", inspection_timeout: "La revisión tardó demasiado. Comienza una conexión nueva desde ChatGPT.", authorization_failed: "No pudimos completar la autorización. Comienza una conexión nueva desde ChatGPT.", authorization_uncertain: "El estado de la conexión es incierto. Comienza una conexión nueva desde ChatGPT; no repitas esta aprobación.", redirect_invalid: "El destino de la respuesta no es válido. Comienza una conexión nueva desde ChatGPT.", cancelled: "La conexión se canceló al cambiar de sesión." },
  },
  en: {
    eyebrow: "Secure connection", title: "Connect Carmelita to your chat", wants: "wants to connect with Carmelita",
    lede: "Sign in with your email to create or recover your Carmelita account and review the permissions requested by this application. You can deny access or revoke it later.",
    loading: "Loading secure sign-in…", login: "Sign in or create account", inspecting: "Checking the requested permissions…", account: "Carmelita account", permissions: "The application requests", permission: "Permission", deny: "Deny", allow: "Allow connection", working: "Preparing account and connection…", continue: "Continue to",
    ready: "The authorization response is ready. Continue to finish connecting in your chat.",
    deniedReady: "Access was denied. Continue to return to your chat without connecting Carmelita.",
    existingLede: "Sign in with your existing Carmelita account and review the permissions this application requests. You can deny access or revoke it later.",
    existingWorking: "Checking wallets and connection…",
    existingLogin: "Sign in with my existing account",
    existingWarning: "This connection verifies that your existing wallets belong to your account without creating addresses or requesting funds. agent:read allows wallet, catalog and activity reads; agent:context allows your authorized context. If you grant agent:wallet:associate, you can save your existing EVM association with Tempo Moderato through an explicit instruction in the chat. This connection does not grant permission to sign or send payments.",
    warning: "When you authorize, we prepare or recover your wallet addresses and save their registration before connecting your chat. Stellar Testnet activation may remain pending; this authorization does not request funds. agent:read allows wallet, catalog and activity reads. Conversation history requires agent:conversation, if shown in this list. This connection does not authorize signing, payments or Mainnet operations.",
    recover: "Start a new connection from ChatGPT. This page will not send the same approval again.", guide: "Open connection guide",
    scopes: { openid: "Identify your Carmelita account", email: "Share your verified email", profile: "Read your basic profile", offline_access: "Stay connected until you revoke access", "agent:read": "Read your wallets, the catalog and your activity", "agent:plan": "Prepare plans and previews", "agent:context": "Use authorized personal context", "agent:conversation": "Read and continue your Carmelita conversations", "agent:wallet:associate": "Save your existing EVM association with Tempo Moderato when requested in the chat; no wallet creation, signing or fund movement" },
    errors: { wallet_preparation_failed: "We could not prepare all your wallets. Start a new connection to retry; registered addresses are preserved.", wallet_identity_conflict: "Your account has a wallet identity conflict. Contact support before retrying.", session_unavailable: "Your Privy session is unavailable.", inspection_failed: "We could not inspect this connection. Start a new connection from ChatGPT.", inspection_timeout: "Inspecting the connection took too long. Start a new connection from ChatGPT.", authorization_failed: "Authorization could not be completed. Start a new connection from ChatGPT.", authorization_uncertain: "Connection status is uncertain. Start a new connection from ChatGPT; do not repeat this approval.", redirect_invalid: "The response destination is invalid. Start a new connection from ChatGPT.", cancelled: "The connection was cancelled when the session changed." },
  },
  pt: {
    eyebrow: "Conexão segura", title: "Conecte Carmelita ao seu chat", wants: "quer se conectar à Carmelita",
    lede: "Entre com seu e-mail para criar ou recuperar sua conta Carmelita e confira as permissões solicitadas pelo aplicativo. Você pode negar o acesso ou revogá-lo depois.",
    loading: "Carregando o login…", login: "Entrar ou criar conta", inspecting: "Conferindo as permissões solicitadas…", account: "Conta Carmelita", permissions: "O aplicativo solicita", permission: "Permissão", deny: "Negar", allow: "Autorizar conexão", working: "Preparando conta e conexão…", continue: "Continuar para",
    ready: "A resposta de autorização está pronta. Continue para concluir a conexão no seu chat.",
    deniedReady: "O acesso foi negado. Continue para voltar ao seu chat sem conectar a Carmelita.",
    existingLede: "Entre com sua conta Carmelita existente e confira as permissões solicitadas pelo aplicativo. Você pode negar o acesso ou revogá-lo depois.",
    existingWorking: "Conferindo carteiras e conexão…",
    existingLogin: "Entrar com minha conta existente",
    existingWarning: "Esta conexão verifica se suas carteiras existentes pertencem à sua conta, sem criar endereços ou solicitar fundos. agent:read permite consultar carteiras, catálogo e atividade; agent:context permite usar seu contexto autorizado. Se você autorizar agent:wallet:associate, poderá salvar a associação da sua EVM existente com Tempo Moderato mediante uma instrução explícita no chat. A conexão não concede permissão para assinar ou enviar pagamentos.",
    warning: "Ao autorizar, preparamos ou recuperamos os endereços das suas carteiras e salvamos o registro antes de conectar seu chat. A ativação da Stellar Testnet pode ficar pendente; esta autorização não solicita fundos. agent:read permite consultar carteiras, catálogo e atividade. O histórico de conversas exige agent:conversation, se aparecer nesta lista. Esta conexão não autoriza assinaturas, pagamentos nem operações Mainnet.",
    recover: "Inicie uma conexão nova pelo ChatGPT. Esta página não enviará a mesma aprovação novamente.", guide: "Ver guia de conexão",
    scopes: { openid: "Identificar sua conta Carmelita", email: "Compartilhar seu e-mail verificado", profile: "Ler seu perfil básico", offline_access: "Manter a conexão até você revogá-la", "agent:read": "Consultar suas carteiras, o catálogo e sua atividade", "agent:plan": "Preparar planos e prévias", "agent:context": "Usar contexto pessoal autorizado", "agent:conversation": "Consultar e continuar suas conversas na Carmelita", "agent:wallet:associate": "Salvar a associação da sua EVM existente com Tempo Moderato quando solicitado no chat; sem criar carteiras, assinar ou movimentar fundos" },
    errors: { wallet_preparation_failed: "Não foi possível preparar todas as carteiras. Inicie uma nova conexão para tentar novamente; os endereços registrados serão preservados.", wallet_identity_conflict: "Há um conflito de identidade entre as carteiras. Contate o suporte antes de tentar novamente.", session_unavailable: "Sua sessão Privy está indisponível.", inspection_failed: "Não foi possível conferir a conexão. Inicie uma conexão nova pelo ChatGPT.", inspection_timeout: "A revisão demorou demais. Inicie uma conexão nova pelo ChatGPT.", authorization_failed: "Não foi possível concluir a autorização. Inicie uma conexão nova pelo ChatGPT.", authorization_uncertain: "O estado da conexão é incerto. Inicie uma conexão nova pelo ChatGPT; não repita esta aprovação.", redirect_invalid: "O destino da resposta é inválido. Inicie uma conexão nova pelo ChatGPT.", cancelled: "A conexão foi cancelada quando a sessão mudou." },
  },
};

const existingErrors = {
  es: { existing_wallets_required: "Este entorno admite únicamente cuentas con sus tres familias de wallets ya registradas. Las cuentas nuevas o con solo EVM todavía no pueden conectarse aquí. No se creó ni activó ninguna wallet.", existing_wallets_unavailable: "No pudimos comprobar tus billeteras existentes. Comienza una conexión nueva desde ChatGPT para reintentar." },
  en: { existing_wallets_required: "This environment only accepts accounts with all three wallet families already registered. New accounts and accounts with only EVM cannot connect here yet. No wallet was created or activated.", existing_wallets_unavailable: "We could not verify your existing wallets. Start a new connection from ChatGPT to retry." },
  pt: { existing_wallets_required: "Este ambiente aceita apenas contas com as três famílias de carteiras já registradas. Contas novas ou apenas com EVM ainda não podem se conectar aqui. Nenhuma carteira foi criada ou ativada.", existing_wallets_unavailable: "Não foi possível verificar suas carteiras existentes. Inicie uma conexão nova pelo ChatGPT para tentar novamente." },
};

export default function ConsentClient({ existingWalletsOnly = false }: { existingWalletsOnly?: boolean }) {
  const privy = usePrivy();
  const owner = privy.authenticated ? privy.user?.id : undefined;
  // A new verified SDK identity receives a new UI and request lifetime; old responses cannot enter it.
  return <ConsentSession key={owner || "signed-out"} existingWalletsOnly={existingWalletsOnly} ready={privy.ready} authenticated={privy.authenticated} owner={owner} email={privy.user?.email?.address} login={privy.login} getAccessToken={privy.getAccessToken} />;
}

function ConsentSession({ existingWalletsOnly, ready, authenticated, owner, email, login, getAccessToken }: {
  existingWalletsOnly: boolean;
  ready: boolean; authenticated: boolean; owner?: string; email?: string;
  login: () => void; getAccessToken: () => Promise<string | null>;
}) {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const errors = { ...t.errors, ...existingErrors[locale] };
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

  const accessDenied = redirectUri ? new URL(redirectUri).searchParams.get("error") === "access_denied" : false;

  return (
    <main className={`${access.page} ${styles.shell}`}>
      <section className={`${access.shell} ${styles.card}`} aria-labelledby="oauth-title">
        <div className={`${access.header} ${styles.top}`}>
          <div className={access.brand}><BrandLockup /></div>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
        </div>
        <div className={`${access.content} ${styles.content}`}>
          <p className={access.kicker}>{t.eyebrow}</p>
          <h1 id="oauth-title" className={`${access.title} ${styles.title}`}>{preflight ? `${preflight.client.clientName} ${t.wants}` : t.title}</h1>
          <p className={`${access.lede} ${styles.lede}`}>{existingWalletsOnly ? t.existingLede : t.lede}</p>
          {!ready && <p className={access.status} role="status">{t.loading}</p>}
          {ready && !authenticated && <button className={`${access.primary} ${styles.primary}`} onClick={login}>{existingWalletsOnly ? t.existingLogin : t.login}</button>}
          {ready && authenticated && !preflight && !error && <p className={access.status} role="status">{t.inspecting}</p>}
          {preflight && (
            <>
              {email && <div className={styles.identity}><p>{t.account}</p><p>{email}</p></div>}
              {preflight.client.clientDescription && <p className={styles.description}>{preflight.client.clientDescription}</p>}
              <div className={styles.permissions}>
                <h2>{t.permissions}</h2>
                <ul>
                  {preflight.requestedScopes.map(scope => (
                    <li key={scope}>
                      <span className={styles.scopeMark} aria-hidden="true" />
                      <div>{(t.scopes as Record<string, string>)[scope] || t.permission}<code>{scope}</code></div>
                    </li>
                  ))}
                </ul>
              </div>
              <p className={access.warning}>{existingWalletsOnly ? t.existingWarning : t.warning}</p>
              {redirectUri ? <><p className={access.status} role="status">{accessDenied ? t.deniedReady : t.ready}</p><div className={`${access.actions} ${styles.actions}`}><a className={`${access.primary} ${styles.primary}`} href={redirectUri} rel="noreferrer">{t.continue} {preflight.client.clientName}</a></div></> : <div className={`${access.actions} ${styles.actions}`}><button className={`${access.secondary} ${styles.secondary}`} disabled={busy || decisionStarted} onClick={() => decide(false)}>{t.deny}</button><button className={`${access.primary} ${styles.primary}`} disabled={busy || decisionStarted} onClick={() => decide(true)}>{busy ? (existingWalletsOnly ? t.existingWorking : t.working) : t.allow}</button></div>}
            </>
          )}
          {error && <><p className={access.error} role="alert">{errors[error]}</p>{decisionStarted && <p className={styles.description}>{t.recover}</p>}</>}
          <p className={`${access.help} ${styles.footer}`}><Link href="/connect-chatgpt">{t.guide}</Link></p>
        </div>
      </section>
    </main>
  );
}
