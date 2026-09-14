import { z } from "zod";
import {
  X402_DEMO_LIMIT_ATOMIC,
  X402_TESTNET_USDC,
  atomicToDisplay,
} from "@/app/x402/assets";
import { getStellarBazaarConfig } from "@/app/stellar-bazaar/config";

export const bazaarServiceCardSchema = z.object({
  version: z.literal("bazaar.service-card/v0"),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  kind: z.enum(["http", "mcp"]),
  url: z.string().url(),
  routeTemplate: z.string().max(500),
  input: z.array(
    z.object({
      name: z.string().min(1).max(100),
      type: z.enum(["string", "number", "boolean"]),
      required: z.boolean(),
    }),
  ).max(50),
  network: z.literal("stellar:testnet"),
  payment: z.object({
    scheme: z.enum(["exact", "upto", "split-exact"]),
    asset: z.string().min(1).max(200),
    amount: z.string().regex(/^\d+(\.\d{1,7})?$/).max(30),
    destination: z.string().min(1).max(200),
  }),
  provider: z.object({ name: z.string().min(1).max(200) }),
  tags: z.array(z.string().max(100)).max(50),
  delivery: z
    .object({
      mode: z.enum(["sync", "async"]),
      result: z.object({
        hash: z.object({
          algorithm: z.literal("sha256"),
          required: z.literal(true),
        }),
      }),
    })
    .optional(),
});
export type BazaarServiceCard = z.infer<typeof bazaarServiceCardSchema>;

const searchResponseSchema = z.object({
  ok: z.literal(true),
  query: z.string(),
  ranking: z.object({ version: z.string(), method: z.string(), ai: z.boolean() }),
  results: z
    .array(
      z.object({
        resource: z.unknown(),
        score: z.number().finite(),
        reasons: z.array(z.string().max(200)).max(20),
      }),
    )
    .max(100),
  nextCursor: z.null(),
  partialResults: z.boolean(),
  dynamicRegistry: z.enum(["available", "unavailable"]),
});

export type StellarBazaarOffer = {
  id: string;
  name: string;
  description: string;
  provider: string;
  kind: BazaarServiceCard["kind"];
  url: string;
  routeTemplate: string;
  network: BazaarServiceCard["network"];
  scheme: BazaarServiceCard["payment"]["scheme"];
  assetSymbol: string;
  amountDecimal: string;
  amountAtomic: string;
  amountDisplay: string;
  destination: string;
  input: BazaarServiceCard["input"];
  tags: string[];
  score: number;
  reasons: string[];
  consumable: boolean;
  unavailableReason: string | null;
};

export type StellarBazaarSearch = {
  query: string;
  rankingVersion: string;
  offers: StellarBazaarOffer[];
  rejectedCards: number;
  partialResults: boolean;
  dynamicRegistry: "available" | "unavailable";
  source: "stellar-bazaar";
};

/**
 * Exact decimal-to-atomic conversion at USDC's 7 decimals. Money never goes
 * through parseFloat: the regex already bounds the scale and BigInt keeps the
 * arithmetic lossless.
 */
export function decimalAmountToAtomic(amount: string, decimals = 7): bigint {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount);
  if (!match) throw new Error("stellar_bazaar_amount_invalid");
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  // BigInt literals are unavailable at the repo's ES2017 tsconfig target.
  const scale = BigInt(10) ** BigInt(decimals);
  return BigInt(match[1]) * scale + BigInt(fraction || "0");
}

export function normalizeBazaarOffer(
  card: BazaarServiceCard,
  meta: { score: number; reasons: string[] },
): StellarBazaarOffer {
  let amountAtomic: bigint;
  try {
    amountAtomic = decimalAmountToAtomic(card.payment.amount);
  } catch {
    throw new Error("stellar_bazaar_amount_invalid");
  }
  const reasons: string[] = [];
  if (card.payment.scheme !== "exact") reasons.push("payment_scheme_not_exact");
  if (card.payment.asset.trim().toUpperCase() !== X402_TESTNET_USDC.code) {
    reasons.push("asset_symbol_not_usdc");
  }
  if (amountAtomic > X402_DEMO_LIMIT_ATOMIC) reasons.push("amount_over_spending_cap");
  if (amountAtomic <= BigInt(0)) reasons.push("amount_must_be_positive");
  if (!card.delivery) reasons.push("delivery_contract_missing");
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    provider: card.provider.name,
    kind: card.kind,
    url: card.url,
    routeTemplate: card.routeTemplate,
    network: card.network,
    scheme: card.payment.scheme,
    assetSymbol: card.payment.asset.trim().toUpperCase(),
    amountDecimal: card.payment.amount,
    amountAtomic: amountAtomic.toString(),
    amountDisplay: atomicToDisplay(amountAtomic.toString()),
    destination: card.payment.destination,
    input: card.input,
    tags: card.tags,
    score: meta.score,
    reasons: meta.reasons,
    consumable: reasons.length === 0,
    unavailableReason: reasons[0] ?? null,
  };
}

function bazaarFailure(code: string): never {
  throw new Error(code);
}

async function fetchBazaarJson(
  url: string,
  fetcher: typeof fetch,
  timeoutMs: number,
  failureCode: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return bazaarFailure(failureCode);
  }
  if (!response.ok) return bazaarFailure(failureCode);
  try {
    return await response.json();
  } catch {
    return bazaarFailure("stellar_bazaar_invalid_response");
  }
}

export async function searchStellarBazaar(
  query: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<StellarBazaarSearch> {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    bazaarFailure("stellar_bazaar_query_invalid");
  }
  const config = getStellarBazaarConfig();
  if (!config.enabled || !config.baseUrl) {
    bazaarFailure("stellar_bazaar_unavailable");
  }
  const endpoint = `${config.baseUrl}/api/discovery/search?query=${encodeURIComponent(trimmed)}`;
  const body = await fetchBazaarJson(
    endpoint,
    options.fetcher ?? fetch,
    options.timeoutMs ?? 15_000,
    "stellar_bazaar_unavailable",
  );
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) bazaarFailure("stellar_bazaar_invalid_response");
  const offers: StellarBazaarOffer[] = [];
  let rejectedCards = 0;
  for (const item of parsed.data.results) {
    const card = bazaarServiceCardSchema.safeParse(item.resource);
    if (!card.success) {
      rejectedCards += 1;
      continue;
    }
    offers.push(normalizeBazaarOffer(card.data, { score: item.score, reasons: item.reasons }));
  }
  return {
    query: parsed.data.query,
    rankingVersion: parsed.data.ranking.version,
    offers,
    rejectedCards,
    partialResults: parsed.data.partialResults,
    dynamicRegistry: parsed.data.dynamicRegistry,
    source: "stellar-bazaar",
  };
}
