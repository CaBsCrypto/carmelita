"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import BrandLockup from "@/app/brand-lockup";
import { useLocale } from "@/app/language-toggle";
import { useConnectionEnvironment } from "@/app/connect-chatgpt/connection-environment";
import { requestExistingBazaarLink, type LinkOutcome } from "./link-request";
import styles from "./link.module.css";
import { BazaarWorkspace } from "./bazaar-workspace";

const copy = {
  en: { title: "Connect your Bazaar agent", intro: "Connect an existing Bazaar agent to view your own order history in Carmelita.", back: "Connections", language: "Language", waiting: "Checking your Carmelita session…", signIn: "Sign in to Carmelita", signedOut: "Use your existing Carmelita account to continue.", unavailable: "Sign-in is unavailable for this connection. Return with an existing Carmelita session.", token: "Bazaar agent access", hint: "Paste the agent access from Bazaar’s Connect My Agent section.", privacy: "Use your agent access. Keep your recovery file and wallet keys private.", connect: "Connect agent", working: "Checking your agent…", help: "Open Bazaar", permissions: "This connection checks your agent and saves its access privately. Linking does not make a purchase.", connected: "Bazaar agent connected. You can ask Carmelita for your order history.", "invalid-token": "That access could not be verified as a Bazaar agent. Check the agent access in Bazaar and paste it again.", "sign-in": "Your session needs sign-in. Sign in to the same Carmelita account and return here.", "owner-mismatch": "This Carmelita account already has a different Bazaar link, or this access is older. Keep the existing link and check your current agent in Bazaar.", capacity: "Bazaar is temporarily limiting requests. Your access was cleared; try later.", unconfirmed: "The connection could not be confirmed. Your access was cleared. Check the connection from your agent before trying again.", origin: "Open this page on carmelita.browns.studio before connecting.", cleared: "The access is cleared from this form after every attempt.", session: "Using your signed-in Carmelita account." },
  es: { title: "Conecta tu agente de Bazaar", intro: "Conecta un agente existente de Bazaar para ver tu propio historial de pedidos en Carmelita.", back: "Conexiones", language: "Idioma", waiting: "Comprobando tu sesión de Carmelita…", signIn: "Ingresar a Carmelita", signedOut: "Usa tu cuenta existente de Carmelita para continuar.", unavailable: "El ingreso no está disponible para esta conexión. Vuelve con una sesión existente de Carmelita.", token: "Acceso de agente de Bazaar", hint: "Pega el acceso de agente de la sección Connect My Agent de Bazaar.", privacy: "Usa el acceso de tu agente. Mantén privados tu archivo de recuperación y las llaves de tu wallet.", connect: "Conectar agente", working: "Comprobando tu agente…", help: "Abrir Bazaar", permissions: "Esta conexión comprueba tu agente y guarda su acceso de forma privada. Enlazarlo no realiza una compra.", connected: "Agente de Bazaar conectado. Puedes pedirle a Carmelita tu historial de pedidos.", "invalid-token": "No se pudo verificar ese acceso como agente de Bazaar. Comprueba el acceso de agente en Bazaar y vuelve a pegarlo.", "sign-in": "Tu sesión requiere ingreso. Entra a la misma cuenta de Carmelita y vuelve aquí.", "owner-mismatch": "Esta cuenta de Carmelita ya tiene otro vínculo de Bazaar o este acceso es anterior. Conserva el vínculo existente y comprueba tu agente actual en Bazaar.", capacity: "Bazaar limita temporalmente las consultas. Borramos el acceso del formulario; inténtalo más tarde.", unconfirmed: "No se pudo confirmar la conexión. Borramos el acceso del formulario. Comprueba la conexión desde tu agente antes de intentarlo de nuevo.", origin: "Abre esta página en carmelita.browns.studio antes de conectar.", cleared: "El acceso se borra de este formulario después de cada intento.", session: "Se usa tu cuenta de Carmelita con sesión iniciada." },
};
type Language = keyof typeof copy;

export default function BazaarAgentLink({ safeSignInAvailable }: { safeSignInAvailable: boolean }) {
  const { locale, setLocale } = useLocale(), language: Language = locale === "es" ? "es" : "en", t = copy[language];
  const { signInAvailable } = useConnectionEnvironment();
  return <main className={styles.page} lang={language}>
    <nav className={styles.nav} aria-label={t.back}><Link className="brand" href="/"><BrandLockup /></Link><div className={styles.languages} role="group" aria-label={t.language}>{(["en", "es"] as const).map(item => <button key={item} type="button" aria-pressed={language === item} onClick={() => setLocale(item)}>{item === "en" ? "English" : "Español"}</button>)}</div></nav>
    <div className={styles.content}><Link href="/connections">{t.back}</Link><header><h1>{t.title}</h1><p>{t.intro}</p></header>
      <section className={styles.panel} aria-label={t.title}>
        {signInAvailable ? <PrivyLinkSession language={language} safeSignInAvailable={safeSignInAvailable} /> : <p role="status">{t.unavailable}</p>}
      </section>
      <p className={styles.note}>{t.permissions}</p><a href="https://bazaar.browns.studio/hub" target="_blank" rel="noopener noreferrer">{t.help}</a>
    </div>
  </main>;
}
function PrivyLinkSession({ language, safeSignInAvailable }: { language: Language; safeSignInAvailable: boolean }) {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy(), t = copy[language];
  if (!ready) return <p role="status">{t.waiting}</p>;
  if (!authenticated || !user) return <div><p>{t.signedOut}</p>{safeSignInAvailable
    ? <button className={styles.primary} type="button" onClick={() => login()}>{t.signIn}</button>
    : <p role="status">{t.unavailable}</p>}</div>;
  // A user change remounts the secret field and aborts any prior owner's request.
  return <div key={user.id}><SecretLinkForm language={language} getAccessToken={getAccessToken} /><BazaarWorkspace language={language} getAccessToken={getAccessToken} /></div>;
}
function SecretLinkForm({ language, getAccessToken }: { language: Language; getAccessToken: () => Promise<string | null> }) {
  const t = copy[language], field = useRef<HTMLInputElement>(null), active = useRef<AbortController | null>(null), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  useEffect(() => {
    const element = field.current;
    const clear = () => { if (element) element.value = ""; if (inFlight.current) setOutcome("unconfirmed"); active.current?.abort(); active.current = null; inFlight.current = false; setBusy(false); };
    window.addEventListener("pagehide", clear);
    return () => { if (element) element.value = ""; active.current?.abort(); window.removeEventListener("pagehide", clear); };
  }, []);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    let agentAccess = field.current?.value.trim() ?? "";
    if (field.current) field.current.value = "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(agentAccess)) { setOutcome("invalid-token"); return; }
    const controller = new AbortController(); active.current = controller; inFlight.current = true; setBusy(true); setOutcome(null);
    try {
      const result = await requestExistingBazaarLink(agentAccess, { pageOrigin: window.location.origin, getAccessToken, signal: controller.signal });
      if (!controller.signal.aborted && active.current === controller) setOutcome(result);
    } finally {
      agentAccess = "";
      if (!controller.signal.aborted && active.current === controller) { inFlight.current = false; active.current = null; setBusy(false); }
    }
  }
  return <form method="post" noValidate autoComplete="off" onSubmit={connect} aria-busy={busy}>
    <p className={styles.session}>{t.session}</p>
    <label className={styles.label} htmlFor="bazaar-agent-access">{t.token}</label>
    <p className={styles.hint} id="bazaar-agent-hint">{t.hint}</p>
    <input className={styles.input} id="bazaar-agent-access" ref={field} type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={128} aria-required="true" aria-describedby="bazaar-agent-hint bazaar-agent-privacy" aria-invalid={outcome === "invalid-token"} disabled={busy} onChange={() => setOutcome(null)} />
    <p className={styles.hint} id="bazaar-agent-privacy">{t.privacy}</p>
    <button className={styles.primary} type="submit" disabled={busy}>{busy ? t.working : t.connect}</button>
    <p className={styles.feedback} role="status" aria-live="polite" aria-atomic="true">{outcome ? t[outcome] : ""}</p>
    <small className={styles.hint}>{t.cleared}</small>
  </form>;
}
