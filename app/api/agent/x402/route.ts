import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateUserAction } from "@/app/agent-memory-store";
import {
  attachStellarSignature,
  submitPreparedDefindexTransaction,
  transactionFromXdr,
} from "@/app/connectors/defindex";
import {
  getStellarTestnetAccount,
  verifyStellarSignature,
  verifyPrivyAccessToken,
} from "@/app/privy-stellar";
import {
  X402_TESTNET_RESOURCE,
  X402_TESTNET_USDC,
} from "@/app/x402/assets";
import {
  prepareX402ClientAuthorization,
  stellarClientSignatureBytes,
} from "@/app/x402/client-authorization";
import { prepareX402UsdcTrustline } from "@/app/x402/trustline";
import {
  getInternalTestnetFaucetReadiness,
  INTERNAL_TESTNET_USDC_DRIP,
  sendInternalTestnetUsdc,
} from "@/app/x402/testnet-faucet";
import {
  inspectX402Resource,
} from "@/app/x402/protocol";
import { getDb, hasDatabase } from "@/db";
import {
  agentActivities,
  agentStellarActions,
  agentTestnetFaucetClaims,
  agentX402Events,
  agentX402Payments,
} from "@/db/schema";
import { listPersistedUserWallets } from "@/app/multichain-account";

import { createX402ExecutionService, safeX402Error } from "@/app/x402/service";
import { publicX402Payment as publicPayment } from "@/app/x402/view";
import { assertX402Preconditions } from "@/app/x402/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const prepareSchema = z.object({
  action: z.literal("prepare"),
  requestId: z.string().trim().min(8).max(100),
}).strict();
const prepareTrustlineSchema = z.object({
  action: z.literal("prepare_trustline"),
  requestId: z.string().trim().min(8).max(100),
}).strict();
const executeTrustlineSchema = z.object({
  action: z.literal("execute_trustline"),
  approvalId: z.string().uuid(),
  explicitConfirmation: z.literal(true),
  signature: z.string().regex(/^0x[0-9a-fA-F]{128}$/),
}).strict();
const executeSchema = z.object({
  action: z.literal("execute"),
  paymentId: z.string().uuid(),
  explicitConfirmation: z.literal(true),
  signature: z.string().regex(/^0x[0-9a-fA-F]{128}$/).optional(),
}).strict();
const claimTestnetUsdcSchema = z.object({
  action: z.literal("claim_testnet_usdc"),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try { return !origin || (Boolean(host) && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}
function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
async function auth(request: Request) {
  if (!sameOrigin(request)) throw new Error("x402_invalid_origin");
  const accessToken = bearerToken(request);
  if (!accessToken) throw new Error("x402_authorization_required");
  try { const claims = await verifyPrivyAccessToken(accessToken); return { userId: claims.user_id }; }
  catch { throw new Error("x402_authorization_invalid"); }
}
async function userWallet(userId: string) {
  if (!hasDatabase()) throw new Error("database_not_configured");
  const wallet = (await listPersistedUserWallets(userId)).find((candidate) =>
    candidate.userId === userId && candidate.network === "stellar:testnet" && candidate.chainType === "stellar"
    && (candidate.status === "active" || candidate.status === "pending"),
  );
  if (!wallet) {
    throw new Error("stellar_wallet_not_ready");
  }
  return { id: wallet.id, address: wallet.address, network: wallet.network };
}
function publicTrustline(row: typeof agentStellarActions.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    signingAddress: row.walletAddress,
    signingHash: row.status === "prepared" && row.transactionHash
      ? `0x${row.transactionHash}`
      : null,
    transactionHash: row.status === "confirmed" ? row.transactionHash : null,
    explorerUrl: row.status === "confirmed" && row.transactionHash
      ? `https://stellar.expert/explorer/testnet/tx/${row.transactionHash}`
      : null,
    preview: row.preview,
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    error: row.error,
  };
}
async function findTrustline(userId: string, id: string) {
  const rows = await getDb().select().from(agentStellarActions).where(and(
    eq(agentStellarActions.id, id), eq(agentStellarActions.userId, userId),
  )).limit(1);
  if (!rows[0] || rows[0].action !== "x402_usdc_trustline") throw new Error("x402_trustline_not_found");
  return rows[0];
}
async function findPayment(userId: string, id: string) {
  const rows = await getDb().select().from(agentX402Payments).where(and(
    eq(agentX402Payments.id, id),
    eq(agentX402Payments.userId, userId),
  )).limit(1);
  if (!rows[0]) throw new Error("x402_payment_not_found");
  return rows[0];
}
async function appendX402Event(
  paymentId: string,
  userId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  await getDb().insert(agentX402Events).values({
    id: randomUUID(), paymentId, userId, eventType, payload,
  });
}

const payments = createX402ExecutionService({
  findPayment,
  preflight: async (payment) => {
    const wallet = await userWallet(payment.userId);
    if (wallet.id !== payment.walletId || wallet.address !== payment.walletAddress) throw new Error("x402_wallet_changed");
    assertX402Preconditions(await getStellarTestnetAccount(wallet.address), payment.amountAtomic);
  },
});

function failure(error: unknown) {
  const message = safeX402Error(error);
  const status = message === "x402_invalid_origin" ? 403 : message.includes("authorization_required") || message.includes("authorization_invalid") ? 401
    : message.endsWith("not_found") ? 404 : /expired|reconciliation|requires_fresh_review|concurrent|changed/.test(message) ? 409 : 400;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => k !== "paymentId") || params.getAll("paymentId").length > 1) throw new Error("x402_query_invalid");
    if (params.has("paymentId")) {
      const paymentId = z.string().uuid().parse(params.get("paymentId"));
      return NextResponse.json({ payment: publicPayment(await findPayment(userId, paymentId)) }, { headers: { "Cache-Control": "no-store" } });
    }
    const wallet = await userWallet(userId);
    const account = await getStellarTestnetAccount(wallet.address);
    const usdc = account.balances.find(
      (balance) => balance.asset === "USDC" && balance.issuer === X402_TESTNET_USDC.issuer,
    );
    const recent = await getDb().select().from(agentX402Payments)
      .where(eq(agentX402Payments.userId, userId))
      .orderBy(desc(agentX402Payments.createdAt)).limit(5);
    const [pending] = await getDb().select().from(agentX402Payments).where(and(
      eq(agentX402Payments.userId, userId), inArray(agentX402Payments.status, ["prepared", "signing", "reconciliation_required"]),
    )).orderBy(desc(agentX402Payments.createdAt)).limit(1);
    return NextResponse.json({
      pendingPayment: pending ? publicPayment(pending) : null,
      wallet: { address: wallet.address, exists: account.exists },
      x402Usdc: {
        trustlineActive: Boolean(usdc),
        balance: usdc?.balance ?? "0",
        issuer: X402_TESTNET_USDC.issuer,
        contract: X402_TESTNET_USDC.contract,
        faucetUrl: X402_TESTNET_USDC.faucetUrl,
        internalFaucet: getInternalTestnetFaucetReadiness(),
      },
      resource: X402_TESTNET_RESOURCE,
      recent: recent.map(publicPayment),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth(request);
    const body = await request.json();
    const reconcile = z.object({ action: z.literal("reconcile"), paymentId: z.string().uuid() }).strict().safeParse(body);
    if (reconcile.success) {
      const result = await payments.reconcile(userId, reconcile.data.paymentId);
      return NextResponse.json({ ...result, payment: publicPayment(result.payment) }, { headers: { "Cache-Control": "no-store" } });
    }
    const wallet = await userWallet(userId);
    const claimTestnetUsdc = claimTestnetUsdcSchema.safeParse(body);
    if (claimTestnetUsdc.success) {
      const readiness = getInternalTestnetFaucetReadiness();
      if (!readiness.configured) throw new Error("testnet_usdc_faucet_not_configured");
      const account = await getStellarTestnetAccount(wallet.address);
      const trustline = account.balances.find(
        (balance) => balance.asset === "USDC" && balance.issuer === X402_TESTNET_USDC.issuer,
      );
      if (!trustline) throw new Error("x402_usdc_trustline_required");

      const claimWindow = new Date().toISOString().slice(0, 13);
      const claimId = randomUUID();
      await getDb().insert(agentTestnetFaucetClaims).values({
        id: claimId,
        userId,
        walletAddress: wallet.address,
        asset: "USDC",
        amount: INTERNAL_TESTNET_USDC_DRIP,
        claimWindow,
        status: "pending",
      }).onConflictDoNothing({
        target: [agentTestnetFaucetClaims.userId, agentTestnetFaucetClaims.asset, agentTestnetFaucetClaims.claimWindow],
      });
      const rows = await getDb().select().from(agentTestnetFaucetClaims).where(and(
        eq(agentTestnetFaucetClaims.userId, userId),
        eq(agentTestnetFaucetClaims.asset, "USDC"),
        eq(agentTestnetFaucetClaims.claimWindow, claimWindow),
      )).limit(1);
      const claim = rows[0];
      if (!claim) throw new Error("testnet_faucet_claim_not_created");
      if (claim.status === "confirmed") return NextResponse.json({ replayed: true, claim });
      if (claim.id !== claimId) throw new Error(`testnet_faucet_claim_${claim.status}`);
      try {
        const sent = await sendInternalTestnetUsdc({ destination: wallet.address, claimKey: claim.id });
        const now = new Date();
        await getDb().update(agentTestnetFaucetClaims).set({ status: "confirmed", transactionHash: sent.transactionHash, updatedAt: now }).where(eq(agentTestnetFaucetClaims.id, claim.id));
        await getDb().insert(agentActivities).values({
          id: randomUUID(), userId, eventType: "testnet.faucet.usdc",
          summary: "Received internal Stellar Testnet USDC",
          metadata: { amount: sent.amount, transactionHash: sent.transactionHash, walletAddress: wallet.address },
        });
        return NextResponse.json({ replayed: false, claim: { ...claim, status: "confirmed", transactionHash: sent.transactionHash }, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sent.transactionHash}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "testnet_usdc_faucet_failed";
        await getDb().update(agentTestnetFaucetClaims).set({ status: "failed", error: message, updatedAt: new Date() }).where(eq(agentTestnetFaucetClaims.id, claim.id));
        throw error;
      }
    }
    const executeTrustline = executeTrustlineSchema.safeParse(body);
    if (executeTrustline.success) {
      let action = await findTrustline(userId, executeTrustline.data.approvalId);
      if (action.status === "confirmed") return NextResponse.json({ replayed: true, approval: publicTrustline(action) });
      if (action.expiresAt.getTime() <= Date.now()) throw new Error("x402_trustline_approval_expired");
      const transaction = transactionFromXdr(action.preparedXdr);
      const transactionHash = transaction.hash();
      if (
        !action.transactionHash ||
        Buffer.from(transactionHash).toString("hex") !== action.transactionHash
      ) {
        throw new Error("x402_trustline_payload_changed");
      }
      const signature = stellarClientSignatureBytes(executeTrustline.data.signature);
      if (
        !verifyStellarSignature(action.walletAddress, transactionHash, signature)
      ) {
        throw new Error("stellar_client_signature_verification_failed");
      }
      const signed = attachStellarSignature(action.preparedXdr, action.walletAddress, signature);
      const result = await submitPreparedDefindexTransaction({ action: "usdc_trustline", signedXdr: signed.toXDR() });
      const now = new Date();
      await getDb().update(agentStellarActions).set({
        signedXdr: signed.toXDR(), transactionHash: result.hash, status: "confirmed",
        confirmedAt: now, updatedAt: now, error: null,
      }).where(eq(agentStellarActions.id, action.id));
      action = await findTrustline(userId, action.id);
      return NextResponse.json({ replayed: false, approval: publicTrustline(action) });
    }

    const prepareTrustline = prepareTrustlineSchema.safeParse(body);
    if (prepareTrustline.success) {
      const account = await getStellarTestnetAccount(wallet.address);
      if (!account.exists) throw new Error("x402_stellar_account_not_active");
      const existing = account.balances.find((balance) => balance.asset === "USDC" && balance.issuer === X402_TESTNET_USDC.issuer);
      if (existing) return NextResponse.json({ alreadyComplete: true, balance: existing.balance });
      const decision = await evaluateUserAction(userId, { actionType: "stellar.trustline.x402_usdc", network: "stellar:testnet", asset: "USDC", amount: 0, financial: true, irreversible: true });
      if (!decision.allowed) return NextResponse.json({ error: "x402_policy_blocked", decision }, { status: 403 });
      const prepared = await prepareX402UsdcTrustline(wallet.address);
      const key = createHash("sha256").update(`x402-trustline:${userId}:${prepareTrustline.data.requestId}`).digest("hex");
      await getDb().insert(agentStellarActions).values({
        id: randomUUID(), userId, walletId: wallet.id, walletAddress: wallet.address,
        action: "x402_usdc_trustline", asset: "USDC", amount: "0", status: "prepared",
        idempotencyKey: key, preparedXdr: prepared.xdr, transactionHash: prepared.transactionHash,
        preview: prepared.preview, expiresAt: prepared.expiresAt,
      }).onConflictDoNothing({ target: agentStellarActions.idempotencyKey });
      const rows = await getDb().select().from(agentStellarActions).where(eq(agentStellarActions.idempotencyKey, key)).limit(1);
      return NextResponse.json({ alreadyComplete: false, decision, approval: publicTrustline(rows[0]) });
    }
    const execute = executeSchema.safeParse(body);
    if (execute.success) {
      const result = await payments.execute(userId, execute.data.paymentId, execute.data.signature);
      return NextResponse.json({ ...result, payment: publicPayment(result.payment) }, { headers: { "Cache-Control": "no-store" } });
    }

    const prepare = prepareSchema.safeParse(body);
    if (!prepare.success) throw new Error("invalid_x402_request");
    const key = createHash("sha256").update(`x402:${userId}:${prepare.data.requestId}`).digest("hex");
    const [previous] = await getDb().select().from(agentX402Payments).where(and(eq(agentX402Payments.userId, userId), eq(agentX402Payments.idempotencyKey, key))).limit(1);
    if (previous) return NextResponse.json({ replayed: true, payment: publicPayment(previous) }, { headers: { "Cache-Control": "no-store" } });
    const [unresolved] = await getDb().select().from(agentX402Payments).where(and(
      eq(agentX402Payments.userId, userId), inArray(agentX402Payments.status, ["signing", "reconciliation_required"]),
    )).limit(1);
    if (unresolved) throw new Error("x402_payment_reconciliation_required");
    const challenge = await inspectX402Resource(X402_TESTNET_RESOURCE);
    assertX402Preconditions(await getStellarTestnetAccount(wallet.address), challenge.requirement.amount);
    const decision = await evaluateUserAction(userId, {
      actionType: "x402.payment",
      network: challenge.requirement.network,
      asset: "USDC",
      amount: Number(challenge.amountDisplay),
      financial: true,
      irreversible: true,
    });
    if (!decision.allowed) {
      return NextResponse.json({ error: "x402_policy_blocked", decision }, { status: 403 });
    }
    const clientAuthorization = await prepareX402ClientAuthorization({
      x402Version: challenge.paymentRequired.x402Version,
      requirement: challenge.requirement,
      address: wallet.address,
    });
    const approvalLifetimeMs = Math.max(
      1_000,
      Math.min(5 * 60_000, challenge.requirement.maxTimeoutSeconds * 1_000 - 5_000),
    );

    const inserted = await getDb().insert(agentX402Payments).values({
      id: randomUUID(), userId, walletId: wallet.id, walletAddress: wallet.address,
      resourceUrl: X402_TESTNET_RESOURCE,
      network: challenge.requirement.network,
      assetContract: challenge.requirement.asset,
      payTo: challenge.requirement.payTo,
      amountAtomic: challenge.requirement.amount,
      amountDisplay: challenge.amountDisplay,
      status: "prepared",
      idempotencyKey: key,
      paymentRequired: clientAuthorization,
      expiresAt: new Date(Date.now() + approvalLifetimeMs),
    }).onConflictDoNothing({ target: agentX402Payments.idempotencyKey })
      .returning({ id: agentX402Payments.id });
    const rows = await getDb().select().from(agentX402Payments).where(eq(agentX402Payments.idempotencyKey, key)).limit(1);
    if (inserted.length > 0) {
      await Promise.allSettled([
        appendX402Event(rows[0].id, userId, "prepared", {
          requestId: prepare.data.requestId,
          amount: rows[0].amountDisplay,
          asset: "USDC",
          network: rows[0].network,
        }),
        appendX402Event(rows[0].id, userId, "policy_allowed", {
          outcome: decision.outcome,
          reasonCodes: decision.reasonCodes,
          requiresApproval: decision.requiresApproval,
        }),
      ]);
    }
    return NextResponse.json({ replayed: inserted.length === 0, decision, payment: publicPayment(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}
