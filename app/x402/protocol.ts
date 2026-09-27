import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createHash } from "node:crypto";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayloadResult,
  PaymentRequired,
  PaymentRequirements,
  SchemeNetworkClient,
  SettleResponse,
} from "@x402/core/types";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { ClientStellarSigner } from "@x402/stellar";
import {
  atomicToDisplay,
  isOfficialX402TestnetUsdc,
  X402_DEMO_LIMIT_ATOMIC,
  X402_TESTNET_RESOURCE,
} from "@/app/x402/assets";
import { freezeX402Request, x402RequestHash, type FrozenX402Request } from "./request";

export type FrozenX402Requirement = {
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  scheme?: string;
  sponsored?: boolean;
  maxTimeoutSeconds?: number;
};

export function selectSafeX402Requirement(
  paymentRequired: PaymentRequired,
): PaymentRequirements {
  const accepted = paymentRequired.accepts.find(
    (requirement) =>
      requirement.scheme === "exact" &&
      isOfficialX402TestnetUsdc(requirement) &&
      /^\d+$/.test(requirement.amount) &&
      BigInt(requirement.amount) > BigInt(0) &&
      BigInt(requirement.amount) <= X402_DEMO_LIMIT_ATOMIC,
  );
  if (!accepted) throw new Error("x402_safe_testnet_option_not_found");
  return accepted;
}

export function freezeRequirement(
  requirement: PaymentRequirements,
): FrozenX402Requirement {
  return {
    network: requirement.network,
    asset: requirement.asset,
    amount: requirement.amount,
    payTo: requirement.payTo,
    scheme: requirement.scheme,
    sponsored: requirement.extra?.areFeesSponsored === true,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
  };
}

export function sameRequirement(
  requirement: PaymentRequirements,
  frozen: FrozenX402Requirement,
) {
  return (
    requirement.network === frozen.network &&
    requirement.asset === frozen.asset &&
    requirement.amount === frozen.amount &&
    requirement.payTo === frozen.payTo &&
    requirement.scheme === frozen.scheme &&
    requirement.extra?.areFeesSponsored === frozen.sponsored &&
    requirement.maxTimeoutSeconds === frozen.maxTimeoutSeconds
  );
}

export async function inspectX402Resource(resourceUrl: string, fetcher: typeof fetch = fetch) {
  if (resourceUrl !== X402_TESTNET_RESOURCE) throw new Error("x402_resource_not_allowed");
  const response = await fetcher(resourceUrl, {
    headers: { Accept: "application/json, text/html;q=0.9" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 402) throw new Error("x402_resource_did_not_challenge");
  const encoded = response.headers.get("PAYMENT-REQUIRED");
  if (!encoded) throw new Error("x402_payment_required_header_missing");
  const paymentRequired = decodePaymentRequiredHeader(encoded);
  const requirement = selectSafeX402Requirement(paymentRequired);
  freezeX402Request(paymentRequired.x402Version, requirement);
  return {
    paymentRequired,
    requirement,
    amountDisplay: atomicToDisplay(requirement.amount),
  };
}

export async function payX402Resource(input: {
  resourceUrl: string;
  signer: ClientStellarSigner;
  frozen: FrozenX402Requirement;
}) {
  const client = new x402Client()
    .register("stellar:*", new ExactStellarScheme(input.signer))
    .registerPolicy((_version, requirements) =>
      requirements.filter((requirement) =>
        sameRequirement(requirement, input.frozen),
      ),
    );
  return fetchPaidOnce({ ...input, client });
}

export async function payPreparedX402Resource(input: {
  resourceUrl: string;
  frozen: FrozenX402Requirement;
  x402Version: number;
  transaction: string;
  request?: FrozenX402Request;
  onSettlement?: (settlement: SettleResponse | null) => Promise<void>;
  fetcher?: typeof fetch;
}) {
  const preparedScheme: SchemeNetworkClient = {
    scheme: "exact",
    createPaymentPayload: async (
      x402Version,
      requirement,
    ): Promise<PaymentPayloadResult> => {
      if (x402Version !== input.x402Version) {
        throw new Error("x402_protocol_version_changed");
      }
      if (!sameRequirement(requirement, input.frozen)) {
        throw new Error("x402_live_requirement_changed");
      }
      return {
        x402Version,
        payload: { transaction: input.transaction },
      };
    },
  };
  const client = new x402Client()
    .register("stellar:*", preparedScheme)
    .registerPolicy((_version, requirements) =>
      requirements.filter((requirement) =>
        sameRequirement(requirement, input.frozen),
      ),
    );
  return fetchPaidOnce({ ...input, client });
}

/** One challenge and at most one paid GET. Recovery never enters this function. */
async function fetchPaidOnce(input: {
  resourceUrl: string;
  client: x402Client;
  frozen: FrozenX402Requirement;
  request?: FrozenX402Request;
  onSettlement?: (settlement: SettleResponse | null) => Promise<void>;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const live = await inspectX402Resource(input.resourceUrl, fetcher);
  if (!sameRequirement(live.requirement, input.frozen)) throw new Error("x402_live_requirement_changed");
  if (input.request && x402RequestHash(input.request) !==
    x402RequestHash(freezeX402Request(live.paymentRequired.x402Version, live.requirement))) {
    throw new Error("x402_live_requirement_changed");
  }
  const payload = await input.client.createPaymentPayload(live.paymentRequired);
  const headers = new x402HTTPClient(input.client).encodePaymentSignatureHeader(payload);
  const response = await fetcher(input.resourceUrl, {
    method: "GET", headers: { Accept: "application/json, text/html;q=0.9", ...headers },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000),
  });

  const encodedSettlement =
    response.headers.get("PAYMENT-RESPONSE") ??
    response.headers.get("X-PAYMENT-RESPONSE");
  let settlement: SettleResponse | null = null;
  try { settlement = encodedSettlement ? decodePaymentResponseHeader(encodedSettlement) : null; }
  catch { /* The network verifier can recover a missing or malformed receipt. */ }
  await input.onSettlement?.(settlement);
  if (!response.ok) throw new Error(`x402_payment_failed_${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 1_048_576) throw new Error("x402_resource_too_large");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
  }
  if (!bytes) throw new Error("x402_resource_empty");
  let resource: string;
  try { resource = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
  catch { throw new Error("x402_resource_encoding_invalid"); }

  return {
    settlement,
    resourceBody: resource,
    resourcePreview: resource.slice(0, 4_000),
    resourceStatus: response.status,
    resourceContentType: contentType,
    resourceSha256: createHash("sha256").update(resource).digest("hex"),
  };
}
