"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import type { Locale } from "../language-toggle";
import { useConnectionEnvironment } from "./connection-environment";
import { sessionAbortable } from "../agent/session-request";

const copy = {
  es: { create: "Crear cuenta o ingresar a Carmelita", loading: "Comprobando tu cuenta…", email: "Correo de identidad disponible para OAuth", missing: "Vincula y verifica un correo en esta misma cuenta antes de autorizar ChatGPT. Conservaremos tu identidad y wallets.", link: "Vincular correo", wallets: "Wallets registradas", none: "Completa la preparación de tus wallets en Carmelita.", refresh: "Comprobar de nuevo", unavailable: "No pudimos comprobar tu cuenta. Reintenta; no se ha confirmado la preparación.", disabled: "El ingreso está temporalmente no disponible.", check: "Comprobar autorización OAuth", authorized: "Hay aplicaciones OAuth autorizadas en tu cuenta Carmelita. Confirma la conexión de ChatGPT con la consulta de prueba.", pending: "No hay una autorización OAuth registrada. Continúa en ChatGPT.", unknown: "No pudimos comprobar la autorización. Reintenta.", account: "Tu sesión de Carmelita está iniciada.", return: "Después de ingresar, vuelve a esta guía o abre Conectar con ChatGPT en Carmelita." },
  en: { create: "Create an account or sign in to Carmelita", loading: "Checking your account…", email: "Identity email available for OAuth", missing: "Link and verify an email on this same account before authorizing ChatGPT. Your identity and wallets will be preserved.", link: "Link email", wallets: "Registered wallets", none: "Finish preparing your wallets in Carmelita.", refresh: "Check again", unavailable: "We could not check your account. Retry; preparation has not been confirmed.", disabled: "Sign-in is temporarily unavailable.", check: "Check OAuth authorization", authorized: "Your Carmelita account has authorized OAuth applications. Verify the ChatGPT connection with the test query.", pending: "No OAuth authorization recorded. Continue in ChatGPT.", unknown: "We could not check authorization. Retry.", account: "You are signed in to Carmelita.", return: "After signing in, return to this guide or open Connect with ChatGPT in Carmelita." },
  pt: { create: "Criar conta ou entrar na Carmelita", loading: "Conferindo sua conta…", email: "Email de identidade disponível para OAuth", missing: "Vincule e verifique um email nesta mesma conta antes de autorizar o ChatGPT. Sua identidade e carteiras serão preservadas.", link: "Vincular email", wallets: "Carteiras registradas", none: "Conclua a preparação das carteiras na Carmelita.", refresh: "Conferir novamente", unavailable: "Não foi possível conferir sua conta. Tente novamente; a preparação não foi confirmada.", disabled: "O acesso está temporariamente indisponível.", check: "Conferir autorização OAuth", authorized: "Sua conta Carmelita tem aplicações OAuth autorizadas. Confira a conexão ChatGPT com a consulta de teste.", pending: "Não há autorização OAuth registrada. Continue no ChatGPT.", unknown: "Não foi possível conferir a autorização. Tente novamente.", account: "Sua sessão Carmelita está iniciada.", return: "Depois de entrar, volte ao guia ou abra Conectar ao ChatGPT na Carmelita." },
};

export default function ConnectionAccount({ locale, onExternalDialog }: { locale: Locale; onExternalDialog?: () => void }) {
  const { signInAvailable } = useConnectionEnvironment();
  if (!signInAvailable) return <p>{copy[locale].disabled}</p>;
  return <PrivyConnectionAccount key={locale} locale={locale} onExternalDialog={onExternalDialog} />;
}

function PrivyConnectionAccount({ locale, onExternalDialog }: { locale: Locale; onExternalDialog?: () => void }) {
  const { ready, authenticated, user, getAccessToken, linkEmail } = usePrivy();
  // Keying the owner subtree prevents a late response from another account appearing.
  if (!ready) return <p role="status">{copy[locale].loading}</p>;
  if (!authenticated || !user) return <><Link href="/agent?connect=privy">{copy[locale].create}</Link><p>{copy[locale].return}</p></>;
  return <OwnReadiness key={user.id} locale={locale} getAccessToken={getAccessToken} onLinkEmail={() => { onExternalDialog?.(); linkEmail(); }} />;
}

function OwnReadiness({ locale, getAccessToken, onLinkEmail }: { locale: Locale; getAccessToken: () => Promise<string | null>; onLinkEmail: () => void }) {
  const t = Object.fromEntries(Object.entries(copy[locale]).map(([key, value]) => [key, value.replaceAll("ChatGPT", { es: "tu asistente", en: "your assistant", pt: "seu assistente" }[locale])])) as typeof copy[Locale];
  const [readiness, setReadiness] = useState<{ emailReady: boolean; registeredWallets: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [authorization, setAuthorization] = useState<"authorized" | "pending" | "unknown" | null>(null);
  const [checking, setChecking] = useState(false);
  const authorizationRequest = useRef<AbortController | null>(null);
  function refresh() {
    authorizationRequest.current?.abort();
    setChecking(false); setAuthorization(null); setReadiness(null); setFailed(false);
    setRevision(value => value + 1);
  }
  const ownFetch = useCallback(async (path: string, signal: AbortSignal) => {
    const token = await sessionAbortable(getAccessToken, signal);
    signal.throwIfAborted();
    if (!token) throw new Error("token_pending");
    const response = await sessionAbortable(() => fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal }), signal);
    if (!response.ok) throw new Error("unavailable");
    return sessionAbortable(() => response.json(), signal);
  }, [getAccessToken]);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void ownFetch("/api/agent/connection-readiness", signal).then(body => {
      signal.throwIfAborted();
      if (typeof body.emailReady !== "boolean" || !Number.isInteger(body.registeredWallets)) throw new Error("invalid_readiness");
      setReadiness(body); setFailed(false);
    }).catch(() => { if (!controller.signal.aborted) { setReadiness(null); setFailed(true); } });
    return () => controller.abort();
  }, [ownFetch, revision]);
  useEffect(() => {
    const controller = new AbortController();
    window.addEventListener("focus", refresh, { signal: controller.signal });
    return () => { controller.abort(); authorizationRequest.current?.abort(); };
    // refresh uses only stable setters and the current request ref.
  }, []);
  async function checkAuthorization() {
    authorizationRequest.current?.abort();
    const controller = new AbortController();
    authorizationRequest.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    setChecking(true); setAuthorization(null);
    try {
      const body = await ownFetch("/api/agent/connected-apps", signal);
      signal.throwIfAborted();
      if (body.status !== "ok" && body.status !== "connection_required") throw new Error("unavailable");
      setAuthorization(Array.isArray(body.connectedApps) && body.connectedApps.length > 0 ? "authorized" : "pending");
    } catch { if (!controller.signal.aborted) setAuthorization("unknown"); }
    finally { if (authorizationRequest.current === controller && !controller.signal.aborted) setChecking(false); }
  }
  return <div>
    <p>{t.account}</p>
    <div role="status">{failed ? t.unavailable : !readiness ? t.loading : <><p>{readiness.emailReady ? t.email : t.missing}</p><p>{t.wallets}: {readiness.registeredWallets}. {readiness.registeredWallets === 0 && t.none}</p></>}</div>
    {readiness && !readiness.emailReady && <button type="button" onClick={onLinkEmail}>{t.link}</button>}
    <button type="button" onClick={refresh}>{t.refresh}</button>
    <Link href="/agent">{t.create}</Link>
    <p><button type="button" disabled={checking} onClick={() => void checkAuthorization()}>{t.check}</button></p>
    <p role="status">{authorization ? t[authorization] : ""}</p>
  </div>;
}
