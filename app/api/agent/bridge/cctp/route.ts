import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildCctpFujiToStellarPlan,
  getCctpFujiToStellarFees,
} from "@/app/connectors/circle-cctp";
import { getCctpFujiToStellarContext } from "@/app/connectors/circle-cctp-context";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { listBridgeRoutes } from "@/app/cctp/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("routes") }).strict(),
  z.object({ action: z.literal("readiness") }).strict(),
  z.object({ action: z.literal("fees") }).strict(),
  z.object({
    action: z.literal("plan"),
    amount: z.string().trim().min(1).max(32),
    source: z.literal("avalanche:fuji"),
    destination: z.literal("stellar:testnet"),
  }).strict(),
]);

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_cctp_request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const input = parsed.data;
    if (input.action === "routes") {
      return NextResponse.json({ routes: listBridgeRoutes(), fundsMoved: false, transactionPrepared: false }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (input.action === "fees") {
      return NextResponse.json(await getCctpFujiToStellarFees(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const readiness = await getCctpFujiToStellarContext(claims.user_id);
    if (input.action === "readiness") {
      return NextResponse.json({
        route: "avalanche:fuji->stellar:testnet",
        readiness,
        fundsMoved: false,
        transactionPrepared: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!readiness.sourceAddress || !readiness.destinationAddress) {
      return NextResponse.json({
        error: "cctp_wallets_not_activated",
        readiness,
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const [plan, fees] = await Promise.all([
      Promise.resolve(buildCctpFujiToStellarPlan({
        amount: input.amount,
        sourceAddress: readiness.sourceAddress,
        destinationAddress: readiness.destinationAddress,
        readiness,
      })),
      getCctpFujiToStellarFees().catch(() => null),
    ]);
    return NextResponse.json({
      plan,
      fees,
      fundsMoved: false,
      transactionPrepared: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error
      ? error.message.split(":")[0]
      : "cctp_request_failed";
    const status = code.startsWith("cctp_fee_") ? 502
      : code.startsWith("cctp_") || code.startsWith("invalid_") ? 400
        : code === "database_not_configured" ? 503
          : 401;
    return NextResponse.json({ error: code }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
