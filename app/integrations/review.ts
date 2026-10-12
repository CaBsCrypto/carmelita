import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasDatabase } from "@/db";
import { integrationRecommendations } from "@/db/schema";

export const proposalReviewSchema = z.object({
  status: z.enum(["in_review", "rejected", "accepted_for_pilot"]),
  reason: z.string().trim().min(3).max(1000),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  requestId: z.string().uuid(),
}).strict();
export type ProposalReviewInput = z.infer<typeof proposalReviewSchema>;
export type ProposalReviewState = "new" | ProposalReviewInput["status"];
export type ProposalReview = { id: string; status: string; version: number; reason: string | null; actor: string | null; reviewedAt: string | null };
export type ReviewRecord = ProposalReview & { requestId: string | null };
export type ProposalReviewStore = {
  find: (id: string) => Promise<ReviewRecord | null>;
  update: (id: string, input: ProposalReviewInput, actor: string, at: Date) => Promise<ReviewRecord | null>;
};
export class ProposalReviewError extends Error {
  constructor(readonly code: "not_found" | "version_conflict" | "storage_unavailable") { super(code); }
}
const STATUS_LABELS: Record<string, string> = { new: "Pending review", in_review: "In review", rejected: "Rejected", accepted_for_pilot: "Accepted for pilot" };
export const proposalStatusLabel = (status: string) => Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : status;
export function reviewReceipt(record: ReviewRecord): ProposalReview {
  return { id: record.id, status: record.status, version: record.version, reason: record.reason, actor: record.actor, reviewedAt: record.reviewedAt };
}
function replayMatches(record: ReviewRecord, input: ProposalReviewInput) {
  return record.requestId === input.requestId && record.status === input.status && record.reason === input.reason && record.version === input.expectedVersion + 1;
}
// Acceptance is a private review decision only. This module never imports an
// adapter, fetches a submitted URL, publishes a registry entry or installs an app.
export async function applyProposalReview(store: ProposalReviewStore, id: string, input: ProposalReviewInput, actor: string, at = new Date()) {
  const before = await store.find(id);
  if (!before) throw new ProposalReviewError("not_found");
  if (before.requestId === input.requestId) {
    if (!replayMatches(before, input)) throw new ProposalReviewError("version_conflict");
    return { review: reviewReceipt(before), replayed: true };
  }
  if (before.version !== input.expectedVersion) throw new ProposalReviewError("version_conflict");
  const changed = await store.update(id, input, actor, at);
  if (changed) return { review: reviewReceipt(changed), replayed: false };
  // Concurrent duplicate decisions share the first receipt; a different edit
  // cannot replace a review whose version changed while this request ran.
  const current = await store.find(id);
  if (!current) throw new ProposalReviewError("not_found");
  if (replayMatches(current, input)) return { review: reviewReceipt(current), replayed: true };
  throw new ProposalReviewError("version_conflict");
}
function record(row: typeof integrationRecommendations.$inferSelect): ReviewRecord {
  return { id: row.id, status: row.status, version: row.reviewVersion, reason: row.reviewReason, actor: row.reviewActor, reviewedAt: row.reviewedAt?.toISOString() ?? null, requestId: row.reviewRequestId };
}
const databaseStore: ProposalReviewStore = {
  async find(id) {
    const [row] = await getDb().select().from(integrationRecommendations).where(eq(integrationRecommendations.id, id)).limit(1);
    return row ? record(row) : null;
  },
  async update(id, input, actor, at) {
    const [row] = await getDb().update(integrationRecommendations).set({ status: input.status, reviewVersion: input.expectedVersion + 1, reviewReason: input.reason, reviewActor: actor, reviewedAt: at, reviewRequestId: input.requestId, updatedAt: at }).where(and(eq(integrationRecommendations.id, id), eq(integrationRecommendations.reviewVersion, input.expectedVersion))).returning();
    return row ? record(row) : null;
  },
};
export async function reviewServiceProposal(id: string, input: ProposalReviewInput, actor: string) {
  if (!hasDatabase()) throw new ProposalReviewError("storage_unavailable");
  return applyProposalReview(databaseStore, id, input, actor);
}
