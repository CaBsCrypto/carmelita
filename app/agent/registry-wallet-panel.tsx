"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "../language-toggle";
import { registryNetworkRows, type RegistryResult } from "./registry-wallet-model";
import { readWorkspaceQuery } from "./workspace-queries";
import { workspaceCopy } from "./workspace-copy";
import type { TempoWalletReading } from "../wallets/types";
import { sessionAbortable, withSessionDeadline } from "./session-request";

const tempoLoadingText = { en: "Reading Tempo…", es: "Consultando Tempo…", pt: "Consultando Tempo…" };
const tempoReconfirmationText = { en: "Confirm existing association", es: "Confirmar asociación existente", pt: "Confirmar associação existente" };

const tempoCopy = {
  en: { register: "Connect Tempo Testnet", registering: "Connecting…", note: "Reuse your existing EVM wallet on Moderato. This checks the network and registers the address; no funds move.", required: "An existing EVM wallet belonging to this account is required to connect Tempo.", failed: "Tempo is unavailable. Retry the connection or balance query.", block: "Block", time: "Read at", zero: "A zero balance does not imply previous activity. Test tokens have no real value." },
  es: { register: "Conectar Tempo Testnet", registering: "Conectando…", note: "Reutiliza tu wallet EVM en Moderato. Se comprueba la red y se registra la dirección; no se mueven fondos.", required: "Para conectar Tempo necesitas una wallet EVM existente que pertenezca a esta cuenta.", failed: "Tempo no está disponible. Reintenta la conexión o consulta de saldo.", block: "Bloque", time: "Consultado", zero: "Un saldo cero no implica actividad previa. Los tokens de prueba no tienen valor real." },
  pt: { register: "Conectar Tempo Testnet", registering: "Conectando…", note: "Reutilize sua wallet EVM no Moderato. A rede é verificada e o endereço registrado; nenhum saldo é transferido.", required: "Para conectar Tempo, é necessária uma wallet EVM existente que pertença a esta conta.", failed: "Tempo indisponível. Tente a conexão ou consulta de saldo novamente.", block: "Bloco", time: "Consultado", zero: "Saldo zero não implica atividade anterior. Tokens de teste não têm valor real." },
};

export default function RegistryWalletPanel({ locale, getAccessToken, onQueryBalances, allowTempoReconfirmation = false }: {
  locale: Locale; getAccessToken: () => Promise<string | null>; onQueryBalances?: () => void; allowTempoReconfirmation?: boolean;
}) {
  const t = workspaceCopy[locale];
  const tempoText = tempoCopy[locale];
  const [state, setState] = useState<{ rows: ReturnType<typeof registryNetworkRows>; status: "loading" | "ready" | "error" }>({ rows: [], status: "loading" });
  const [tempo, setTempo] = useState<TempoWalletReading | null>(null);
  const [tempoLoading, setTempoLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const connectionRequest = useRef<AbortController | null>(null);
  const readRequest = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Abort at the owner-switch commit, before a late SDK token can start a request.
  useLayoutEffect(() => () => {
    connectionRequest.current?.abort();
    readRequest.current?.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    readRequest.current = controller;
    async function load() {
      try {
        const result = await readWorkspaceQuery<RegistryResult>("personal.wallets", getAccessToken, locale, controller.signal);
        controller.signal.throwIfAborted();
        const rows = registryNetworkRows(result);
        setState({ rows, status: "ready" });
        setTempo(null);
        const tempoRow = rows.find(row => row.network === "tempo:moderato" && row.address);
        if (tempoRow?.address) {
          setTempoLoading(true);
          try {
            const reading = await withSessionDeadline(controller.signal, 12_000, async signal => {
              const token = await sessionAbortable(getAccessToken, signal);
              if (!token) throw new Error("authentication_required");
              const response = await sessionAbortable(() => fetch("/api/agent/wallets/tempo", {
                cache: "no-store", signal, headers: { Authorization: `Bearer ${token}` },
              }), signal);
              const body = await sessionAbortable(() => response.json(), signal) as TempoWalletReading;
              if (body.network !== "tempo:moderato" || body.address?.toLowerCase() !== tempoRow.address?.toLowerCase()
                || body.testnet !== true || (body.status === "available" && body.chainId !== 42431)) {
                throw new Error("wallet_response_mismatch");
              }
              return body;
            });
            controller.signal.throwIfAborted();
            setTempo(reading);
          } catch {
            if (!controller.signal.aborted) setTempo(null);
          } finally {
            if (!controller.signal.aborted) setTempoLoading(false);
          }
        }
      } catch {
        if (!controller.signal.aborted) setState({ rows: [], status: "error" });
      }
    }
    void load();
    return () => { controller.abort(); if (readRequest.current === controller) readRequest.current = null; };
  }, [getAccessToken, locale, attempt]);

  async function connectTempo() {
    connectionRequest.current?.abort();
    const controller = new AbortController();
    connectionRequest.current = controller;
    setConnecting(true);
    setConnectionError(false);
    try {
      await withSessionDeadline(controller.signal, 12_000, async signal => {
        const token = await sessionAbortable(getAccessToken, signal);
        if (!token) throw new Error("authentication_required");
        const response = await sessionAbortable(() => fetch("/api/agent/wallets", {
          method: "POST", cache: "no-store", signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ network: "tempo:moderato", explicitUserConfirmation: true }),
        }), signal);
        if (!response.ok) throw new Error("tempo_connection_failed");
      });
      controller.signal.throwIfAborted();
      setTempo(null);
      setState({ rows: [], status: "loading" });
      setAttempt(value => value + 1);
    } catch {
      if (!controller.signal.aborted) setConnectionError(true);
    } finally {
      if (!controller.signal.aborted) setConnecting(false);
    }
  }
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
        {row.network === "tempo:moderato" && <>
          {row.address ? tempoLoading ? <p role="status">{tempoLoadingText[locale]}</p> : tempo?.status === "available" ? <>
            <p>{tempo.token.balance} {tempo.token.symbol} · Testnet · {tempo.chainId}</p>
            <p>{tempoText.block}: {tempo.block.number} · {tempoText.time}: <time dateTime={tempo.queriedAt}>{tempo.queriedAt}</time></p>
            <p>{tempoText.zero}</p>
          </> : <p role="status">{tempo?.status === "unavailable" || tempo?.status === "wrong_network" || tempo?.status === "misconfigured" || tempo?.status === "disabled" ? tempo.error.message : tempoText.failed}</p> : <>
            <p>{tempoText.note}</p>
            {state.rows.some(item => item.family === "evm" && item.address) ? <button type="button" disabled={connecting} onClick={() => void connectTempo()}>{connecting ? tempoText.registering : tempoText.register}</button> : <p>{tempoText.required}</p>}
            {connectionError && <p role="alert">{tempoText.failed}</p>}
          </>}
          {row.address && allowTempoReconfirmation && <>
            <button type="button" disabled={connecting} onClick={() => void connectTempo()}>{connecting ? tempoText.registering : tempoReconfirmationText[locale]}</button>
            {connectionError && <p role="alert">{tempoText.failed}</p>}
          </>}
        </>}
      </article>)}
    </div>
    {state.status === "ready" && onQueryBalances && <><p>{t.exampleNote}</p><button type="button" className="workspace-button" onClick={onQueryBalances}>{t.balance}</button></>}
  </section>;
}
