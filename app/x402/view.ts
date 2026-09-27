import { isPreparedX402Authorization } from "./client-authorization";
import { safeX402Error, verifiedX402Payment, type X402PaymentRow } from "./service";

/** Explicit projection: signed transactions and execution checkpoints never leave the server. */
export function publicX402Payment(row: X402PaymentRow) {
  const prepared = isPreparedX402Authorization(row.paymentRequired) ? row.paymentRequired : null;
  const verified = verifiedX402Payment(row);
  const paid = row.paymentState === "confirmed" && Boolean(row.verification);
  const transactionHash = paid ? row.transactionHash : null;
  return {
    id: row.id, signingAddress: row.walletAddress,
    signingHash: row.status === "prepared" && !row.execution && prepared?.request ? prepared.authorizationHash : null,
    resourceUrl: row.resourceUrl, request: prepared?.request ?? null,
    network: row.network, asset: "USDC", assetContract: row.assetContract, payTo: row.payTo,
    amount: row.amountDisplay,
    status: row.status === "confirmed" && !verified ? "reconciliation_required" : row.status,
    paymentState: row.paymentState, deliveryState: row.deliveryState,
    transactionHash,
    explorerUrl: transactionHash ? `https://stellar.expert/explorer/testnet/tx/${transactionHash}` : null,
    resourcePreview: verified ? row.resourcePreview : null,
    resourceBody: verified ? row.resourceBody : null,
    evidence: verified ? row.settlement?.resourceEvidence ?? null : null,
    verification: paid ? row.verification : null,
    expiresAt: row.expiresAt.toISOString(), confirmedAt: verified ? row.confirmedAt?.toISOString() ?? null : null,
    error: row.error ? safeX402Error(new Error(row.error)) : null,
  };
}
