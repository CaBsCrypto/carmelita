"use client";

import { useEffect, useState } from "react";
import { createReceiptAcceptanceController, runReceiptAcceptance, type ReceiptAcceptanceReport } from "./receipt-checks";

export default function ReceiptAcceptancePanel({ ready, authenticated, userId, getAccessToken }: { ready: boolean; authenticated: boolean; userId: string; getAccessToken: () => Promise<string | null> }) {
  const [paymentId, setPaymentId] = useState("");
  const [report, setReport] = useState<ReceiptAcceptanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests] = useState(createReceiptAcceptanceController);
  useEffect(() => () => requests.cancel(), [requests, ready, authenticated, userId]);

  function cancel() {
    requests.cancel();
    setBusy(false);
    setReport(null);
    setError(null);
  }
  async function run() {
    const request = requests.begin();
    setBusy(true);
    setReport(null);
    setError(null);
    try {
      const result = await runReceiptAcceptance({ paymentId, session: { ready, authenticated, userId }, getAccessToken, ...request });
      if (request.isCurrent()) setReport(result);
    } catch {
      if (request.isCurrent()) setError("No se completó la comprobación. Vuelve a verificar la sesión y la Preview.");
    } finally { if (request.isCurrent()) setBusy(false); }
  }

  return <section aria-label="Aceptación de aislamiento de recibos" style={{ marginTop: 24 }}>
    <h2>Aislamiento de recibos Stellar</h2>
    <p>Usa el UUID de un pago real de la otra cuenta de prueba. Su existencia y propietario deben verificarse por separado: un identificador inexistente también puede responder 404.</p>
    <p>Esta comprobación consulta ese recibo y solicita reconciliación con tu sesión actual. Solo acepta HTTP 404 en ambas operaciones. No prepara pagos, firma, solicita fondos ni ejecuta cobros.</p>
    <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <p><label>UUID del pago de la otra cuenta <input autoComplete="off" spellCheck={false} value={paymentId} onChange={(event) => { cancel(); setPaymentId(event.target.value); }} /></label></p>
      <button disabled={busy} type="submit">{busy ? "Comprobando…" : "Verificar aislamiento del recibo"}</button>
      {busy && <button type="button" onClick={cancel}>Cancelar comprobación</button>}
    </form>
    <p>PASS: rechazo comprobado · FAIL: comprobación fallida · PENDING: comprobación pendiente. El reporte no contiene tokens, identidades ni cuerpos de recibos. Cambiar de cuenta, modo o identificador cancela la ejecución anterior.</p>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <h3>Resultado del rechazo: {report.status}</h3>
      <p>La aceptación entre dos usuarios también requiere vincular este UUID con el pago real de la otra cuenta mediante evidencia independiente.</p>
      <ol>{report.checks.map((check) => <li key={check.name}><strong>{check.status} · {check.name}</strong><p>{check.detail}</p></li>)}</ol>
      <details><summary>Evidencia de esta ejecución</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(report, null, 2)}</pre></details>
    </>}
  </section>;
}
