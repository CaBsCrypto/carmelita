"use client";
import { useEffect, useState } from "react";
import type { Locale } from "../language-toggle";
import type { WalletRow, WalletNetworkView } from "./wallet-readings";
import { registryNetworkRows } from "./registry-wallet-model";
import { workspaceCopy } from "./workspace-copy";
import { sessionAbortable } from "./session-request";

export default function RegistryWalletPanel({ locale, getAccessToken, onQueryBalances }: { locale: Locale; getAccessToken: () => Promise<string | null>; onQueryBalances: () => void }) {
  const t = workspaceCopy[locale];
  const [state, setState] = useState<{ rows: ReturnType<typeof registryNetworkRows>; status: "loading" | "ready" | "error" }>({rows: [], status: "loading"});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    async function load() {
      try {
        const token = await sessionAbortable(getAccessToken, signal);
        if (!token) throw new Error("authentication_required");
        const response = await fetch("/api/agent/wallets", {headers: {Authorization: "Bearer " + token}, cache: "no-store", signal});
        if (!response.ok) throw new Error("registry_unavailable");
        const body = await sessionAbortable(() => response.json(), signal) as {wallets: WalletRow[]; networks: WalletNetworkView[]};
        signal.throwIfAborted();
        setState({rows: registryNetworkRows(body.wallets, body.networks), status: "ready"});
      } catch {
        if (!controller.signal.aborted) setState({rows: [], status: "error"});
      }
    }
    void load();
    return () => controller.abort();
  }, [getAccessToken, attempt]);
  const loading = {es: "Consultando el registro…", en: "Querying the registry…", pt: "Consultando o registro…"}[locale];
  const pending = {es: "Pendiente", en: "Pending", pt: "Pendente"}[locale];
  return <section className="registry-wallets">
    <p>{t.registryNote}</p>
    {state.status === "loading" && <p role="status">{loading}</p>}
    {state.status === "error" && <div role="alert"><p>{t.failed}</p><button onClick={() => {setState({rows: [], status: "loading"}); setAttempt(value => value + 1);}}>{t.retry}</button></div>}
    <div className="registry-network-list">
      {state.rows.map(row => <article key={row.id}>
        <h3>{row.name}</h3>
        <dl><div><dt>{t.status}</dt><dd>{row.status === "active" ? t.registered : row.status === "pending" ? pending : row.status ?? t.pending}</dd></div>
          <div><dt>{t.address}</dt><dd><code>{row.address ?? "—"}</code></dd></div></dl>
        {row.explorerUrl && <a href={row.explorerUrl} target="_blank" rel="noreferrer">{t.explorer} ↗</a>}
      </article>)}
    </div>
    {state.status === "ready" && <><p>{t.exampleNote}</p><button className="workspace-button" onClick={onQueryBalances}>{t.balance}</button></>}
  </section>;
}
