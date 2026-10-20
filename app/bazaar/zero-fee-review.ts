import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";

type Json = Record<string, unknown>;
const issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const contract = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
function invalid(): never { throw Error("bazaar_native_review_unsupported"); }
function object(v: unknown): Json { if (!v || typeof v !== "object" || Array.isArray(v)) return invalid(); return v as Json; }
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, value]) => [k, canonical(value)]));
  return v;
}
/** A display-only review of the current card. Never an intent, reservation,
 * signing challenge or approval. No operation identifier is allocated. */
export function reviewZeroFeeCard(raw: unknown, expectedHash: string) {
  const card = object(raw), payment = object(card.payment);
  const identity = object(payment.identity), marketplace = object(payment.marketplace);
  const hash = createHash("sha256").update(JSON.stringify(canonical(card))).digest("hex");
  if (hash !== expectedHash) throw Error("bazaar_native_card_changed");
  if (card.network !== "stellar:testnet" || payment.scheme !== "exact" || payment.asset !== "USDC"
    || identity.code !== "USDC" || identity.issuer !== issuer || identity.sacContract !== contract
    || identity.kind !== "stellar-classic-credit" || identity.network !== "stellar:testnet"
    || marketplace.protocol !== "x402-stellar-exact-v2" || marketplace.resourceTemplate !== "/api/market/orders/{operationId}/x402"
    || card.version !== "bazaar.service-card/v0" || card.kind !== "http" || card.paymentOptions !== undefined
    || typeof payment.destination !== "string" || !StrKey.isValidEd25519PublicKey(payment.destination)
    || typeof payment.amount !== "string" || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,7})?$/.test(payment.amount)) invalid();
  const [whole, fraction = ""] = payment.amount.split(".");
  const atoms = BigInt(whole) * BigInt(10_000_000) + BigInt(fraction.padEnd(7, "0"));
  if (atoms <= BigInt(0) || atoms > BigInt("9223372036854775807")) invalid();
  // No amount arithmetic through floating point and no split-policy fallback.
  return { protocol: "x402-stellar-exact-v2" as const, network: "stellar:testnet" as const,
    asset: "USDC" as const, issuer, contract, decimals: 7, amount: payment.amount,
    grossAtoms: atoms.toString(), sellerAtoms: atoms.toString(), feeAtoms: "0", feeBps: 0,
    recipient: payment.destination, cardHash: hash, commissionEnabled: false,
    orderCreated: false, signatureRequested: false, paymentSubmitted: false,
    purchaseAuthorized: false, capacityReserved: false, budgetVerified: false, readOnly: true };
}
