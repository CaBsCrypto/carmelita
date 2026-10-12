import assert from "node:assert/strict";
import test from "node:test";
import { applyProposalReview, ProposalReviewError, proposalReviewSchema, proposalStatusLabel, type ProposalReviewStore, type ReviewRecord } from "../app/integrations/review";

const id = "11111111-1111-4111-8111-111111111111";
const input = { status: "accepted_for_pilot" as const, reason: "Review a read-only adapter in a private pilot.", expectedVersion: 0, requestId: "22222222-2222-4222-8222-222222222222" };
function memory() {
  let row: ReviewRecord | null = { id, status: "new", version: 0, reason: null, actor: null, reviewedAt: null, requestId: null };
  let writes = 0;
  const store: ProposalReviewStore = { find: async () => row ? { ...row } : null, update: async (_id, value, actor, at) => {
    if (!row || row.version !== value.expectedVersion) return null;
    writes++; row = { id, status: value.status, version: value.expectedVersion + 1, reason: value.reason, actor, reviewedAt: at.toISOString(), requestId: value.requestId }; return { ...row };
  } };
  return { store, writes: () => writes, row: () => row, remove: () => { row = null; } };
}
const code = (expected: string) => (error: unknown) => error instanceof ProposalReviewError && error.code === expected;
test("review accepts a pilot as private administrative metadata without publishing or installing anything", async () => {
  const fixture = memory(); const at = new Date("2026-10-18T12:00:00Z");
  const result = await applyProposalReview(fixture.store, id, input, "password:synthetic-admin", at);
  assert.deepEqual(result, { review: { id, status: "accepted_for_pilot", version: 1, reason: input.reason, actor: "password:synthetic-admin", reviewedAt: at.toISOString() }, replayed: false });
  assert.equal(fixture.writes(), 1);
  assert.deepEqual(Object.keys(fixture.row()!).sort(), ["actor", "id", "reason", "requestId", "reviewedAt", "status", "version"]);
  assert.equal(proposalStatusLabel("new"), "Pending review");
  assert.equal(proposalStatusLabel("__proto__"), "__proto__");
  assert.equal(proposalStatusLabel("unknown_legacy_status"), "unknown_legacy_status");
});
test("concurrent duplicate decisions share one receipt and retain the first reviewer and timestamp", async () => {
  const fixture = memory(); const at = new Date("2026-10-18T12:00:00Z");
  const results = await Promise.all([applyProposalReview(fixture.store, id, input, "password:first", at), applyProposalReview(fixture.store, id, input, "password:second", new Date())]);
  assert.equal(fixture.writes(), 1); assert.equal(results.filter(value => value.replayed).length, 1); assert.deepEqual(results[0].review, results[1].review);
  const replay = await applyProposalReview(fixture.store, id, input, "password:third");
  assert.equal(replay.replayed, true); assert.equal(replay.review.actor, "password:first"); assert.equal(fixture.writes(), 1);
});
test("stale or modified replays cannot overwrite an intervening review", async () => {
  const fixture = memory(); await applyProposalReview(fixture.store, id, input, "password:first");
  await assert.rejects(applyProposalReview(fixture.store, id, { ...input, reason: "A changed note" }, "password:other"), code("version_conflict"));
  await assert.rejects(applyProposalReview(fixture.store, id, { ...input, requestId: "33333333-3333-4333-8333-333333333333" }, "password:other"), code("version_conflict"));
  assert.equal(fixture.writes(), 1); assert.equal(fixture.row()?.status, "accepted_for_pilot");
  const next = await applyProposalReview(fixture.store, id, { ...input, status: "in_review", expectedVersion: 1, requestId: "33333333-3333-4333-8333-333333333333" }, "password:other");
  assert.equal(next.review.version, 2); assert.equal(next.review.status, "in_review");
});
test("a missing proposal cannot create a phantom review", async () => {
  const fixture = memory();fixture.remove();await assert.rejects(applyProposalReview(fixture.store,id,input,"password:first"),code("not_found"));assert.equal(fixture.writes(),0);
});
test("review input permits bounded private decisions only, never URL activation or caller-supplied reviewer identity", () => {
  assert.equal(proposalReviewSchema.safeParse(input).success,true);
  for(const changed of [{status:"published"},{status:"new"},{reason:" "},{reason:"x".repeat(1001)},{expectedVersion:-1},{requestId:"unknown"},{actor:"spoofed"},{url:"https://untrusted.example.test/execute"}])assert.equal(proposalReviewSchema.safeParse({...input,...changed}).success,false);
});
