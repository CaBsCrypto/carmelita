import { registeredBazaarDefinition, BAZAAR_PROFILE_HASH } from "./bazaar-profile";
import { createSqlAppStore, type AppStore } from "./store";
import type { AppDefinition } from "./types";

export type PublicAppDefinition = Omit<AppDefinition, "evidence">;
export function publicAppDefinition({ evidence: _evidence, ...definition }: AppDefinition): PublicAppDefinition {
  void _evidence; return definition;
}
export async function readRegisteredApp(appId: string, store: AppStore): Promise<AppDefinition> {
  if (appId !== "bazaar") throw new Error("app_not_registered");
  const local = registeredBazaarDefinition(), reviewed = await store.definition(appId);
  if (!reviewed) return local;
  if (reviewed.version !== local.version || reviewed.adapter !== local.adapter || reviewed.definitionHash !== BAZAAR_PROFILE_HASH) return local;
  return { ...local, approval: reviewed.approval, approvalRevision: reviewed.approvalRevision, evidence: reviewed.evidence };
}
export async function approveRegisteredApp(input: { appId: string; reviewer: string; evidence: string; expectedVersion: string; expectedApprovalRevision?: number }, store: AppStore = createSqlAppStore()) {
  const local = registeredBazaarDefinition();
  if (input.appId !== local.id || input.expectedVersion !== local.version) throw new Error("app_review_conflict");
  if (!input.reviewer.trim() || input.reviewer.length > 120 || !input.evidence.trim() || input.evidence.length > 1000) throw new Error("app_review_invalid");
  const previous = await store.definition(input.appId);
  if (input.expectedApprovalRevision !== undefined && input.expectedApprovalRevision !== (previous?.approvalRevision ?? 0)) throw new Error("app_review_conflict");
  return store.saveDefinition({ ...local, approval: "approved", approvalRevision: (previous?.approvalRevision ?? 0) + 1,
    evidence: JSON.stringify({ reviewer: input.reviewer.trim(), reference: input.evidence.trim() }) }, previous?.approvalRevision ?? 0);
}
export async function suspendRegisteredApp(input: { appId: string; reviewer: string; evidence: string; expectedVersion: string; expectedApprovalRevision?: number }, store: AppStore = createSqlAppStore()) {
  const local = registeredBazaarDefinition();
  if (input.appId !== local.id || input.expectedVersion !== local.version || !input.reviewer.trim() || !input.evidence.trim() || input.reviewer.length > 120 || input.evidence.length > 1000) throw new Error("app_review_invalid");
  const previous = await store.definition(input.appId); if (!previous) throw new Error("app_review_conflict");
  if (input.expectedApprovalRevision !== undefined && input.expectedApprovalRevision !== previous.approvalRevision) throw new Error("app_review_conflict");
  return store.saveDefinition({ ...local, approval: "suspended", approvalRevision: previous.approvalRevision + 1,
    evidence: JSON.stringify({ reviewer: input.reviewer.trim(), reference: input.evidence.trim() }) }, previous.approvalRevision);
}
