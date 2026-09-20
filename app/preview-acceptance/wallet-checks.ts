import { readingMatchesWallet, type WalletReading, type WalletRow } from "@/app/agent/wallet-readings";

export type WalletCheck = { name: string; status: "PASS" | "FAIL" | "PENDING"; detail: string; http?: number };
export type WalletAcceptanceTarget = { commit: string; deployment: string; databaseFingerprint: string };
export type WalletAcceptanceSnapshot = { id: string; address: string; chainType: string; network: string }[];
export type WalletAcceptanceReference = { snapshot: WalletAcceptanceSnapshot; page: string; date: string };
export type WalletAcceptanceReport = {
  date: string; mode: "wallets"; operation: "read" | "bootstrap";
  target?: WalletAcceptanceTarget; checks: WalletCheck[]; status: "PASS" | "FAIL" | "PENDING";
  snapshot?: WalletAcceptanceSnapshot;
};
class WalletAcceptanceFailure extends Error {}
type WalletList = { wallets: WalletRow[]; networks: { id: string; family: string; rollout: string }[] };
type Options = { token: string; userId: string; signal: AbortSignal; fetcher?: typeof fetch };
const BASIC = ["stellar:testnet", "avalanche:fuji", "solana:devnet"];
const EXPANSION = ["bnb:testnet", "base:sepolia"];

export function walletAcceptanceSnapshot(wallets: WalletRow[]): WalletAcceptanceSnapshot {
  return wallets.map(({ id, address, chainType, network }) => ({ id, address: chainType === "ethereum" ? address.toLowerCase() : address, chainType, network })).sort((a, b) => a.network.localeCompare(b.network));
}

export function inspectWalletAssociations(list: WalletList) {
  const enabled = list.networks.filter((network) => network.rollout !== "planned").map((network) => network.id);
  const expanded = EXPANSION.some((network) => enabled.includes(network));
  const expected = expanded ? [...BASIC, ...EXPANSION] : BASIC;
  if (JSON.stringify([...enabled].sort()) !== JSON.stringify([...expected].sort())) throw new WalletAcceptanceFailure("El catálogo de redes habilitadas es inconsistente.");
  if (list.wallets.length !== expected.length || expected.some((network) => list.wallets.filter((wallet) => wallet.network === network).length !== 1)) throw new WalletAcceptanceFailure("Faltan asociaciones de red o hay duplicados.");
  const evm = list.wallets.filter((wallet) => wallet.chainType === "ethereum");
  if (evm.length !== (expanded ? 3 : 1) || new Set(evm.map((wallet) => wallet.id)).size !== 1 || new Set(evm.map((wallet) => wallet.address.toLowerCase())).size !== 1) throw new WalletAcceptanceFailure("Las redes EVM no comparten una única billetera y dirección.");
  if (new Set(list.wallets.map((wallet) => wallet.id)).size !== 3) throw new WalletAcceptanceFailure("Se esperaban tres billeteras únicas.");
  for (const wallet of list.wallets) {
    const family = wallet.network === "stellar:testnet" ? "stellar" : wallet.network === "solana:devnet" ? "solana" : "ethereum";
    if (wallet.chainType !== family || (wallet.status !== "active" && !(family === "stellar" && wallet.status === "pending"))) throw new WalletAcceptanceFailure("Una asociación tiene una familia o un estado inesperado.");
  }
  return { expanded, expected, evm, snapshot: walletAcceptanceSnapshot(list.wallets) };
}

async function verifyTarget(fetcher: typeof fetch, signal: AbortSignal): Promise<WalletAcceptanceTarget> {
  const response = await fetcher("/api/health", { cache: "no-store", signal });
  const health = await response.json();
  if (!response.ok || health.deployment?.environment !== "preview" || health.previewIsolation?.verified !== true
    || !/^[a-f0-9]{40}$/i.test(health.deployment?.gitCommitSha ?? "") || !/^[a-f0-9]{64}$/i.test(health.previewIsolation?.databaseFingerprint ?? "")
    || !/^https:\/\//.test(health.deployment?.url ?? "")) throw new WalletAcceptanceFailure("No se pudo verificar la Preview aislada y su versión.");
  return { commit: health.deployment.gitCommitSha, deployment: health.deployment.url, databaseFingerprint: health.previewIsolation.databaseFingerprint };
}

export function walletReportStatus(checks: WalletCheck[]) {
  return checks.some((check) => check.status === "FAIL") ? "FAIL" : checks.some((check) => check.status === "PENDING") ? "PENDING" : "PASS";
}

export function walletReferenceKey(userId: string, target: WalletAcceptanceTarget) {
  return `carmelita-wallet-acceptance:${userId}:${target.commit}:${target.deployment}:${target.databaseFingerprint}`;
}

export function compareWalletReference(previous: WalletAcceptanceReference, snapshot: WalletAcceptanceSnapshot, page: string): WalletCheck {
  const name = "Identidades estables tras recargar";
  if (JSON.stringify(previous.snapshot) !== JSON.stringify(snapshot)) return { name, status: "FAIL", detail: "Los IDs, direcciones o asociaciones cambiaron respecto de la referencia de esta cuenta. La referencia no fue reemplazada." };
  return { name, status: previous.page === page ? "PENDING" : "PASS", detail: previous.page === page ? "Las identidades coinciden, pero falta recargar esta página y repetir las lecturas." : `Las tres billeteras y sus asociaciones coinciden con la referencia del ${previous.date}.` };
}

export async function runWalletAcceptance(options: Options & { bootstrap?: boolean }): Promise<WalletAcceptanceReport> {
  const { token, userId, signal, fetcher = fetch, bootstrap = false } = options;
  const checks: WalletCheck[] = [];
  let target: WalletAcceptanceTarget | undefined;
  let snapshot: WalletAcceptanceSnapshot | undefined;
  const request = (path: string, init?: RequestInit) => {
    signal.throwIfAborted();
    return fetcher(path, { ...init, cache: "no-store", signal, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
  };
  async function check(name: string, operation: () => Promise<{ detail: string; http?: number }>) {
    try { checks.push({ name, status: "PASS", ...await operation() }); }
    catch (error) {
      signal.throwIfAborted();
      checks.push({ name, status: "FAIL", detail: error instanceof WalletAcceptanceFailure ? error.message : "La comprobación no está disponible. Vuelve a intentarlo." });
    }
  }
  await check("Preview y versión verificadas", async () => {
    target = await verifyTarget(fetcher, signal);
    return { detail: "Entorno Preview y base aislada verificados; versión incluida en la evidencia." };
  });
  if (!target) {
    checks.push({ name: "Comprobaciones autenticadas", status: "PENDING", detail: "No se realizaron solicitudes autenticadas porque no se verificó el destino." });
    return { date: new Date().toISOString(), mode: "wallets", operation: bootstrap ? "bootstrap" : "read", checks, status: walletReportStatus(checks) };
  }
  if (bootstrap) {
    await check("Preparación de billeteras solicitada explícitamente", async () => {
      const response = await request("/api/agent/bootstrap", { method: "POST" });
      if (!response.ok) throw new WalletAcceptanceFailure(`No se pudo preparar las billeteras (HTTP ${response.status}).`);
      const body = await response.json();
      if (body.user?.id !== userId || body.wallets?.evm?.id !== body.wallets?.avalanche?.id || body.wallets?.evm?.address?.toLowerCase() !== body.wallets?.avalanche?.address?.toLowerCase()) throw new WalletAcceptanceFailure("La identidad de bootstrap no coincide con la sesión o con su alias Avalanche.");
      for (const group of [body.evm, body.avalanche, body.solana]) {
        if (group?.fundsMoved !== false || group?.signingRequired !== false) throw new WalletAcceptanceFailure("La respuesta de preparación no confirma el alcance sin fondos ni firma.");
      }
      return { detail: "Billeteras y asociaciones preparadas. La respuesta confirma que no hubo fondos ni firma.", http: response.status };
    });
  }
  let list: WalletList | undefined;
  await check("Tres billeteras únicas y redes esperadas", async () => {
    const response = await request("/api/agent/wallets");
    if (!response.ok) throw new WalletAcceptanceFailure(`No se pudo leer las billeteras (HTTP ${response.status}).`);
    const body = await response.json() as WalletList;
    const inspected = inspectWalletAssociations(body);
    list = body;
    snapshot = inspected.snapshot;
    return { detail: `Tres billeteras únicas y ${inspected.expected.length} asociaciones; EVM comparte ID y dirección en ${inspected.evm.length} redes.`, http: response.status };
  });
  if (list) {
    for (const wallet of list.wallets.filter((wallet) => wallet.chainType === "ethereum" || wallet.chainType === "solana")) {
      await check(`Saldo de ${wallet.network}`, async () => {
        const path = wallet.chainType === "ethereum" ? `/api/agent/wallets/evm?network=${encodeURIComponent(wallet.network)}` : "/api/agent/wallets/solana";
        const response = await request(path);
        if (!response.ok) throw new WalletAcceptanceFailure(`Saldo no disponible (HTTP ${response.status}); no se interpreta como cero.`);
        const reading = await response.json() as WalletReading;
        if (!readingMatchesWallet(wallet, reading)) throw new WalletAcceptanceFailure("El saldo recibido no corresponde a la dirección y red seleccionadas.");
        return { detail: `${reading.balance} ${wallet.chainType === "solana" ? "" : reading.nativeAsset}`.trim(), http: response.status };
      });
    }
  } else checks.push({ name: "Saldos por red", status: "PENDING", detail: "Se requiere una lista de billeteras coherente antes de leer saldos." });
  if (!bootstrap) {
    await check("Consulta EVM sin autorización rechazada", async () => {
      const response = await fetcher("/api/agent/wallets/evm?network=avalanche%3Afuji", { cache: "no-store", signal });
      if (response.status !== 401) throw new WalletAcceptanceFailure(`Se esperaba rechazo HTTP 401 sin token de Privy y se recibió ${response.status}.`);
      return { detail: "La sesión del navegador no sustituye la autorización Privy de esta API.", http: response.status };
    });
    for (const [name, query] of [
      ["Rechazo de otro usuario", "network=avalanche%3Afuji&userId=did%3Aprivy%3Aacceptance-other"],
      ["Rechazo de dirección externa", `network=avalanche%3Afuji&address=0x${"1".repeat(40)}`],
      ["Rechazo de RPC externo", "network=avalanche%3Afuji&rpc=https%3A%2F%2Fexample.invalid"],
      ["Rechazo de Mainnet", "network=bnb%3Amainnet"],
      ["Rechazo de red desconocida", "network=unknown%3Atestnet"],
    ]) await check(name, async () => {
      const response = await request(`/api/agent/wallets/evm?${query}`);
      if (response.status !== 400) throw new WalletAcceptanceFailure(`Se esperaba rechazo HTTP 400 y se recibió ${response.status}.`);
      return { detail: "Solicitud rechazada antes de elegir una dirección o proveedor alternativos.", http: response.status };
    });
    await check("Cuenta de prueba sin permiso administrativo", async () => {
      const response = await request("/api/admin/privy-session", { method: "POST", credentials: "omit" });
      if (response.status !== 403) throw new WalletAcceptanceFailure(`Se esperaba rechazo HTTP 403 para una cuenta no administradora; se recibió ${response.status}. No se aceptó ninguna cookie administrativa.`);
      const body = await response.json();
      if (body.error !== "access_denied") throw new WalletAcceptanceFailure("El HTTP 403 no demuestra rechazo del rol administrativo: la respuesta no fue access_denied.");
      return { detail: "La sesión Privy de prueba fue rechazada por el acceso administrativo.", http: response.status };
    });
  }
  signal.throwIfAborted();
  return { date: new Date().toISOString(), mode: "wallets", operation: bootstrap ? "bootstrap" : "read", target, checks, status: walletReportStatus(checks), snapshot };
}
