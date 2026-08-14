import { createHash } from "node:crypto";
import type { Wallet } from "@privy-io/node";
import { StrKey } from "@stellar/stellar-sdk";
import { getPrivyClient } from "@/app/privy-client";
import {
  PRIVY_CHAIN_TYPE_BY_FAMILY,
  type UserWallet,
  type WalletFamily,
} from "@/app/wallets/types";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidWalletAddress(family: WalletFamily, address: string) {
  if (family === "stellar") return StrKey.isValidEd25519PublicKey(address);
  if (family === "evm") return EVM_ADDRESS.test(address);
  return SOLANA_ADDRESS.test(address);
}

export function getPrivyUserWalletExternalId(userId: string, family: WalletFamily) {
  const digest = createHash("sha256").update(userId).digest("hex");
  return `aa_${PRIVY_CHAIN_TYPE_BY_FAMILY[family]}_${digest.slice(0, 40)}`;
}

type PrivyWalletCandidate = {
  id?: string;
  address?: string;
  chain_type?: string;
  external_id?: string | null;
};

export function findExactPrivyWallet(
  wallets: PrivyWalletCandidate[],
  externalId: string,
) {
  return wallets.find((wallet) => wallet.external_id === externalId);
}

async function listUserWallets(userId: string, family: WalletFamily) {
  const chainType = PRIVY_CHAIN_TYPE_BY_FAMILY[family];
  const result = await getPrivyClient().wallets().list({
    user_id: userId,
    chain_type: chainType,
    limit: 100,
  });
  return result.data.filter(
    (wallet: Wallet) => wallet.chain_type === chainType && isValidWalletAddress(family, wallet.address),
  );
}

function normalizeUserWallet(
  wallet: { id: string; address: string; chain_type: string },
  family: WalletFamily,
  created: boolean,
): UserWallet {
  const expectedChainType = PRIVY_CHAIN_TYPE_BY_FAMILY[family];
  if (wallet.chain_type !== expectedChainType || !isValidWalletAddress(family, wallet.address)) {
    throw new Error("privy_invalid_wallet_response");
  }
  return {
    id: wallet.id, address: wallet.address, family,
    chainType: expectedChainType, created, owner: "user",
  };
}

export async function getOrCreateUserWallet(userId: string, family: WalletFamily) {
  if (!userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");

  const chainType = PRIVY_CHAIN_TYPE_BY_FAMILY[family];
  const externalId = getPrivyUserWalletExternalId(userId, family);
  const current = await listUserWallets(userId, family);
  // Older Carmelita versions used a different external_id for Stellar.
  // Reuse a valid wallet already owned by this Privy user instead of creating
  // a second wallet merely because the deterministic identifier changed.
  const existing = findExactPrivyWallet(current, externalId) ?? current[0];
  if (existing?.id && existing.address) return normalizeUserWallet(existing as { id: string; address: string; chain_type: string }, family, false);

  try {
    const wallet = await getPrivyClient().wallets().create({
      chain_type: chainType,
      display_name: `Carmelita ${family.toUpperCase()} Wallet`,
      external_id: externalId,
      owner: { user_id: userId },
      idempotency_key: externalId,
    });
    return normalizeUserWallet(wallet, family, true);
  } catch (error) {
    const afterRace = await listUserWallets(userId, family).catch(() => []);
    const recovered = findExactPrivyWallet(afterRace, externalId) ?? afterRace[0];
    if (recovered?.id && recovered.address) return normalizeUserWallet(recovered as { id: string; address: string; chain_type: string }, family, false);
    throw error;
  }
}

export async function listUserWalletFamilies(userId: string) {
  const families = ["stellar", "evm", "solana"] as const;
  const entries = await Promise.all(families.map(async (family) => {
    const wallets = await listUserWallets(userId, family);
    return [family, wallets.map((wallet) => normalizeUserWallet(wallet, family, false))] as const;
  }));
  return Object.fromEntries(entries) as Record<WalletFamily, UserWallet[]>;
}
