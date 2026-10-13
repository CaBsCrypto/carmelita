import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import { persistActivatedWallet } from "@/app/multichain-account";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import { getWalletNetwork } from "@/app/wallets/networks";
import { walletNetworkIdSchema } from "@/app/wallets/types";
import { hasDatabase } from "@/db";
import { readWalletListPanel, withPersonalPanelReadDeadline } from "@/app/queries/personal-panels";
import { publicMcpErrorCode } from "@/app/mcp/auth";
import { ensureTempoTestnetWallet } from "@/app/wallets/tempo-onboarding";
import { existingOAuthWalletsRequired } from "@/app/wallets/existing-wallet-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activationSchema = z.object({
  network: walletNetworkIdSchema,
  explicitUserConfirmation: z.literal(true),
}).strict();

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

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function authenticatedUser(request: Request) {
  const claims = await verifyPrivyAccessToken(bearerToken(request));
  const identity = await getPrivyUserIdentity(claims.user_id).catch(() => ({
    id: claims.user_id,
    email: null,
  }));
  return { userId: claims.user_id, email: identity.email };
}

export async function GET(request: Request) {
  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    return NextResponse.json(await withPersonalPanelReadDeadline(() => readWalletListPanel(claims.user_id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? publicMcpErrorCode(error) : "wallet_list_failed";
    return NextResponse.json({ error: code }, { status: code === "database_not_configured" || code === "read_query_timeout" ? 503 : 401 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!hasDatabase()) throw new Error("database_not_configured");
    const input = activationSchema.parse(await request.json());
    if (existingOAuthWalletsRequired() && input.network !== "tempo:moderato") {
      return NextResponse.json({ error: "existing_wallets_only" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const network = getWalletNetwork(input.network);
    if (network.rollout === "planned") {
      return NextResponse.json({ error: "network_not_available", network: network.id }, { status: 409 });
    }

    if (network.id === "tempo:moderato") {
      const result = await ensureTempoTestnetWallet({ ...user, signal: request.signal });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    const wallet = await getOrCreateUserWallet(user.userId, network.family);
    await persistActivatedWallet({
      userId: user.userId,
      email: user.email,
      wallet,
      network: network.id,
    });

    return NextResponse.json({
      wallet,
      network: {
        id: network.id,
        family: network.family,
        name: network.name,
        nativeAsset: network.nativeAsset,
        chainId: network.chainId,
        explorerUrl: network.explorerUrl,
        faucetUrl: network.faucetUrl,
        testUsdcAddress: network.testUsdcAddress,
        rollout: network.rollout,
      },
      fundsMoved: false,
      signingRequired: false,
    }, { status: wallet.created ? 201 : 200 });
  } catch (error) {
    const invalidInput = error instanceof z.ZodError;
    // Provider/transport exception text can contain URLs or credentials. Expose only known codes.
    const safeCodes = new Set([
      "invalid_privy_user_id", "invalid_wallet_networks", "invalid_wallet_status", "wallet_identity_conflict",
      "wallet_ownership_conflict", "wallet_response_mismatch", "privy_evm_wallet_ambiguous",
      "privy_stellar_wallet_ambiguous", "privy_solana_wallet_ambiguous", "privy_invalid_wallet_response",
      "privy_not_configured", "database_not_configured", "wallet_persistence_unavailable",
      "existing_evm_wallet_required", "tempo_disabled", "tempo_configuration_incomplete", "tempo_wrong_chain",
      "tempo_rpc_timeout", "tempo_rpc_unavailable", "tempo_rpc_invalid_response", "tempo_token_metadata_mismatch",
      "tempo_invalid_address",
    ]);
    const proposed = error instanceof Error ? error.message : "";
    const code = invalidInput || error instanceof SyntaxError ? "invalid_wallet_activation"
      : safeCodes.has(proposed) ? proposed : "wallet_activation_failed";
    const status = invalidInput || code.startsWith("invalid_")
      ? 400
      : code.includes("conflict") || code.includes("wallet_ambiguous") || code === "existing_evm_wallet_required"
        ? 409
      : code === "privy_not_configured" || code === "database_not_configured" || code === "wallet_persistence_unavailable"
        || code === "tempo_disabled" || code === "tempo_configuration_incomplete"
        ? 503
      : code.startsWith("tempo_") || code === "wallet_response_mismatch"
        ? 502
        : 401;
    return NextResponse.json({ error: code, ...(code === "existing_evm_wallet_required" ? { next: "create_evm_testnet_wallet" } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
