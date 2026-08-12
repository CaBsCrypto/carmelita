"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import styles from "./consent.module.css";

type Preflight = {
  client: { clientId: string; clientName: string; clientDescription?: string };
  requestedScopes: string[];
  consentRequired: boolean;
};

const scopeLabels: Record<string, string> = {
  openid: "Identify your Carmelita account",
  email: "Use your verified email to link the account",
  profile: "Read your basic Carmelita profile",
  offline_access: "Stay connected until you revoke access",
  "agent:read": "Read available agent capabilities",
  "agent:plan": "Create plans and previews",
  "agent:context": "Use approved personal context",
  "agent:conversation": "Continue your Carmelita conversations",
};

export default function ConsentClient() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || preflight || attempted.current) return;
    let active = true;
    attempted.current = true;
    setBusy(true);
    getAccessToken()
      .then(async (token) => {
        if (!token) throw new Error("Privy session is unavailable.");
        const response = await fetch("/api/oauth/stytch/preflight", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: window.location.search }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to inspect this connection.");
        if (active) setPreflight(body);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Connection failed."))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [authenticated, getAccessToken, preflight, ready]);

  async function decide(consentGranted: boolean) {
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Privy session is unavailable.");
      const response = await fetch("/api/oauth/stytch/authorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: window.location.search, consentGranted }),
      });
      const body = await response.json();
      if (!response.ok || typeof body.redirectUri !== "string") {
        throw new Error(body.error || "Authorization could not be completed.");
      }
      window.location.assign(body.redirectUri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="oauth-title">
        <div className={styles.brand}><span aria-hidden="true">C</span> Carmelita</div>
        <p className={styles.eyebrow}>SECURE CONNECTION</p>
        <h1 id="oauth-title">
          {preflight ? `${preflight.client.clientName} wants to work with Carmelita` : "Connect Carmelita to your AI chat"}
        </h1>
        <p className={styles.lede}>
          Sign in with your existing Privy account, review exactly what the chat can do, and revoke it later.
          Wallet signing and moving funds always require a separate approval.
        </p>

        {!ready && <p className={styles.status}>Loading secure sign-in…</p>}
        {ready && !authenticated && (
          <button className={styles.primary} onClick={login}>Continue with Privy</button>
        )}
        {authenticated && busy && !preflight && <p className={styles.status}>Checking the requested permissions…</p>}

        {preflight && (
          <>
            {preflight.client.clientDescription && <p className={styles.description}>{preflight.client.clientDescription}</p>}
            <div className={styles.permissions}>
              <h2>This chat is requesting</h2>
              <ul>
                {preflight.requestedScopes.map((scope) => (
                  <li key={scope}><span aria-hidden="true">✓</span>{scopeLabels[scope] || `Permission: ${scope}`}</li>
                ))}
              </ul>
            </div>
            <div className={styles.warning}>
              <strong>No silent transactions.</strong> Connecting allows discovery and planning only. A wallet action still follows your Carmelita spending policy and explicit approval.
            </div>
            <div className={styles.actions}>
              <button className={styles.secondary} disabled={busy} onClick={() => decide(false)}>Deny</button>
              <button className={styles.primary} disabled={busy} onClick={() => decide(true)}>{busy ? "Connecting…" : "Allow connection"}</button>
            </div>
          </>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.footer}>OAuth 2.1 + PKCE · Identity by Privy · Authorization by Stytch</p>
      </section>
    </main>
  );
}
