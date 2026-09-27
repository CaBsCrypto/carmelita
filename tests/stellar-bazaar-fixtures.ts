import { STELLAR_TESTNET_CAIP2, USDC_TESTNET_ADDRESS } from "@x402/stellar";
import { STELLAR_BAZAAR_PROVIDER_ALLOWLIST } from "../app/stellar-bazaar/config";

export const BAZAAR_WI_PROVIDER_ORIGIN =
  STELLAR_BAZAAR_PROVIDER_ALLOWLIST[0];

// Official Testnet USDC issuer: a struct-valid, well-known G address so
// Phase-2 StrKey checks behave the same as against a live destination.
export const BAZAAR_FIXTURE_DESTINATION =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export function bazaarWebsiteIntelligenceCard(overrides: Record<string, unknown> = {}) {
  return {
    version: "bazaar.service-card/v0",
    id: "website-intelligence",
    name: "Website Intelligence",
    description: "Audita un sitio web y devuelve hallazgos SEO, accesibilidad y rendimiento.",
    kind: "http",
    url: `${BAZAAR_WI_PROVIDER_ORIGIN}/v1/x402/audits`,
    routeTemplate: `${BAZAAR_WI_PROVIDER_ORIGIN}/v1/x402/audits`,
    input: [
      { name: "url", type: "string", required: true },
      { name: "language", type: "string", required: false },
    ],
    network: "stellar:testnet",
    payment: {
      scheme: "exact",
      asset: "USDC",
      amount: "0.001",
      destination: BAZAAR_FIXTURE_DESTINATION,
    },
    provider: { name: "Website Intelligence" },
    tags: ["audit", "seo", "x402"],
    delivery: {
      mode: "sync",
      result: { hash: { algorithm: "sha256", required: true, scope: "canonical-result" } },
    },
    ...overrides,
  };
}

export function bazaarSearchResponse(input: {
  cards?: { resource: unknown; score: number; reasons: string[] }[];
  query?: string;
  partialResults?: boolean;
  dynamicRegistry?: "available" | "unavailable";
} = {}) {
  return {
    ok: true,
    query: input.query ?? "informe",
    ranking: {
      version: "lexical-v1",
      method: "exact token weights: name 5, tag 3, asset 3, kind 2, description 1",
      ai: false,
    },
    results: input.cards ?? [
      { resource: bazaarWebsiteIntelligenceCard(), score: 5, reasons: ["name:website"] },
    ],
    nextCursor: null,
    partialResults: input.partialResults ?? false,
    dynamicRegistry: input.dynamicRegistry ?? "available",
  };
}

export function bazaarChallengeRequirements(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: STELLAR_TESTNET_CAIP2,
        asset: USDC_TESTNET_ADDRESS,
        amount: "10000",
        payTo: BAZAAR_FIXTURE_DESTINATION,
        maxTimeoutSeconds: 120,
        extra: { areFeesSponsored: true },
        ...overrides,
      },
    ],
    error: "X402 payment required",
  };
}

/** Frozen POST request the Phase-2 prepare_bazaar snapshot must reproduce exactly. */
export function bazaarFrozenWebsiteIntelligenceRequest() {
  const body = JSON.stringify({ url: "https://example.com", language: "es" });
  return {
    method: "POST" as const,
    url: `${BAZAAR_WI_PROVIDER_ORIGIN}/v1/x402/audits`,
    body,
    version: 2,
    scheme: "exact" as const,
    network: STELLAR_TESTNET_CAIP2,
    asset: USDC_TESTNET_ADDRESS,
    amount: "10000",
    amountDisplay: "0.0010000",
    payTo: BAZAAR_FIXTURE_DESTINATION,
    sponsored: true,
    maxTimeoutSeconds: 120,
    serviceCardId: "website-intelligence",
  };
}
