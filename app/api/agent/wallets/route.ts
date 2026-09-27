import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import { listPersistedUserWallets, persistActivatedWallet } from "@/app/multichain-account";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import { getWalletNetwork, isWalletNetworkEnabled, WALLET_NETWORKS } from "@/app/wallets/networks";
import { walletNetworkIdSchema } from "@/app/wallets/types";
import { hasDatabase } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activationSchema = z.object({
  network: walletNetworkIdSchema,
  explicitUserConfirmation: z.literal(true),
});

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
    const user = await authenticatedUser(request);
    const wallets = (await listPersistedUserWallets(user.userId))
      .filter((wallet) => isWalletNetworkEnabled(wallet.network))
      .map(({ id, walletId, address, chainType, network, status, updatedAt }) => ({ id, walletId, address, chainType, network, status, updatedAt }));
    return NextResponse.json({
      wallets,
      networks: Object.keys(WALLET_NETWORKS).map(getWalletNetwork).map((network) => ({
        id: network.id,
        family: network.family,
        name: network.name,
        nativeAsset: network.nativeAsset,
        rollout: network.rollout,
        active: wallets.some((wallet) => wallet.network === network.id),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "wallet_list_failed";
    return NextResponse.json({ error: code }, { status: code === "database_not_configured" ? 503 : 401 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const user = await authenticatedUser(request);
    if (!hasDatabase()) throw new Error("database_not_configured");
    const input = activationSchema.parse(await request.json());
    const network = getWalletNetwork(input.network);
    if (network.rollout === "planned") {
      return NextResponse.json({ error: "network_not_available", network: network.id }, { status: 409 });
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
    const code = invalidInput
      ? "invalid_wallet_activation"
      : error instanceof Error
        ? error.message.split(":")[0]
        : "wallet_activation_failed";
    const status = invalidInput || code.startsWith("invalid_")
      ? 400
      : code.includes("conflict") || code === "privy_evm_wallet_ambiguous"
        ? 409
      : code === "privy_not_configured" || code === "database_not_configured"
        ? 503
        : 401;
    return NextResponse.json({ error: code }, { status });
  }
}
