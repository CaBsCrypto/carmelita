"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { sessionCloseCopy, useSessionClose } from "@/app/use-session-close";

export default function PrivyAdminLogin({ returnTo }: { returnTo: string }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const session = useSessionClose();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function enter() {
    setBusy(true);
    setError(false);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing_session");
      const response = await fetch("/api/admin/privy-session", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("access_denied");
      window.location.assign(returnTo);
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <div className="admin-login-form">
    <p>Inicia sesión con tu cuenta administradora de Carmelita.</p>
    {authenticated ? <>
      <button disabled={!ready || busy || session.closing || session.state === "failed"} onClick={enter}>{busy ? "Verificando acceso…" : "Entrar al panel"}</button>
      <button disabled={busy || session.closing} onClick={async () => { if (await session.close()) setError(false); }}>{session.closing ? sessionCloseCopy.es.closing : "Cambiar de cuenta"}</button>
    </> : <button disabled={!ready || session.closing || session.state === "failed"} onClick={() => login()}>Iniciar sesión</button>}
    {session.state === "failed" && <p role="alert">{sessionCloseCopy.es.failed} <button onClick={() => void session.close()}>{sessionCloseCopy.es.retry}</button></p>}
    {error && <p role="alert">No pudimos autorizar esta sesión. Usa una cuenta administradora e inténtalo de nuevo.</p>}
  </div>;
}
