export type ReceiptAcceptanceStatus = "PASS" | "FAIL" | "PENDING";
export type ReceiptAcceptanceTarget = { commit: string; deployment: string; databaseFingerprint: string };
export type ReceiptAcceptanceCheck = {
  name: string; status: ReceiptAcceptanceStatus; detail: string; http?: number;
  date: string; commit: string | null; deployment: string | null;
};
export type ReceiptAcceptanceReport = {
  date: string; mode: "receipts"; status: ReceiptAcceptanceStatus; paymentId?: string;
  target?: ReceiptAcceptanceTarget; checks: ReceiptAcceptanceCheck[];
  ownershipValidation: "external_required";
};

type Options = {
  paymentId: string;
  session: { ready: boolean; authenticated: boolean; userId: string | null };
  getAccessToken: () => Promise<string | null>;
  signal: AbortSignal;
  isCurrent: () => boolean;
  fetcher?: typeof fetch;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class ReceiptAcceptanceFailure extends Error {}

// A late response from an earlier account, input or run must never become evidence.
export function createReceiptAcceptanceController() {
  let revision = 0;
  let active: AbortController | null = null;
  return {
    begin() {
      active?.abort();
      const controller = new AbortController();
      const current = ++revision;
      active = controller;
      return { signal: controller.signal, isCurrent: () => current === revision && !controller.signal.aborted };
    },
    cancel() { revision++; active?.abort(); active = null; },
  };
}

function reportStatus(checks: ReceiptAcceptanceCheck[]): ReceiptAcceptanceStatus {
  if (checks.some((check) => check.status === "FAIL")) return "FAIL";
  return checks.length > 0 && checks.every((check) => check.status === "PASS") ? "PASS" : "PENDING";
}

function targetFromHealth(value: unknown): ReceiptAcceptanceTarget {
  const health = value as { status?: unknown; deployment?: { environment?: unknown; gitCommitSha?: unknown; url?: unknown }; previewIsolation?: { verified?: unknown; databaseFingerprint?: unknown } } | null;
  const commit = health?.deployment?.gitCommitSha;
  const deployment = health?.deployment?.url;
  const databaseFingerprint = health?.previewIsolation?.databaseFingerprint;
  if (health?.status !== "ok" || health.deployment?.environment !== "preview" || health.previewIsolation?.verified !== true
    || typeof commit !== "string" || !/^[a-f0-9]{40}$/i.test(commit)
    || typeof databaseFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(databaseFingerprint)
    || typeof deployment !== "string") throw new ReceiptAcceptanceFailure("No se pudo verificar la Preview aislada y su versión.");
  let url: URL;
  try { url = new URL(deployment); }
  catch { throw new ReceiptAcceptanceFailure("El despliegue de Preview no es válido."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ReceiptAcceptanceFailure("El despliegue de Preview no es válido.");
  return { commit, deployment: url.origin, databaseFingerprint };
}

export async function runReceiptAcceptance(options: Options): Promise<ReceiptAcceptanceReport> {
  const { signal, fetcher = fetch } = options;
  const checks: ReceiptAcceptanceCheck[] = [];
  let target: ReceiptAcceptanceTarget | undefined;
  const paymentId = UUID.test(options.paymentId.trim()) ? options.paymentId.trim().toLowerCase() : undefined;
  let token: string | null = null;
  const current = () => {
    signal.throwIfAborted();
    if (!options.isCurrent()) throw new DOMException("La sesión cambió.", "AbortError");
  };
  const add = (name: string, status: ReceiptAcceptanceStatus, detail: string, http?: number) => {
    current();
    checks.push({ name, status, detail, ...(http === undefined ? {} : { http }), date: new Date().toISOString(), commit: target?.commit ?? null, deployment: target?.deployment ?? null });
  };
  const report = (): ReceiptAcceptanceReport => ({ date: new Date().toISOString(), mode: "receipts", status: reportStatus(checks), paymentId, target, checks, ownershipValidation: "external_required" });
  const pendingReceipts = () => {
    add("GET de recibo ajeno", "PENDING", "No se consultó el recibo porque falta una condición previa.");
    add("POST de reconciliación ajena", "PENDING", "No se solicitó reconciliación porque falta una condición previa.");
  };
  async function check(name: string, operation: () => Promise<{ detail: string; http?: number }>) {
    try {
      current();
      const result = await operation();
      add(name, "PASS", result.detail, result.http);
      return true;
    } catch (error) {
      current();
      add(name, "FAIL", error instanceof ReceiptAcceptanceFailure ? error.message : "No se pudo completar la comprobación. No se aceptó como evidencia.");
      return false;
    }
  }
  async function health() {
    current();
    const response = await fetcher("/api/health", { cache: "no-store", redirect: "error", signal });
    current();
    if (response.status !== 200 || response.redirected) throw new ReceiptAcceptanceFailure("No se pudo verificar la Preview aislada y su versión.");
    const body: unknown = await response.json();
    current();
    return targetFromHealth(body);
  }

  current();
  if (!paymentId) {
    add("Identificador del pago", "FAIL", "Indica el UUID de un pago real de la otra cuenta, verificado por separado.");
    pendingReceipts();
    return report();
  }
  if (!options.session.ready || !options.session.authenticated || !/^did:privy:[^\s]+$/.test(options.session.userId ?? "")) {
    add("Sesión Privy", "FAIL", "Inicia sesión con la cuenta de prueba antes de comprobar el aislamiento.");
    pendingReceipts();
    return report();
  }
  if (!await check("Preview aislada y versión", async () => {
    target = await health();
    return { detail: "Preview aislada verificada; versión y despliegue incluidos en cada comprobación.", http: 200 };
  })) {
    pendingReceipts();
    return report();
  }
  add("Identificador del pago", "PASS", "UUID válido. Su existencia y pertenencia a otra cuenta requieren evidencia independiente.");
  if (!await check("Sesión Privy", async () => {
    token = await options.getAccessToken();
    current();
    if (!token?.trim()) throw new ReceiptAcceptanceFailure("La sesión terminó. Inicia sesión antes de comprobar el aislamiento.");
    return { detail: "Autorización obtenida de la sesión activa de Carmelita; no se incluye en el reporte." };
  })) {
    pendingReceipts();
    return report();
  }

  async function rejectReceipt(method: "GET" | "POST") {
    current();
    const response = await fetcher(method === "GET" ? `/api/agent/x402?paymentId=${encodeURIComponent(paymentId!)}` : "/api/agent/x402", {
      method, cache: "no-store", redirect: "error", signal, credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify({ action: "reconcile", paymentId }) } : {}),
    });
    current();
    // Never parse, retain or display the response, including an accidentally disclosed receipt.
    await response.body?.cancel().catch(() => undefined);
    current();
    const accepted = response.status === 404 && !response.redirected;
    add(method === "GET" ? "GET de recibo ajeno" : "POST de reconciliación ajena", accepted ? "PASS" : "FAIL",
      accepted ? "Acceso rechazado con HTTP 404. El contenido de la respuesta no se leyó."
        : `Se esperaba HTTP 404 sin redirección; se recibió HTTP ${response.status}. El resultado no acredita aislamiento.`, response.status);
    return accepted;
  }
  try {
    if (!await rejectReceipt("GET")) {
      add("POST de reconciliación ajena", "PENDING", "No se solicitó reconciliación porque la lectura no fue rechazada como se esperaba.");
      return report();
    }
  } catch {
    current();
    add("GET de recibo ajeno", "FAIL", "La consulta no se completó. No se leyó ni conservó contenido del recibo.");
    add("POST de reconciliación ajena", "PENDING", "No se solicitó reconciliación porque la lectura no fue rechazada como se esperaba.");
    return report();
  }
  try { await rejectReceipt("POST"); }
  catch {
    current();
    add("POST de reconciliación ajena", "FAIL", "La solicitud no se completó. No se aceptó como evidencia de aislamiento.");
  }
  await check("Preview estable durante la comprobación", async () => {
    const finalTarget = await health();
    if (JSON.stringify(finalTarget) !== JSON.stringify(target)) throw new ReceiptAcceptanceFailure("Cambió la versión, el despliegue o la base durante la comprobación. Repite la prueba.");
    return { detail: "La versión, el despliegue y la base aislada coinciden antes y después de las solicitudes.", http: 200 };
  });
  current();
  return report();
}
