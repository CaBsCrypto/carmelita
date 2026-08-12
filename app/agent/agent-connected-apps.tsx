"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../language-toggle";

type ConnectedApp = { id: string; name: string; description?: string; clientType: string; scopes: string[] };
const copy = {
  en: { eyebrow: "OAUTH CONNECTIONS", title: "Chats connected to Carmelita", empty: "No OAuth chats connected yet.", revoke: "Revoke access", confirm: "Revoke this chat's access? Its active and refresh tokens will stop working.", error: "Could not load connected chats." },
  es: { eyebrow: "CONEXIONES OAUTH", title: "Chats conectados a Carmelita", empty: "Todavia no hay chats OAuth conectados.", revoke: "Revocar acceso", confirm: "¿Revocar el acceso de este chat? Sus tokens activos y de renovacion dejaran de funcionar.", error: "No se pudieron cargar los chats conectados." },
  pt: { eyebrow: "CONEXOES OAUTH", title: "Chats conectados a Carmelita", empty: "Ainda nao ha chats OAuth conectados.", revoke: "Revogar acesso", confirm: "Revogar o acesso deste chat? Os tokens ativos e de atualizacao deixarao de funcionar.", error: "Nao foi possivel carregar os chats conectados." },
} satisfies Record<Locale, Record<string, string>>;

export default function AgentConnectedApps({ locale, getAccessToken }: { locale: Locale; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function call(init?: RequestInit) {
    const token = await getAccessToken();
    if (!token) throw new Error("privy_access_token_unavailable");
    return fetch("/api/agent/connected-apps", { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  }
  async function load() {
    try {
      const response = await call();
      if (response.status === 404) { setAvailable(false); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setApps(Array.isArray(body.connectedApps) ? body.connectedApps : []);
      setAvailable(true); setError(null);
    } catch { setAvailable(true); setError(t.error); }
  }
  useEffect(() => { const task = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(task); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function revoke(app: ConnectedApp) {
    if (!window.confirm(t.confirm)) return;
    setBusyId(app.id); setError(null);
    try {
      const response = await call({ method: "DELETE", body: JSON.stringify({ connectedAppId: app.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
    } catch { setError(t.error); } finally { setBusyId(null); }
  }
  if (available !== true) return null;
  return <section className="oauth-connected-apps"><header><p className="eyebrow">{t.eyebrow}</p><h3>{t.title}</h3></header>{apps.length === 0 ? <p>{t.empty}</p> : <div className="oauth-connected-app-list">{apps.map((app) => <article key={app.id}><div><strong>{app.name}</strong>{app.description && <p>{app.description}</p>}<small>{app.scopes.join(" · ")}</small></div><button type="button" disabled={busyId === app.id} onClick={() => void revoke(app)}>{t.revoke}</button></article>)}</div>}{error && <p className="agent-external-error">{error}</p>}</section>;
}