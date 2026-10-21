export const PREPARATION_FAMILIES = ["stellar", "evm", "solana"] as const;
export type PreparationFamily = typeof PREPARATION_FAMILIES[number];
export type PreparationStatus = "pending" | "running" | "complete" | "review" | "conflict";
export const RETRY_DELAY_MINUTES = [1, 5, 15, 60, 240] as const;
export const MAX_PREPARATION_ATTEMPTS = 6;
export const PREPARATION_LEASE_SECONDS = 120;
export const PREPARATION_ERROR_CODES = ["provider_unavailable", "provider_timeout", "database_unavailable", "identity_conflict", "ambiguous_identity", "configuration_invalid", "lease_expired", "preparation_failed"] as const;
export type PreparationErrorCode = typeof PREPARATION_ERROR_CODES[number];
export function safePreparationCode(code?: string): PreparationErrorCode {
  return PREPARATION_ERROR_CODES.includes(code as PreparationErrorCode) ? code as PreparationErrorCode : "preparation_failed";
}
export function retryDelaySeconds(attempt: number): number | null {
  return Number.isInteger(attempt) && attempt >= 1 && attempt < MAX_PREPARATION_ATTEMPTS ? RETRY_DELAY_MINUTES[attempt - 1] * 60 : null;
}
export type FamilyOutcome = { status: "complete" | "conflict" | "review" | "transient"; code?: string };
export function outcomeState(attempt: number, outcome: FamilyOutcome) {
  if (outcome.status === "complete") return { status: "complete" as const, retryable: false, delaySeconds: null, code: null };
  const delaySeconds = outcome.status === "transient" ? retryDelaySeconds(attempt) : null;
  return { status: outcome.status === "transient" ? (delaySeconds === null ? "review" as const : "pending" as const) : outcome.status,
    retryable: outcome.status === "transient", delaySeconds, code: safePreparationCode(outcome.code) };
}
