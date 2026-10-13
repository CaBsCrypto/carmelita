import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import * as transport from "../app/integrations/proposal-email";
import type { ProposalEmailJob } from "../app/integrations/proposal-email-store";

const windowMs = 23 * 60 * 60 * 1_000;
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", CARMELITA_PROPOSAL_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_fixture_not_real", CARMELITA_PROPOSAL_EMAIL_FROM: "notices@example.test", CARMELITA_PROPOSAL_EMAIL_TO: "reviewer@example.test", CARMELITA_PUBLIC_ORIGIN: "https://qa.example.test", VERCEL_ENV: "preview" };
const previousSnapshot = { from: "old-notices@example.test", to: "old-reviewer@example.test", reviewUrl: "https://old.example.test/admin/integrations" };
let clock = Date.parse("2026-10-20T12:00:00.000Z"), databaseReady = true, throwClaim = false, afterThrows = false, loseLease = false;
let advanceOnFreeze = 0, network = 0, databaseChecks = 0;
let jobs: ProposalEmailJob[] = [], frozenOverride: transport.ProposalEmailMessage | null = null;
const claims: unknown[] = [], freezes: unknown[] = [], completions: { job: ProposalEmailJob; result: Awaited<ReturnType<typeof transport.sendProposalEmail>> }[] = [];
const sends: { message: transport.ProposalEmailMessage; apiKey: string; key: string }[] = [], callbacks: (() => Promise<void>)[] = [];
mock.method(Date, "now", () => clock);
mock.method(globalThis, "fetch", async () => { network++; throw new Error("Actual network forbidden in worker fixture"); });
mock.module(new URL("../db/index.ts", import.meta.url).href, { namedExports: { hasDatabase: () => { databaseChecks++; return databaseReady; }, getDb: () => { throw new Error("Actual database forbidden"); } } });
mock.module("next/server", { namedExports: { after: (callback: () => Promise<void>) => { if (afterThrows) throw new Error("Synthetic scheduler failure"); callbacks.push(callback); } } });
mock.module(new URL("../app/integrations/proposal-email-store.ts", import.meta.url).href, { namedExports: {
  PROPOSAL_EMAIL_MAX_ATTEMPTS: 8, PROPOSAL_EMAIL_RETRY_WINDOW_MS: windowMs,
  claimProposalEmailJob: async (snapshot: unknown) => { claims.push(snapshot); if (throwClaim) throw new Error("Private SQL endpoint and person@example.test"); return jobs.shift() ?? null; },
  freezeProposalEmailMessage: async (job: ProposalEmailJob, message: transport.ProposalEmailMessage) => { freezes.push({ job, message }); clock += advanceOnFreeze; return loseLease ? null : frozenOverride ?? job.payload ?? message; },
  completeProposalEmailJob: async (job: ProposalEmailJob, result: Awaited<ReturnType<typeof transport.sendProposalEmail>>) => { completions.push({ job, result }); },
} });
const acceptedSend: typeof transport.sendProposalEmail = async (message, apiKey, key) => { sends.push({ message, apiKey, key }); return { status: "accepted", providerId: "synthetic-provider-id" }; };
mock.module(new URL("../app/integrations/proposal-email.ts", import.meta.url).href, { namedExports: { ...transport, sendProposalEmail: acceptedSend } });
const { dispatchProposalEmails, scheduleProposalEmailNotification } = await import("../app/integrations/proposal-email-worker");
function job(index = 1, values: Partial<ProposalEmailJob> = {}): ProposalEmailJob { return { proposalId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, leaseToken: `synthetic-lease-${index}`, attempts: 1, firstAttemptAt: new Date(clock).toISOString(), ...previousSnapshot, payload: null, ...values }; }
const zero = { processed: 0, accepted: 0, retry: 0, needsReview: 0 };
beforeEach(() => {
  clock = Date.parse("2026-10-20T12:00:00.000Z"); databaseReady = true; throwClaim = false; afterThrows = false; loseLease = false; advanceOnFreeze = 0; databaseChecks = 0;
  jobs = []; frozenOverride = null; for (const list of [claims, freezes, completions, sends, callbacks]) list.length = 0;
});
test("disabled and missing configuration return before database, claims or transport", async () => {
  assert.deepEqual(await dispatchProposalEmails({ env: { ...env, CARMELITA_PROPOSAL_EMAIL_ENABLED: "false" }, send: acceptedSend }), { status: "disabled", ...zero });
  const result = await dispatchProposalEmails({ env: { NODE_ENV: "test", CARMELITA_PROPOSAL_EMAIL_ENABLED: "true" }, send: acceptedSend });
  assert.equal(result.status, "not_configured"); assert.deepEqual(result.missing, ["RESEND_API_KEY", "CARMELITA_PROPOSAL_EMAIL_FROM", "CARMELITA_PROPOSAL_EMAIL_TO", "CARMELITA_PUBLIC_ORIGIN"]);
  assert.equal(databaseChecks + claims.length + sends.length, 0); assert.doesNotMatch(JSON.stringify(result), /re_fixture|@example\.test/);
});
test("unavailable database never claims or sends", async () => {
  databaseReady = false; assert.deepEqual(await dispatchProposalEmails({ env, send: acceptedSend }), { status: "storage_unavailable", ...zero }); assert.equal(claims.length + sends.length, 0);
});
test("a dispatch claims at most five jobs and freezes the payload before each send", async () => {
  jobs = Array.from({ length: 6 }, (_, index) => job(index + 1));
  const result = await dispatchProposalEmails({ env, send: async (...args) => { assert.equal(freezes.length, sends.length + 1); return acceptedSend(...args); } });
  assert.deepEqual(result, { status: "processed", processed: 5, accepted: 5, retry: 0, needsReview: 0 }); assert.equal(jobs.length, 1); assert.equal(claims.length, 5);
  assert.equal(sends[0].key, `proposal/${completions[0].job.proposalId}`); assert.equal(completions[0].result.status, "accepted"); assert.doesNotMatch(JSON.stringify(result), /delivered|providerId|re_fixture|reviewer/);
});
test("changed environment and template do not replace the original stored request or idempotency key", async () => {
  const first = job(); const payload = { from: previousSnapshot.from, to: [previousSnapshot.to], subject: "Original saved subject", text: "Original saved text and private review URL." };
  jobs = [{ ...first, attempts: 2, payload }];
  await dispatchProposalEmails({ env, send: acceptedSend }); assert.deepEqual(sends[0].message, payload); assert.equal(sends[0].key, `proposal/${first.proposalId}`);
  assert.deepEqual(claims[0], { from: env.CARMELITA_PROPOSAL_EMAIL_FROM, to: env.CARMELITA_PROPOSAL_EMAIL_TO, reviewUrl: "https://qa.example.test/admin/integrations" });
  assert.deepEqual((freezes[0] as { message: unknown }).message, payload);
  jobs = [first]; frozenOverride = payload; await dispatchProposalEmails({ env, send: acceptedSend }); assert.deepEqual(sends[1].message, payload); assert.equal(sends[1].key, sends[0].key);
});
test("expired and malformed first-attempt timestamps require review without a POST", async () => {
  jobs = [job(1, { firstAttemptAt: new Date(clock - windowMs).toISOString() }), job(2, { firstAttemptAt: "unknown" })];
  const result = await dispatchProposalEmails({ env, send: acceptedSend }); assert.equal(result.needsReview, 2); assert.equal(sends.length + freezes.length, 0); assert.ok(completions.every(value => value.result.status === "rejected"));
});
test("expiration during payload freeze and a lost lease both prevent dispatch", async () => {
  jobs = [job(1, { firstAttemptAt: new Date(clock - windowMs + 1_000).toISOString() })]; advanceOnFreeze = 1_001;
  assert.equal((await dispatchProposalEmails({ env, send: acceptedSend })).needsReview, 1); assert.equal(sends.length, 0);
  jobs = [job(2)]; advanceOnFreeze = 0; loseLease = true; const before = completions.length;
  await dispatchProposalEmails({ env, send: acceptedSend }); assert.equal(sends.length, 0); assert.equal(completions.length, before);
});
test("transport rejection and final retry attempt report needs-review while a transient failure retains retry", async () => {
  jobs = [job(1), job(2), job(3, { attempts: 8 })]; let sequence = 0;
  const result = await dispatchProposalEmails({ env, send: async () => ++sequence === 1 ? { status: "rejected", code: "provider_request_rejected" } : { status: "retry", code: "provider_timeout" } });
  assert.deepEqual(result, { status: "processed", processed: 3, accepted: 0, retry: 1, needsReview: 2 }); assert.equal(completions.length, 3);
});
test("a thrown transport error is classified without exposing private error details", async () => {
  jobs = [job()]; const result = await dispatchProposalEmails({ env, send: async () => { throw new Error("Private API credential and developer@example.test"); } });
  assert.equal(result.retry, 1); assert.deepEqual(completions[0].result, { status: "retry", code: "provider_network_error" }); assert.doesNotMatch(JSON.stringify(result), /Private|@/);
});
test("scheduler registration failure and asynchronous worker failure never escape after saving", async () => {
  afterThrows = true; assert.doesNotThrow(() => scheduleProposalEmailNotification()); assert.equal(callbacks.length, 0);
  afterThrows = false; Object.assign(process.env, env); throwClaim = true; scheduleProposalEmailNotification(); assert.equal(callbacks.length, 1); await assert.doesNotReject(callbacks[0]()); assert.equal(sends.length, 0); assert.equal(network, 0);
});
