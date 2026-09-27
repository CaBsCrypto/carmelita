import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentActivities } from "@/db/schema";
import { listPersistedUserWallets } from "@/app/multichain-account";
import {
  estimateEvmNativeTransfer,
  getEvmTransactionEvidence,
} from "@/app/wallets/evm-rpc";
import { getWalletNetwork } from "@/app/wallets/networks";
import {
  FUJI_CHAIN_ID,
  FUJI_TRANSFER_DEMO_AMOUNT,
} from "@/app/wallets/avalanche-policy";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;

function activityId(userId: string, requestId: string) {
  return "fuji_send_" + createHash("sha256")
    .update(`${userId}:${requestId}`)
    .digest("hex")
    .slice(0, 48);
}

export async function getActiveFujiWallet(userId: string, listWallets = listPersistedUserWallets) {
  const wallet = (await listWallets(userId)).find((candidate) =>
    candidate.userId === userId && candidate.chainType === "ethereum"
    && candidate.network === "avalanche:fuji" && candidate.status === "active",
  );
  if (!wallet) throw new Error("avalanche_not_activated");
  return { id: wallet.id, address: wallet.address };
}

export async function prepareFujiDemoTransfer(input: {
  userId: string;
  requestId: string;
  destination: string;
  amount: string;
}) {
  if (!ADDRESS.test(input.destination)) throw new Error("invalid_evm_address");
  const destination = input.destination.toLowerCase();
  if (input.amount !== FUJI_TRANSFER_DEMO_AMOUNT) {
    throw new Error("fuji_demo_amount_must_be_0.001");
  }
  const wallet = await getActiveFujiWallet(input.userId);
  if (wallet.address.toLowerCase() === destination) {
    throw new Error("fuji_destination_must_be_second_wallet");
  }
  const id = activityId(input.userId, input.requestId);
  const current = await getDb().select({
    metadata: agentActivities.metadata,
  }).from(agentActivities).where(and(
    eq(agentActivities.id, id),
    eq(agentActivities.userId, input.userId),
  )).limit(1);
  if (current[0]) {
    const metadata = current[0].metadata;
    if (
      metadata.destination !== destination ||
      metadata.amount !== input.amount
    ) throw new Error("idempotency_key_reused");
    return metadata;
  }

  const estimate = await estimateEvmNativeTransfer(
    getWalletNetwork("avalanche:fuji"),
    wallet.address,
    input.destination,
    input.amount,
  );
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const metadata = {
    previewId: id,
    status: "prepared",
    network: "avalanche:fuji",
    chainId: FUJI_CHAIN_ID,
    from: wallet.address,
    destination,
    amount: input.amount,
    valueWei: estimate.valueWei,
    valueHex: estimate.valueHex,
    gasLimit: estimate.gasLimit,
    gasLimitHex: estimate.gasLimitHex,
    gasPriceWei: estimate.gasPriceWei,
    maxGasCostWei: estimate.maxGasCostWei,
    nonce: estimate.nonce,
    expiresAt,
    transactionHash: null,
    explorerUrl: null,
  };
  const inserted = await getDb().insert(agentActivities).values({
    id,
    userId: input.userId,
    eventType: "avalanche.transfer.prepared",
    summary: "Prepared 0.001 AVAX Fuji transfer",
    metadata,
  }).onConflictDoNothing().returning({ metadata: agentActivities.metadata });
  if (inserted[0]) return inserted[0].metadata;

  // A concurrent request won the unique preview ID. Never return local,
  // unpersisted parameters: refetch and bind exclusively to the winner.
  const [persisted] = await getDb().select({
    metadata: agentActivities.metadata,
  }).from(agentActivities).where(and(
    eq(agentActivities.id, id),
    eq(agentActivities.userId, input.userId),
  )).limit(1);
  if (!persisted) throw new Error("fuji_preview_conflict_unresolved");
  if (
    persisted.metadata.destination !== destination ||
    persisted.metadata.amount !== input.amount
  ) throw new Error("idempotency_key_reused");
  return persisted.metadata;
}

export async function recordFujiDemoTransfer(input: {
  userId: string;
  previewId: string;
  transactionHash: string;
}) {
  if (!HASH.test(input.transactionHash)) throw new Error("invalid_transaction_hash");
  const transactionHash = input.transactionHash.toLowerCase();
  const db = getDb();
  const loadPreview = async () => {
    const [row] = await db.select({ metadata: agentActivities.metadata })
      .from(agentActivities)
      .where(and(
        eq(agentActivities.id, input.previewId),
        eq(agentActivities.userId, input.userId),
      ))
      .limit(1);
    if (!row) throw new Error("fuji_preview_not_found");
    return row.metadata;
  };

  let preview = await loadPreview();
  const currentHash = () => typeof preview.transactionHash === "string"
    ? preview.transactionHash.toLowerCase()
    : null;
  if (currentHash() && currentHash() !== transactionHash) {
    throw new Error("fuji_preview_already_consumed");
  }
  if (
    (preview.status === "confirmed" || preview.status === "failed") &&
    currentHash() === transactionHash
  ) return { ...preview, replayProtected: true };

  const explorerUrl = `${getWalletNetwork("avalanche:fuji").explorerUrl}/tx/${transactionHash}`;
  let isSubmittedRetry = preview.status === "submitted" &&
    currentHash() === transactionHash;

  if (!isSubmittedRetry) {
    const now = new Date().toISOString();
    if (preview.status !== "prepared") {
      throw new Error("fuji_preview_not_recordable");
    }

    const submittedMetadata = {
      ...preview,
      status: "submitted",
      transactionHash,
      explorerUrl,
      submittedAt: now,
      replayProtected: false,
    };
    const transitioned = await db.update(agentActivities).set({
      eventType: "avalanche.transfer.submitted",
      summary: "submitted 0.001 AVAX Fuji transfer",
      metadata: submittedMetadata,
    }).where(and(
      eq(agentActivities.id, input.previewId),
      eq(agentActivities.userId, input.userId),
      sql`${agentActivities.metadata}->>'status' = 'prepared'`,
      sql`COALESCE(${agentActivities.metadata}->>'transactionHash', '') = ''`,
    )).returning({ metadata: agentActivities.metadata });

    if (transitioned[0]) {
      preview = transitioned[0].metadata;
    } else {
      preview = await loadPreview();
      const persistedHash = typeof preview.transactionHash === "string"
        ? preview.transactionHash.toLowerCase()
        : null;
      if (persistedHash !== transactionHash) {
        throw new Error("fuji_preview_already_consumed");
      }
      if (preview.status === "confirmed" || preview.status === "failed") {
        return { ...preview, replayProtected: true };
      }
      if (preview.status !== "submitted") {
        throw new Error("fuji_preview_transition_failed");
      }
      isSubmittedRetry = true;
    }
  }

  // The hash is durable before this network call. RPC propagation delays can
  // now be retried after reload without ever authorizing another broadcast.
  const evidence = await getEvmTransactionEvidence(
    getWalletNetwork("avalanche:fuji"),
    transactionHash,
  );
  if (
    evidence.chainId !== FUJI_CHAIN_ID ||
    evidence.transactionChainId !== FUJI_CHAIN_ID ||
    evidence.transactionHash !== transactionHash ||
    evidence.from.toLowerCase() !== String(preview.from).toLowerCase() ||
    evidence.to?.toLowerCase() !== String(preview.destination).toLowerCase() ||
    evidence.valueWei !== preview.valueWei ||
    evidence.nonce !== preview.nonce ||
    evidence.gasLimit !== preview.gasLimit ||
    evidence.gasPriceWei !== preview.gasPriceWei
  ) throw new Error("fuji_transaction_mismatch");

  if (
    evidence.receiptStatus !== null &&
    evidence.receiptStatus !== "0x1" &&
    evidence.receiptStatus !== "0x0"
  ) throw new Error("fuji_receipt_status_invalid");
  const status = evidence.receiptStatus === "0x1"
    ? "confirmed"
    : evidence.receiptStatus === "0x0"
      ? "failed"
      : "submitted";
  const metadata = {
    ...preview,
    status,
    transactionHash,
    explorerUrl,
    blockNumber: evidence.blockNumber,
    receiptStatus: evidence.receiptStatus,
    replayProtected: isSubmittedRetry,
  };
  const [updated] = await db.update(agentActivities).set({
    eventType: `avalanche.transfer.${status}`,
    summary: `${status} 0.001 AVAX Fuji transfer`,
    metadata,
  }).where(and(
    eq(agentActivities.id, input.previewId),
    eq(agentActivities.userId, input.userId),
    sql`${agentActivities.metadata}->>'transactionHash' = ${transactionHash}`,
    sql`${agentActivities.metadata}->>'status' = 'submitted'`,
  )).returning({ metadata: agentActivities.metadata });
  if (updated) return updated.metadata;

  const terminal = await loadPreview();
  const terminalHash = typeof terminal.transactionHash === "string"
    ? terminal.transactionHash.toLowerCase()
    : null;
  if (terminalHash !== transactionHash) throw new Error("fuji_preview_already_consumed");
  return { ...terminal, replayProtected: true };
}
