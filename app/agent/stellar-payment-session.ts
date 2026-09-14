export type StellarPayment = {
  id: string; signingAddress: string; signingHash: `0x${string}` | null;
  resourceUrl: string; network: string; asset: "USDC"; assetContract: string;
  payTo: string; amount: string; status: string; transactionHash: string | null;
  explorerUrl: string | null; resourcePreview: string | null; resourceBody?: string | null; expiresAt: string;
  paymentState?: "pending" | "confirmed" | "uncertain";
  deliveryState?: "pending" | "received";
  verification?: Record<string, unknown> | null;
  evidence?: { sha256: string; status: number; contentType: string; deliveredAt: string } | null;
  request?: { method: "GET"; url: string; version: number; scheme: "exact"; network: string; asset: string; amount: string; payTo: string; sponsored: true; maxTimeoutSeconds: number } | null;
};
export type StellarPaymentStatus = {
  x402Usdc: { trustlineActive: boolean; balance: string; faucetUrl: string };
  resource: string; recent: StellarPayment[]; pendingPayment?: StellarPayment | null;
};
type IdStorage = Pick<Storage, "getItem" | "setItem">;

export function stellarPaymentStorageKey(userId: string) { return `carmelita:stellar-payment:${userId}`; }

export function stellarPaymentView(payment: StellarPayment, now = Date.now()) {
  const expired = !Number.isFinite(Date.parse(payment.expiresAt)) || Date.parse(payment.expiresAt) <= now;
  const fullyVerified = payment.status === "confirmed" && payment.paymentState === "confirmed" && payment.deliveryState === "received";
  const uncertain = payment.paymentState === "uncertain" || !payment.paymentState || payment.status === "reconciliation_required";
  return {
    fullyVerified, expired, uncertain,
    canSign: payment.status === "prepared" && payment.paymentState === "pending" && Boolean(payment.request && payment.signingHash) && !expired,
    canStartAnother: !uncertain && (fullyVerified || payment.status === "failed" || payment.status === "expired" || payment.status === "prepared" && expired),
  };
}

export function stellarPaymentContent(payment: StellarPayment) {
  if (!stellarPaymentView(payment).fullyVerified || !payment.evidence) return null;
  return payment.resourceBody ?? payment.resourcePreview;
}

export function sameStellarPaymentDelivery(original: StellarPayment, replayed: StellarPayment) {
  if (!stellarPaymentView(original).fullyVerified || !stellarPaymentView(replayed).fullyVerified ||
    original.id !== replayed.id || !original.transactionHash || original.transactionHash !== replayed.transactionHash ||
    !original.evidence || original.evidence.sha256 !== replayed.evidence?.sha256) return false;
  // Historical responses expose an excerpt; newer responses must preserve every delivered character.
  return original.resourceBody != null
    ? original.resourceBody === replayed.resourceBody
    : original.resourcePreview === replayed.resourcePreview;
}

export function rememberStellarPayment(userId: string, payment: StellarPayment, storage: IdStorage) {
  storage.setItem(stellarPaymentStorageKey(userId), payment.id);
}

export async function restoreStellarPayment({ userId, storage, status, readPayment, assertCurrentSession = () => {} }: {
  userId: string; storage: IdStorage; status: StellarPaymentStatus;
  readPayment: (id: string) => Promise<StellarPayment>;
  assertCurrentSession?: () => void;
}) {
  assertCurrentSession();
  let saved: string | null = null;
  try { saved = storage.getItem(stellarPaymentStorageKey(userId)); } catch { /* The authenticated server pending record remains available. */ }
  if (saved) {
    const payment = await readPayment(saved);
    assertCurrentSession();
    if (payment.id !== saved) throw new Error("x402_payment_identity_mismatch");
    return payment;
  }
  const pending = status.pendingPayment ?? status.recent.find((payment) => !stellarPaymentView(payment).canStartAnother) ?? null;
  if (pending) try { rememberStellarPayment(userId, pending, storage); } catch { /* Server persistence is authoritative. */ }
  return pending;
}

export async function prepareStellarPayment({ status, existing, prepare }: {
  status: StellarPaymentStatus; existing: StellarPayment | null;
  prepare: () => Promise<StellarPayment>;
}) {
  if (existing && !stellarPaymentView(existing).canStartAnother) return { payment: existing, reason: "existing" as const };
  if (status.pendingPayment && !stellarPaymentView(status.pendingPayment).canStartAnother) return { payment: status.pendingPayment, reason: "existing" as const };
  if (!status.x402Usdc.trustlineActive || !Number.isFinite(Number(status.x402Usdc.balance)) || Number(status.x402Usdc.balance) <= 0) return { payment: existing, reason: "requirements" as const };
  return { payment: await prepare(), reason: "prepared" as const };
}
