"use client";

import { useEffect, useRef, useState } from "react";
import { compareWalletReference, runWalletAcceptance, walletReferenceKey, walletReportStatus, type WalletAcceptanceReference, type WalletAcceptanceReport, type WalletCheck } from "./wallet-checks";

export default function WalletAcceptancePanel({ userId, getAccessToken }: { userId: string; getAccessToken: () => Promise<string | null> }) {
  const [report, setReport] = useState<WalletAcceptanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [page] = useState(() => crypto.randomUUID());
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [userId]);

  async function run(bootstrap: boolean) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setReport(null);
    try {
      const token = await getAccessToken();
      controller.signal.throwIfAborted();
      if (!token) throw new Error("La sesión terminó. Inicia sesión antes de comprobar las billeteras.");
      const result = await runWalletAcceptance({ token, userId, signal: controller.signal, bootstrap });
      if (result.target && result.snapshot) {
        const key = walletReferenceKey(userId, result.target);
        let persistence: WalletCheck;
        try {
          const saved = sessionStorage.getItem(key);
          const previous = saved ? JSON.parse(saved) as WalletAcceptanceReference : null;
          if (!previous) {
            sessionStorage.setItem(key, JSON.stringify({ snapshot: result.snapshot, page, date: result.date } satisfies WalletAcceptanceReference));
            persistence = { name: "Identidades estables tras recargar", status: "PENDING", detail: "Referencia guardada para esta cuenta y versión. Recarga esta página y repite las lecturas." };
          } else persistence = compareWalletReference(previous, result.snapshot, page);
        } catch {
          persistence = { name: "Identidades estables tras recargar", status: "PENDING", detail: "No fue posible conservar o leer la referencia de esta sesión. La persistencia tras recarga queda pendiente." };
        }
        result.checks.push(persistence);
      }
      controller.signal.throwIfAborted();
      setReport({ ...result, snapshot: undefined, status: walletReportStatus(result.checks) });
    } catch (error) {
      if (!controller.signal.aborted) setReport({ date: new Date().toISOString(), mode: "wallets", operation: bootstrap ? "bootstrap" : "read", status: "FAIL", checks: [{ name: "Comprobación", status: "FAIL", detail: error instanceof Error ? error.message : "No se completó la comprobación." }] });
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <section aria-label="Aceptación de billeteras multichain" style={{ marginTop: 24 }}>
    <h2>Billeteras multichain: misma dirección EVM</h2>
    <p>Usa una cuenta de prueba sin permisos de administrador. Comprobaremos Stellar, Solana y las redes EVM habilitadas. BNB Testnet y Base Sepolia deben compartir la billetera de Avalanche Fuji.</p>
    <p><strong>Leer y verificar</strong> consulta asociaciones y saldos, prueba el rechazo de parámetros ajenos y verifica que esta cuenta no pueda abrir una sesión administrativa. No ejecuta los fixtures de chat o memoria.</p>
    <p><strong>Preparar billeteras</strong> solicita el bootstrap únicamente al pulsar su botón. Puede crear billeteras y asociaciones faltantes; no solicita fondos, trustlines, firmas ni pagos.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <button disabled={busy} onClick={() => void run(false)}>{busy ? "Comprobando…" : "Leer y verificar billeteras"}</button>
      <button disabled={busy} onClick={() => void run(true)}>Preparar billeteras sin fondos</button>
      <button disabled={busy} onClick={() => window.location.reload()}>Recargar página para verificar persistencia</button>
    </div>
    <p>PASS: aprobado · FAIL: fallido · PENDING: pendiente. Una lectura RPC fallida no cuenta como saldo cero. La primera ejecución guarda una referencia local por cuenta, versión y despliegue; recarga y repite para comprobar estabilidad.</p>
    {report && <>
      <h3>Resultado: {report.status}</h3>
      <ol>{report.checks.map((check) => <li key={check.name}><strong>{check.status} · {check.name}</strong><p>{check.detail}</p></li>)}</ol>
      <details><summary>Evidencia de esta ejecución</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(report, null, 2)}</pre></details>
    </>}
  </section>;
}
