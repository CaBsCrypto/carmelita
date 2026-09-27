import { createHash } from "node:crypto";
import type { PaymentRequirements } from "@x402/core/types";
import { StrKey } from "@stellar/stellar-sdk";
import { X402_TESTNET_RESOURCE, X402_TESTNET_USDC, X402_DEMO_LIMIT_ATOMIC } from "./assets";

export type FrozenX402Request = {
  method: "GET";
  url: typeof X402_TESTNET_RESOURCE;
  version: 2;
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  sponsored: true;
  maxTimeoutSeconds: number;
};

export function freezeX402Request(version: number, requirement: PaymentRequirements): FrozenX402Request {
  if (version !== 2 || requirement.scheme !== "exact" ||
    requirement.network !== X402_TESTNET_USDC.network || requirement.asset !== X402_TESTNET_USDC.contract ||
    !/^[1-9]\d*$/.test(requirement.amount) || BigInt(requirement.amount) > X402_DEMO_LIMIT_ATOMIC ||
    (!StrKey.isValidEd25519PublicKey(requirement.payTo) && !StrKey.isValidContract(requirement.payTo)) ||
    requirement.extra?.areFeesSponsored !== true || !Number.isSafeInteger(requirement.maxTimeoutSeconds) ||
    requirement.maxTimeoutSeconds < 15 || requirement.maxTimeoutSeconds > 3600) {
    throw new Error("x402_request_conditions_invalid");
  }
  return { method: "GET", url: X402_TESTNET_RESOURCE, version: 2, scheme: "exact",
    network: requirement.network, asset: requirement.asset, amount: requirement.amount,
    payTo: requirement.payTo, sponsored: true, maxTimeoutSeconds: requirement.maxTimeoutSeconds };
}

export function x402RequestHash(request: FrozenX402Request): string {
  const canonical = freezeX402Request(request.version, {
    scheme: request.scheme, network: request.network as `${string}:${string}`, asset: request.asset,
    amount: request.amount, payTo: request.payTo, maxTimeoutSeconds: request.maxTimeoutSeconds,
    extra: { areFeesSponsored: request.sponsored },
  });
  if (request.method !== canonical.method || request.url !== canonical.url) throw new Error("x402_request_changed");
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** A missing balance is a failed preflight, never an invitation to fund the wallet. */
export function assertX402Preconditions(account: {
  exists: boolean;
  balances: Array<{ asset: string; issuer?: string | null; balance: string }>;
}, amountAtomic: string) {
  if (!account.exists) throw new Error("x402_stellar_account_not_active");
  const usdc = account.balances.find(b => b.asset === "USDC" && b.issuer === X402_TESTNET_USDC.issuer);
  if (!usdc) throw new Error("x402_usdc_trustline_required");
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(usdc.balance);
  if (!match) throw new Error("x402_usdc_balance_invalid");
  const balance = BigInt(match[1]) * BigInt(10_000_000) + BigInt((match[2] ?? "").padEnd(7, "0"));
  if (balance < BigInt(amountAtomic)) throw new Error("x402_usdc_balance_insufficient");
}
