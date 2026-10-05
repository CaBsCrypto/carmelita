export type BazaarListingKind = "service" | "suite" | "skill";
export type BazaarOperationPhase = "prepare" | "execute" | "status" | "history";

/** These are release gates, not provider-controlled feature flags. No accepted
 * server-to-server owner link or native purchase exists in the hosted contract.
 */
export function bazaarPurchaseReadiness() {
  return {
    version: "carmelita.bazaar-readiness/v1" as const,
    enabled: false as const,
    status: "blocked" as const,
    identityLink: {
      status: "unavailable" as const,
      code: "bazaar_owner_link_contract_unavailable" as const,
    },
    blockers: [
      "openai_commerce_compatibility_unresolved",
      "chatgpt_native_signature_not_verified",
      "bazaar_hosted_purchase_acceptance_pending",
      "bazaar_owner_link_contract_unavailable",
    ] as const,
    operations: {
      prepare: { enabled: false as const, code: "bazaar_native_purchase_blocked" as const },
      execute: { enabled: false as const, code: "bazaar_native_purchase_blocked" as const },
      status: { enabled: false as const, code: "bazaar_owner_link_contract_unavailable" as const },
      history: { enabled: false as const, code: "bazaar_owner_link_contract_unavailable" as const },
    },
  };
}

export function evaluateBazaarServiceReadiness(input: {
  published: boolean;
  providerAvailability?: unknown;
  kind: BazaarListingKind;
}) {
  return {
    kind: input.kind,
    publication: input.published ? "published" as const : "not_published" as const,
    // An upstream 'available' label is not operational acceptance. A negative
    // availability declaration can restrict discovery; it cannot enable actions.
    providerAvailability: input.providerAvailability === "unavailable"
      ? "unavailable" as const : "not_verified" as const,
    executable: false as const,
    purchase: bazaarPurchaseReadiness(),
  };
}

/** No credential, wallet/email claim or magic link can open these operations.
 * This guard performs no network, signing, storage or payment side effects.
 */
export function assertBazaarOperationEnabled(phase: BazaarOperationPhase): never {
  throw new Error(bazaarPurchaseReadiness().operations[phase].code);
}
