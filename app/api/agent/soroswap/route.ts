import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachStellarSignature,
  transactionFromXdr,
} from "@/app/connectors/defindex";
import {
  buildSoroswapSwap,
  getSoroswapQuote,
  sendSoroswapSwap,
  SOROSWAP_TESTNET,
} from "@/app/connectors/soroswap";
import { evaluateUserAction } from "@/app/agent-memory-store";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  action: z.literal("quote"),
  assetIn: z.enum(["XLM", "USDC"]),
  assetOut: z.enum(["XLM", "USDC"]),
  amount: z.string().trim().min(1).max(32),
  slippageBps: z.number().int().min(1).max(500).default(50),
});

const prepareSchema = quoteSchema.extend({
  action: z.literal("prepare"),
  requestId: z.string().trim().min(8).max(100),
});

const executeSchema = z.object({
  action: z.literal("execute"),
  approvalId: z.string().uuid(),
  explicitConfirmation: z.literal(true),
  signature: z.string().regex(/^0x[0-9a-fA-F]{128}$/),
});

type SoroswapPreview = {
  title: string;
  description: string;
  network: "Stellar Testnet";
  wallet: string;
  assetIn: "XLM" | "USDC";
  assetOut: "XLM" | "USDC";
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  priceImpactPct: string;
  platform: string;
  slippageBps: number;
};

let schemaPromise: Promise<void> | null = null;

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
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
    await sql.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS agent_stellar_actions_idempotency_uidx ON agent_stellar_actions(idempotency_key)",
      [],
    );
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

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
  const claims = await verifyPrivyAccessToken(bearerToken(request));
  return { userId: claims.user_id };
}

async function userWallet(userId: string) {
  await ensureSchema();
  if (!hasDatabase()) throw new Error("database_not_configured");
  const wallet = (await listPersistedUserWallets(userId)).find((candidate) =>
    candidate.userId === userId && candidate.network === "stellar:testnet" && candidate.chainType === "stellar"
    && (candidate.status === "active" || candidate.status === "pending"),
  );
  if (!wallet) {
    throw new Error("stellar_wallet_not_ready");
  }
  const account = await getStellarTestnetAccount(wallet.address);
  if (!account.exists) throw new Error("stellar_wallet_not_active");
  return { id: wallet.id, address: wallet.address, network: wallet.network };
}

function idempotencyKey(
  userId: string,
  input: z.infer<typeof prepareSchema>,
) {
  return createHash("sha256")
    .update(
      [
        "soroswap:testnet",
        userId,
        input.requestId,
        input.assetIn,
        input.assetOut,
        input.amount,
        input.slippageBps,
      ].join(":"),
    )
    .digest("hex");
}

function publicQuote(
  quote: Awaited<ReturnType<typeof getSoroswapQuote>>,
) {
  return {
    network: "Stellar Testnet",
    assetIn: quote.assetIn,
    assetOut: quote.assetOut,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    minimumAmountOut: quote.minimumAmountOut,
    priceImpactPct: quote.priceImpactPct,
    platform: quote.platform,
    slippageBps: quote.slippageBps,
    routePlan: quote.routePlan,
  };
}

function publicAction(row: typeof agentStellarActions.$inferSelect) {
  const preview = row.preview as SoroswapPreview;
  const hash = row.transactionHash?.replace(/^0x/, "") ?? null;
  return {
    id: row.id,
    action: row.action,
    status: row.status,
    signingAddress: row.walletAddress,
    signingHash:
      row.status === "prepared" && hash ? (`0x${hash}` as const) : null,
    transactionHash: hash,
    explorerUrl: hash
      ? SOROSWAP_TESTNET.explorerUrl + "/tx/" + hash
      : null,
    preview,
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
        eq(agentStellarActions.action, "soroswap.swap"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("soroswap_action_not_found");
  return rows[0];
}

async function prepareAction(
  userId: string,
  input: z.infer<typeof prepareSchema>,
) {
  const wallet = await userWallet(userId);
  const decision = await evaluateUserAction(userId, {
    actionType: "soroswap.swap.prepare",
    network: "stellar:testnet",
    asset: input.assetIn,
    amount: Number(input.amount),
    financial: true,
    irreversible: true,
  });
  if (!decision.allowed) {
    throw new Error("policy_blocked:" + decision.reasonCodes.join(","));
  }

  const quote = await getSoroswapQuote(input);
  const built = await buildSoroswapSwap({
    quote,
    walletAddress: wallet.address,
  });
  const transaction = transactionFromXdr(built.xdr);
  if (transaction.source !== wallet.address) {
    throw new Error("soroswap_transaction_source_mismatch");
  }
  const transactionHash = transaction.hash().toString("hex");
  const preview: SoroswapPreview = {
    title: `Swap ${quote.amountIn} ${quote.assetIn} for ${quote.assetOut}`,
    description:
      "Soroswap generated this unsigned Testnet transaction. Review the minimum output before authorizing Privy.",
    network: "Stellar Testnet",
    wallet: wallet.address,
    assetIn: quote.assetIn,
    assetOut: quote.assetOut,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    minimumAmountOut: quote.minimumAmountOut,
    priceImpactPct: quote.priceImpactPct,
    platform: quote.platform,
    slippageBps: quote.slippageBps,
  };
  const key = idempotencyKey(userId, input);
  await getDb()
    .insert(agentStellarActions)
    .values({
      id: randomUUID(),
      userId,
      walletId: wallet.id,
      walletAddress: wallet.address,
      action: "soroswap.swap",
      asset: quote.assetIn + "->" + quote.assetOut,
      amount: quote.amountIn,
      status: "prepared",
      idempotencyKey: key,
      preparedXdr: built.xdr,
      transactionHash,
      preview,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: agentStellarActions.idempotencyKey });

  const rows = await getDb()
    .select()
    .from(agentStellarActions)
    .where(eq(agentStellarActions.idempotencyKey, key))
    .limit(1);
  if (!rows[0]) throw new Error("soroswap_prepare_failed");
  return { replayed: rows[0].status !== "prepared", approval: publicAction(rows[0]) };
}

async function executeAction(
  userId: string,
  approvalId: string,
  clientSignature: string,
) {
  let action = await findAction(userId, approvalId);
  if (action.status === "confirmed") {
    return { replayed: true, approval: publicAction(action) };
  }
  if (action.expiresAt.getTime() < Date.now() && !action.signedXdr) {
    throw new Error("soroswap_approval_expired");
  }
  const prepared = transactionFromXdr(action.preparedXdr);
  const expectedHash = prepared.hash().toString("hex");
  if (action.transactionHash !== expectedHash) {
    throw new Error("soroswap_prepared_hash_mismatch");
  }

  let signedXdr = action.signedXdr;
  if (!signedXdr) {
    const signature = stellarClientSignatureBytes(clientSignature);
    signedXdr = attachStellarSignature(
      action.preparedXdr,
      action.walletAddress,
      signature,
    ).toXDR();
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
    const result = await sendSoroswapSwap(signedXdr);
    const resultHash = result.hash.replace(/^0x/, "");
    if (!/^[a-f0-9]{64}$/i.test(resultHash) || resultHash !== expectedHash) {
      throw new Error("soroswap_transaction_hash_mismatch");
    }
    const confirmedAt = new Date();
    await getDb()
      .update(agentStellarActions)
      .set({
        status: "confirmed",
        transactionHash: resultHash,
        confirmedAt,
        updatedAt: confirmedAt,
        error: null,
      })
      .where(eq(agentStellarActions.id, action.id));
    await getDb().insert(agentActivities).values({
      id: randomUUID(),
      userId,
      eventType: "soroswap.swap.confirmed",
      summary: `Soroswap Testnet swap confirmed: ${action.asset} ${action.amount}`,
      metadata: {
        actionId: action.id,
        transactionHash: resultHash,
        preview: action.preview,
      },
    });
    action = await findAction(userId, action.id);
    return { replayed: false, approval: publicAction(action) };
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "soroswap_send_failed";
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
    const recent = await getDb()
      .select()
      .from(agentStellarActions)
      .where(
        and(
          eq(agentStellarActions.userId, userId),
          eq(agentStellarActions.action, "soroswap.swap"),
        ),
      )
      .orderBy(desc(agentStellarActions.createdAt))
      .limit(10);
    return NextResponse.json(
      {
        configured: Boolean(process.env.SOROSWAP_API_KEY?.trim()),
        network: "Stellar Testnet",
        wallet: wallet.address,
        assets: SOROSWAP_TESTNET.assets,
        recent: recent.map(publicAction),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "soroswap_status_failed";
    const status =
      code === "invalid_origin"
        ? 403
        : code === "database_not_configured"
          ? 503
          : 401;
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
        await executeAction(
          userId,
          execute.data.approvalId,
          execute.data.signature,
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const prepare = prepareSchema.safeParse(body);
    if (prepare.success) {
      return NextResponse.json(await prepareAction(userId, prepare.data), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const quote = quoteSchema.parse(body);
    return NextResponse.json(
      { quote: publicQuote(await getSoroswapQuote(quote)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof z.ZodError
        ? "invalid_soroswap_request"
        : error instanceof Error
          ? error.message.split(":")[0]
          : "soroswap_action_failed";
    const status =
      code === "invalid_soroswap_request" ||
      code === "policy_blocked" ||
      code === "soroswap_approval_expired" ||
      code === "soroswap_amount_out_of_bounds" ||
      code === "soroswap_route_unavailable"
        ? 400
        : code === "invalid_origin"
          ? 403
          : code === "database_not_configured" ||
              code === "soroswap_not_configured"
            ? 503
            : code.startsWith("privy_")
              ? 401
              : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
