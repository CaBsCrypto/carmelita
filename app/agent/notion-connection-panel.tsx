"use client";
import { useEffect, useRef, useState } from "react";

type Props = { locale: "es" | "en" | "pt"; userId: string; getAccessToken: () => Promise<string | null> };
const copy = {
  es: { title: "Notion", connect: "Conectar Notion", disconnect: "Desconectar de Carmelita", refresh: "Revisar estado", active: "Autorizaci\u00f3n guardada; comprueba una b\u00fasqueda en el chat.", connecting: "Autorizaci\u00f3n pendiente; puedes volver a conectar.", off: "Sin conexi\u00f3n", error: "No pudimos comprobar la conexi\u00f3n. Int\u00e9ntalo de nuevo.", note: "Desconectar elimina el acceso guardado en Carmelita. Para revocar tambi\u00e9n el permiso en Notion, hazlo desde sus conexiones.", working: "Procesando..." },
  en: { title: "Notion", connect: "Connect Notion", disconnect: "Disconnect from Carmelita", refresh: "Check status", active: "Authorization saved; verify a search in chat.", connecting: "Authorization pending; you can connect again.", off: "Not connected", error: "We could not verify the connection. Please retry.", note: "Disconnect removes access stored in Carmelita. To revoke the permission in Notion too, use its connections settings.", working: "Working..." },
  pt: { title: "Notion", connect: "Conectar Notion", disconnect: "Desconectar da Carmelita", refresh: "Verificar estado", active: "Autoriza\u00e7\u00e3o salva; verifique uma pesquisa no chat.", connecting: "Autoriza\u00e7\u00e3o pendente; voc\u00ea pode conectar novamente.", off: "Sem conex\u00e3o", error: "N\u00e3o foi poss\u00edvel verificar a conex\u00e3o. Tente novamente.", note: "Desconectar remove o acesso salvo na Carmelita. Para revogar tamb\u00e9m a permiss\u00e3o no Notion, use as configura\u00e7\u00f5es de conex\u00f5es dele.", working: "Processando..." },
};
export function NotionConnectionPanel({ locale, userId, getAccessToken }: Props) {
  const t = copy[locale];
  const [view, setView] = useState({ owner: userId, status: "loading", busy: false, error: false });
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const version = ++generation.current;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (abort.signal.aborted) return;
        if (!token) throw new Error("unauthorized");
        const response = await fetch("/api/connections", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("connections_unavailable");
        const body = await response.json();
        if (version === generation.current && !abort.signal.aborted) setView({ owner: userId, status: body.connections?.find((item: { provider: string }) => item.provider === "notion")?.status ?? "disconnected", busy: false, error: false });
      } catch { if (!abort.signal.aborted && version === generation.current) setView({ owner: userId, status: "error", busy: false, error: true }); }
    })();
    return () => {
      abort.abort();
      // This ref intentionally tracks the newest request, not a DOM node.
      controller.current?.abort();
      generation.current = version + 1;
    };
  }, [userId, getAccessToken]);
  async function act(action: "start" | "disconnect" | "status") {
    if (view.busy || view.owner !== userId) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const version = ++generation.current;
    setView(current => ({ ...current, busy: true, error: false }));
    try {
      const token = await getAccessToken();
      if (abort.signal.aborted) return;
      if (!token) throw new Error("unauthorized");
      const response = await fetch(action === "status" ? "/api/connections" : `/api/connections/notion/${action}`, { method: action === "status" ? "GET" : "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("connection_failed");
      const body = await response.json();
      if (version !== generation.current || abort.signal.aborted) return;
      if (action === "start") {
        const destination = new URL(body.authorizationUrl);
        if (destination.protocol !== "https:" || !(destination.hostname === "notion.com" || destination.hostname.endsWith(".notion.com")) || destination.username || destination.password) throw new Error("invalid_authorization_url");
        window.location.assign(destination.href);
      } else setView({ owner: userId, status: action === "disconnect" ? "disconnected" : body.connections?.find((item: { provider: string }) => item.provider === "notion")?.status ?? "disconnected", busy: false, error: false });
    } catch { if (!abort.signal.aborted && version === generation.current) setView(current => ({ ...current, busy: false, error: true })); }
  }
  const current = view.owner === userId ? view : { status: "loading", busy: true, error: false };
  return <section aria-label={t.title}>
    <h3>{t.title}</h3>
    <p role="status">{current.error ? t.error : current.status === "active" ? t.active : current.status === "connecting" ? t.connecting : current.status === "loading" ? t.working : t.off}</p>
    <div>
      <button type="button" disabled={current.busy} onClick={() => void act("start")}>{t.connect}</button>{" "}
      <button type="button" disabled={current.busy} onClick={() => void act("status")}>{t.refresh}</button>{" "}
      {current.status !== "disconnected" && current.status !== "loading" && <button type="button" disabled={current.busy} onClick={() => void act("disconnect")}>{t.disconnect}</button>}
    </div>
    <p>{t.note}</p>
  </section>;
}
