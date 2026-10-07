"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../language-toggle";
import { registryNetworkRows, type RegistryResult } from "./registry-wallet-model";
import { readWorkspaceQuery } from "./workspace-queries";
import { workspaceCopy } from "./workspace-copy";

export default function RegistryWalletPanel({ locale, getAccessToken, onQueryBalances }: {
  locale: Locale; getAccessToken: () => Promise<string | null>; onQueryBalances: () => void;
}) {
  const t = workspaceCopy[locale];
  const [state, setState] = useState<{ rows: ReturnType<typeof registryNetworkRows>; status: "loading" | "ready" | "error" }>({ rows: [], status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await readWorkspaceQuery<RegistryResult>("personal.wallets", getAccessToken, locale, controller.signal);
        controller.signal.throwIfAborted();
        setState({ rows: registryNetworkRows(result), status: "ready" });
      } catch {
        if (!controller.signal.aborted) setState({ rows: [], status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [getAccessToken, locale, attempt]);
  return <section className="registry-wallets">
    <p>{t.registryNote}</p>
    {state.status === "loading" && <p role="status">{t.registryLoading}</p>}
    {state.status === "error" && <div role="alert"><p>{t.failed}</p><button type="button" onClick={() => { setState({ rows: [], status: "loading" }); setAttempt(value => value + 1); }}>{t.retry}</button></div>}
    <div className="registry-network-list">
      {state.rows.map(row => <article key={row.network}>
        <h3>{row.name}</h3>
        <dl><div><dt>{t.status}</dt><dd>{row.registrationState === "registered" ? t.registered : row.registrationState === null ? t.pending : t.unavailable}</dd></div>
          <div><dt>{t.address}</dt><dd><code>{row.address ?? "—"}</code></dd></div></dl>
        {row.explorerUrl && <a href={row.explorerUrl} target="_blank" rel="noreferrer">{t.explorer}</a>}
      </article>)}
    </div>
    {state.status === "ready" && <><p>{t.exampleNote}</p><button type="button" className="workspace-button" onClick={onQueryBalances}>{t.balance}</button></>}
  </section>;
}
