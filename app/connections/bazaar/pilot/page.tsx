"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useLocale } from "@/app/language-toggle";
import { useConnectionEnvironment } from "@/app/connect-chatgpt/connection-environment";
import styles from "../link.module.css";

type Status = { state: string; revision: number; nonce?: string; signingEnabled?: boolean; schemaReady?: boolean; approvalExpiresAt?: string };
const text = {
  en: {title:"Bazaar Testnet signing pilot",intro:"Review an exact 0.01 USDC authorization using your existing Carmelita wallet and connected Bazaar agent.",
    back:"Connections",session:"Return with your existing signed-in Carmelita account and linked Bazaar agent.",check:"Check signer status",review:"Review exact terms",challenge:"Prepare unsigned authorization",sign:"Authorize one signature",busy:"Checking…",
    disabled:"Signing is disabled. Publishing this page does not authorize spending.",terms:"Stellar Testnet · 0.01 USDC · marketplace fee 0. Network fees must be sponsored, capped at 1,000,000 stroops; this wallet does not authorize an XLM fee. This page cannot create an order or submit a payment. A separately authorized new order must already exist before unsigned preparation.",
    confirm:"I authorize one signature for this exact Testnet transfer. I understand an uncertain response must not be retried.",error:"The action could not be confirmed. Check status; do not repeat a signature.",status:"Signer state",uncertain:"This operation is locked. Do not retry; inspect the existing operation.",signed:"One verified signature is stored privately. No payment has been submitted.",expires:"Approval expires",existing:"This pilot uses the existing wallet only; it does not create or fund wallets."},
  es: {title:"Piloto de firma Testnet de Bazaar",intro:"Revisa una autorización exacta de 0,01 USDC con tu wallet existente de Carmelita y tu agente de Bazaar conectado.",
    back:"Conexiones",session:"Vuelve con tu cuenta existente de Carmelita con sesión iniciada y tu agente de Bazaar vinculado.",check:"Comprobar firmante",review:"Revisar términos exactos",challenge:"Preparar autorización sin firma",sign:"Autorizar una firma",busy:"Comprobando…",
    disabled:"La firma está desactivada. Publicar esta página no autoriza gastos.",terms:"Stellar Testnet · 0,01 USDC · comisión del marketplace 0. La tarifa de red debe estar patrocinada, con techo de 1.000.000 stroops; esta wallet no autoriza una tarifa XLM. Esta página no crea pedidos ni envía pagos. Debe existir previamente un pedido nuevo autorizado por separado.",
    confirm:"Autorizo una firma para esta transferencia exacta en Testnet. Entiendo que una respuesta incierta no debe repetirse.",error:"No se confirmó la acción. Comprueba el estado; no repitas una firma.",status:"Estado del firmante",uncertain:"La operación está bloqueada. No reintentes; inspecciona la operación existente.",signed:"Una firma verificada quedó guardada en privado. No se envió ningún pago.",expires:"Vence la aprobación",existing:"Este piloto usa sólo la wallet existente; no crea ni fondea wallets."},
};
export default function PilotSignerPage() {
  const { locale, setLocale } = useLocale(), language = locale === "es" ? "es" : "en", t = text[language];
  const { signInAvailable } = useConnectionEnvironment();
  return <main className={styles.page} lang={language}><div className={styles.content}>
    <Link href="/connections">{t.back}</Link><div className={styles.languages} role="group" aria-label="Language">
      <button type="button" aria-pressed={language === "en"} onClick={() => setLocale("en")}>English</button>
      <button type="button" aria-pressed={language === "es"} onClick={() => setLocale("es")}>Español</button></div>
    <h1>{t.title}</h1><p>{t.intro}</p><section className={styles.panel} aria-label={t.title}>
      <p>{t.terms}</p><p className={styles.hint}>{t.existing}</p>
      <p><code>ed6c4530-e76f-49e0-8f39-5ec8578820e2</code></p>
      {signInAvailable ? <ExistingPilotSession key={language} language={language} /> : <p>{t.session}</p>}
    </section></div></main>;
}
function ExistingPilotSession({language}:{language:"en"|"es"}) {
  const {ready,authenticated,user,getAccessToken} = usePrivy(), t = text[language];
  return ready && authenticated && user ? <PilotControls key={user.id} language={language} getAccessToken={getAccessToken} /> : <p>{t.session}</p>;
}
function PilotControls({language,getAccessToken}:{language:"en"|"es";getAccessToken:()=>Promise<string|null>}) {
  const t = text[language], active = useRef<AbortController|null>(null), inFlight = useRef(false);
  const [status,setStatus] = useState<Status|null>(null), [busy,setBusy] = useState(false), [error,setError] = useState(false), [confirmed,setConfirmed] = useState(false);
  useEffect(() => () => { active.current?.abort(); },[]);
  async function action(kind:"status"|"review"|"challenge"|"sign") {
    if (inFlight.current || window.location.origin !== "https://carmelita.browns.studio") return;
    const controller = new AbortController(); active.current = controller; inFlight.current = true; setBusy(true); setError(false); setConfirmed(false);
    try {
      const token = await getAccessToken(); if (!token || controller.signal.aborted) throw Error();
      const body = kind === "status" ? undefined : {action:kind,revision:status?.revision ?? -1,
        ...(kind === "challenge" || kind === "sign" ? {nonce:status?.nonce} : {}),...(kind === "sign" ? {confirmation:"SIGN 0.01 USDC ON STELLAR TESTNET"} : {})};
      const res = await fetch("/api/connections/bazaar-native/pilot",{method:body ? "POST":"GET",headers:{Authorization:"Bearer "+token,...(body ? {"Content-Type":"application/json"} : {})},
        ...(body ? {body:JSON.stringify(body)} : {}),redirect:"error",cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
      const result = await res.json(); if (!res.ok || typeof result.state !== "string" || !Number.isSafeInteger(result.revision)) throw Error();
      if (!controller.signal.aborted) setStatus(previous => ({...result,signingEnabled:result.signingEnabled ?? previous?.signingEnabled,schemaReady:result.schemaReady ?? previous?.schemaReady}));
    } catch { if (!controller.signal.aborted) { setError(true); setStatus(previous => previous ? {...previous,nonce:undefined} : null); } }
    finally { if (!controller.signal.aborted) { inFlight.current=false; active.current=null; setBusy(false); } }
  }
  const enabled = status?.signingEnabled === true, locked = status && ["challenge-claimed","dispatch-claimed","uncertain"].includes(status.state);
  return <div aria-busy={busy}>
    {!enabled ? <p role="status">{t.disabled}</p> : null}
    <button type="button" disabled={busy} onClick={() => void action("status")}>{busy ? t.busy:t.check}</button>
    {status ? <p>{t.status}: <strong>{status.state}</strong></p> : null}
    {status?.approvalExpiresAt ? <p className={styles.hint}>{t.expires}: {status.approvalExpiresAt}</p> : null}
    {locked ? <p role="status">{t.uncertain}</p> : null}
    {status?.state === "signed" ? <p role="status">{t.signed}</p> : null}
    <button type="button" disabled={busy || status?.schemaReady !== true || !["not-prepared","review","challenge-bound"].includes(status.state)} onClick={() => void action("review")}>{t.review}</button>
    <button type="button" disabled={busy || !enabled || status?.state !== "review" || !status.nonce} onClick={() => void action("challenge")}>{t.challenge}</button>
    <label><input type="checkbox" checked={confirmed} disabled={busy || !enabled || status?.state !== "challenge-bound"} onChange={event => setConfirmed(event.target.checked)} /> {t.confirm}</label>
    <button className={styles.primary} type="button" disabled={busy || !enabled || !confirmed || status?.state !== "challenge-bound" || !status.nonce} onClick={() => void action("sign")}>{t.sign}</button>
    <p role="alert">{error ? t.error:""}</p>
  </div>;
}
