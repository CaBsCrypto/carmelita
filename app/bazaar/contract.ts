import { z } from "zod";

/** A consumer requirement, not a claim that Bazaar exposes this protocol.
 * Endpoint paths, issuer and scopes must come from its accepted hosted contract.
 */
export const BAZAAR_REQUIRED_CONSUMPTION_CONTRACT = {
  version: "carmelita.bazaar-consumption/v1",
  ownerBinding: "server_verified_oauth_subject_to_owner",
  clientOwnerSelectors: false,
  historyCredentialAuthorizesPurchase: false,
  operations: {
    prepare: { ownerBound: true, spendingAuthorized: false, frozenTerms: true },
    execute: { ownerBound: true, separateWritePermission: true, exactApproval: true, expiringApproval: true, replayReturnsOriginal: true },
    status: { ownerBound: true, readOnly: true, paymentAndDeliverySeparate: true },
    history: { ownerBound: true, readOnly: true, durableResults: true },
  },
} as const;

const reportSchema = z.object({
  protocolVersion: z.literal("bazaar.operation-report/v1").optional(),
  operationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/),
  orderStatus: z.enum(["pending", "ordered", "failed", "unknown"]),
  paymentStatus: z.enum(["not-requested", "reported-unverified", "failed", "unknown"]),
  deliveryStatus: z.enum(["pending", "reported-delivered", "failed", "unknown"]),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
}).strict();

/** Normalize a report without promoting it to an independently verified receipt.
 * This is a local DTO; no private history endpoint is called by this module.
 */
export function normalizeBazaarOperationReport(input: unknown, now = Date.now()) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success || !Number.isFinite(now)) throw new Error("bazaar_operation_report_invalid");
  const report = parsed.data;
  const expired = report.expiresAt !== undefined && Date.parse(report.expiresAt) <= now;
  return {
    version: "carmelita.bazaar-operation-observation/v1" as const,
    operationId: report.operationId,
    order: { status: report.orderStatus, evidence: "reported" as const },
    payment: { status: report.paymentStatus, independentlyVerified: false as const },
    delivery: { status: report.deliveryStatus, evidence: "reported" as const },
    paymentConfirmed: false as const,
    receipt: null,
    authorization: {
      usable: false as const,
      expired,
      blockers: [
        ...(!report.protocolVersion ? ["bazaar_operation_protocol_missing" as const] : []),
        ...(expired ? ["bazaar_operation_approval_expired" as const] : []),
        "bazaar_authenticated_operation_contract_unavailable" as const,
      ],
    },
  };
}
