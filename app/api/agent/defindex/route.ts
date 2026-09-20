import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachStellarSignature,
  DEFINDEX_TESTNET,
  getDefindexPosition,
  getSubmittedTransaction,
  prepareDefindexDeposit,
  prepareUsdcTrustline,
  submitPreparedDefindexTransaction,
  transactionFromXdr,
} from "@/app/connectors/defindex";
import {
  getStellarTestnetAccount,
  verifyPrivyAccessToken,
} from "@/app/privy-stellar";
import { stellarClientSignatureBytes } from "@/app/x402/client-authorization";
import { getDatabaseUrl, getDb, hasDatabase } from "@/db";
import {
  agentActivities,
  agentStellarActions,
} from "@/db/schema";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { evaluateUserAction } from "@/app/agent-memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let defindexSchemaPromise: Promise<void> | null = null;

async function ensureDefindexSchema() {
  if (defindexSchemaPromise) return defindexSchemaPromise;
  defindexSchemaPromise = (async () => {
    const url = getDatabaseUrl();
    if (!url) throw new Error("database_not_configured");
    const sql = neon(url);
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_stellar_actions (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      wallet_id text NOT NULL,
      wallet_address text NOT NULL,
      action text NOT NULL,
      asset text NOT NULL,
      amount numeric(20,7) NOT NULL,
      status text NOT NULL DEFAULT 'prepared',
      idempotency_key text NOT NULL,
      prepared_xdr text NOT NULL,
      signed_xdr text,
      transaction_hash text,
      preview jsonb NOT NULL DEFAULT '{}'::jsonb,
      expires_at timestamptz NOT NULL,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      confirmed_at timestamptz
    )`, []);
    await sql.query("CREATE UNIQUE INDEX IF NOT EXISTS agent_stellar_actions_idempotency_uidx ON agent_stellar_actions(idempotency_key)", []);
    await sql.query("CREATE UNIQUE INDEX IF NOT EXISTS agent_stellar_actions_tx_hash_uidx ON agent_stellar_actions(transaction_hash)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_stellar_actions_user_created_idx ON agent_stellar_actions(user_id, created_at)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_stellar_actions_status_idx ON agent_stellar_actions(status)", []);
  })().catch((error) => {
    defindexSchemaPromise = null;
    throw error;
  });
  return defindexSchemaPromise;
}

const prepareSchema = z.discriminatedUnion("operation", [
  z.object({
    action: z.literal("prepare"),
    operation: z.literal("usdc_trustline"),
    requestId: z.string().trim().min(8).max(100),
  }),
  z.object({
    action: z.literal("prepare"),
    operation: z.literal("deposit"),
    asset: z.enum(["XLM", "USDC"]),
    amount: z.string().trim().min(1).max(32),
    requestId: z.string().trim().min(8).max(100),
  }),
]);
const executeSchema = z.object({
  action: z.literal("execute"),
  approvalId: z.string().uuid(),
  explicitConfirmation: z.literal(true),
  signature: z.string().regex(/^0x[0-9a-fA-F]{128}$/),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function auth(request: Request) {
  if (!sameOrigin(request)) throw new Error("invalid_origin");
  const accessToken = bearerToken(request);
  const claims = await verifyPrivyAccessToken(accessToken);
  return { userId: claims.user_id };
}

async function userWallet(userId: string) {
  await ensureDefindexSchema();
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

function idempotencyKey(userId: string, requestId: string) {
  return createHash("sha256")
    .update("defindex:testnet:" + userId + ":" + requestId)
    .digest("hex");
}

function publicAction(row: typeof agentStellarActions.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    asset: row.asset,
    amount: row.amount,
    status: row.status,
    signingAddress: row.walletAddress,
    signingHash: row.status === "prepared" && row.transactionHash
      ? `0x${row.transactionHash}`
      : null,
    transactionHash: row.transactionHash,
    explorerUrl: row.transactionHash
      ? DEFINDEX_TESTNET.explorerUrl + "/tx/" + row.transactionHash
      : null,
    preview: row.preview,
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    error: row.error,
  };
}

async function findAction(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(agentStellarActions)
    .where(
      and(
        eq(agentStellarActions.id, id),
        eq(agentStellarActions.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("defindex_action_not_found");
  return rows[0];
}

async function prepareAction(
  userId: string,
  input: z.infer<typeof prepareSchema>,
) {
  const wallet = await userWallet(userId);
  const account = await getStellarTestnetAccount(wallet.address);
  if (!account.exists) throw new Error("stellar_wallet_not_active");
  const decision = await evaluateUserAction(userId, {
    actionType:
      input.operation === "deposit"
        ? "defindex.deposit." + input.asset.toLowerCase() + ".prepare"
        : "stellar.trustline.usdc.prepare",
    network: "stellar:testnet",
    asset: input.operation === "deposit" ? input.asset : "USDC",
    amount: input.operation === "deposit" ? Number(input.amount) : 0,
    financial: true,
    irreversible: true,
  });
  if (!decision.allowed) {
    throw new Error("policy_blocked:" + decision.reasonCodes.join(","));
  }


  const usdcBalance = account.balances.find(
    (balance) =>
      balance.asset === "USDC" &&
      balance.issuer === DEFINDEX_TESTNET.usdc.issuer,
  );
  if (input.operation === "usdc_trustline" && usdcBalance) {
    return {
      alreadyComplete: true,
      message: "The exact DeFindex USDC trustline is already active.",
      trustline: { asset: "USDC", balance: usdcBalance.balance },
    };
  }
  if (input.operation === "deposit" && input.asset === "USDC" && !usdcBalance) {
    throw new Error("usdc_trustline_required");
  }

  const prepared =
    input.operation === "usdc_trustline"
      ? await prepareUsdcTrustline(wallet.address)
      : await prepareDefindexDeposit({
          walletAddress: wallet.address,
          asset: input.asset,
          amount: input.amount,
        });
  const key = idempotencyKey(userId, input.requestId);
  const id = randomUUID();

  await getDb()
    .insert(agentStellarActions)
    .values({
      id,
      userId,
      walletId: wallet.id,
      walletAddress: wallet.address,
      action: prepared.action,
      asset: prepared.asset,
      amount: prepared.amount,
      status: "prepared",
      idempotencyKey: key,
      preparedXdr: prepared.xdr,
      transactionHash: prepared.transactionHash,
      preview: prepared.preview,
      expiresAt: new Date(prepared.expiresAt),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: agentStellarActions.idempotencyKey });

  const rows = await getDb()
    .select()
    .from(agentStellarActions)
    .where(eq(agentStellarActions.idempotencyKey, key))
    .limit(1);
  if (!rows[0]) throw new Error("defindex_prepare_failed");
  return { alreadyComplete: false, approval: publicAction(rows[0]) };
}

async function executeAction(userId: string, approvalId: string, clientSignature: string) {
  let action = await findAction(userId, approvalId);
  if (action.status === "confirmed") {
    return { replayed: true, approval: publicAction(action) };
  }
  if (action.expiresAt.getTime() < Date.now() && !action.signedXdr) {
    throw new Error("defindex_approval_expired");
  }

  if (action.transactionHash) {
    const existing = await getSubmittedTransaction(action.transactionHash);
    if (existing?.successful) {
      const confirmedAt = new Date();
      await getDb()
        .update(agentStellarActions)
        .set({
          status: "confirmed",
          confirmedAt,
          updatedAt: confirmedAt,
          error: null,
        })
        .where(eq(agentStellarActions.id, action.id));
      action = await findAction(userId, action.id);
      return { replayed: true, approval: publicAction(action) };
    }
  }

  let signedXdr = action.signedXdr;
  if (!signedXdr) {
    const transaction = transactionFromXdr(action.preparedXdr);
    const digest = transaction.hash();
    const expectedHash = digest.toString("hex");
    if (action.transactionHash !== expectedHash) {
      throw new Error("defindex_prepared_hash_mismatch");
    }
    const signature = stellarClientSignatureBytes(clientSignature);
    const signed = attachStellarSignature(
      action.preparedXdr,
      action.walletAddress,
      signature,
    );
    signedXdr = signed.toXDR();
    await getDb()
      .update(agentStellarActions)
      .set({
        signedXdr,
        status: "submitting",
        updatedAt: new Date(),
        error: null,
      })
      .where(eq(agentStellarActions.id, action.id));
  }

  try {
    const result = await submitPreparedDefindexTransaction({
      action: action.action as "usdc_trustline" | "deposit",
      signedXdr,
    });
    const confirmedAt = new Date();
    await getDb()
      .update(agentStellarActions)
      .set({
        status: "confirmed",
        transactionHash: result.hash,
        confirmedAt,
        updatedAt: confirmedAt,
        error: null,
      })
      .where(eq(agentStellarActions.id, action.id));
    await getDb().insert(agentActivities).values({
      id: randomUUID(),
      userId,
      eventType:
        action.action === "usdc_trustline"
          ? "stellar.trustline.confirmed"
          : "defindex.deposit.confirmed",
      summary:
        action.action === "usdc_trustline"
          ? "USDC trustline activated on Stellar Testnet"
          : `Deposited ${action.amount} ${action.asset} into DeFindex Testnet`,
      metadata: {
        actionId: action.id,
        transactionHash: result.hash,
        asset: action.asset,
        amount: action.amount,
        vault:
          action.asset === "XLM"
            ? DEFINDEX_TESTNET.xlm.vault
            : DEFINDEX_TESTNET.usdc.vault,
      },
    });
    action = await findAction(userId, action.id);
    return { replayed: false, approval: publicAction(action) };
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "stellar_submit_failed";
    await getDb()
      .update(agentStellarActions)
      .set({ status: "failed", error: code, updatedAt: new Date() })
      .where(eq(agentStellarActions.id, action.id));
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth(request);
    const wallet = await userWallet(userId);
    const [account, xlmPosition, usdcPosition, recent] = await Promise.all([
      getStellarTestnetAccount(wallet.address),
      getDefindexPosition(wallet.address, "XLM").catch(() => null),
      getDefindexPosition(wallet.address, "USDC").catch(() => null),
      getDb()
        .select()
        .from(agentStellarActions)
        .where(eq(agentStellarActions.userId, userId))
        .orderBy(desc(agentStellarActions.createdAt))
        .limit(10),
    ]);
    const usdc = account.balances.find(
      (balance) =>
        balance.asset === "USDC" &&
        balance.issuer === DEFINDEX_TESTNET.usdc.issuer,
    );
    return NextResponse.json(
      {
        network: "Stellar Testnet",
        wallet: wallet.address,
        balances: account.balances,
        usdcTrustline: {
          active: Boolean(usdc),
          balance: usdc?.balance ?? "0",
          issuer: DEFINDEX_TESTNET.usdc.issuer,
        },
        positions: { XLM: xlmPosition, USDC: usdcPosition },
        vaults: {
          XLM: DEFINDEX_TESTNET.xlm,
          USDC: DEFINDEX_TESTNET.usdc,
        },
        recent: recent.map(publicAction),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "defindex_status_failed";
    const status = code === "invalid_origin" ? 403 : code.includes("database") ? 503 : 401;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth(request);
    const body = await request.json().catch(() => null);
    const execute = executeSchema.safeParse(body);
    if (execute.success) {
      return NextResponse.json(
        await executeAction(userId, execute.data.approvalId, execute.data.signature),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const prepare = prepareSchema.parse(body);
    return NextResponse.json(await prepareAction(userId, prepare), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof z.ZodError
        ? "invalid_defindex_request"
        : error instanceof Error
          ? error.message.split(":")[0]
          : "defindex_action_failed";
    const status =
      code === "invalid_defindex_request" ||
      code === "usdc_trustline_required" ||
      code === "defindex_approval_expired" ||
      code === "policy_blocked"
        ? 400
        : code === "invalid_origin"
          ? 403
          : code === "database_not_configured"
            ? 503
            : code.startsWith("privy_")
              ? 401
              : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
