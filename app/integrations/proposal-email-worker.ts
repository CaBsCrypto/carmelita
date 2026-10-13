import { after } from "next/server";
import { hasDatabase } from "@/db";
import { buildProposalEmailMessage, readProposalEmailConfig, sendProposalEmail } from "./proposal-email";
import { claimProposalEmailJob, completeProposalEmailJob, freezeProposalEmailMessage, PROPOSAL_EMAIL_RETRY_WINDOW_MS, PROPOSAL_EMAIL_MAX_ATTEMPTS } from "./proposal-email-store";

export async function dispatchProposalEmails(options: {
  env?: NodeJS.ProcessEnv; send?: typeof sendProposalEmail;
} = {}): Promise<{
  status: "disabled" | "not_configured" | "storage_unavailable" | "processed";
  processed: number; accepted: number; retry: number; needsReview: number; missing?: string[];
}> {
  const config = readProposalEmailConfig(options.env);
  const counts = { processed: 0, accepted: 0, retry: 0, needsReview: 0 };
  if (!config.enabled) return { status: "disabled", ...counts };
  if (!config.ready) return { status: "not_configured", ...counts, missing: config.missing };
  if (!hasDatabase()) return { status: "storage_unavailable", ...counts };
  const snapshot = { from: config.from!, to: config.to!, reviewUrl: config.reviewUrl! };
  for (let index = 0; index < 5; index++) {
    const job = await claimProposalEmailJob(snapshot);
    if (!job) break;
    counts.processed++;
    const age = Date.now() - Date.parse(job.firstAttemptAt);
    if (!Number.isFinite(age) || age >= PROPOSAL_EMAIL_RETRY_WINDOW_MS) {
      await completeProposalEmailJob(job, { status: "rejected", code: "idempotency_window_expired" });
      counts.needsReview++;
      continue;
    }
    const message = await freezeProposalEmailMessage(job, job.payload ?? buildProposalEmailMessage(job.proposalId, job));
    if (!message) continue; // The lease expired or was reclaimed; another worker owns this job.
    if (Date.now() - Date.parse(job.firstAttemptAt) >= PROPOSAL_EMAIL_RETRY_WINDOW_MS) {
      await completeProposalEmailJob(job, { status: "rejected", code: "idempotency_window_expired" });
      counts.needsReview++;
      continue;
    }
    let result: Awaited<ReturnType<typeof sendProposalEmail>>;
    try { result = await (options.send ?? sendProposalEmail)(message, config.apiKey!, `proposal/${job.proposalId}`); }
    catch { result = { status: "retry", code: "provider_network_error" }; }
    await completeProposalEmailJob(job, result);
    if (result.status === "accepted") counts.accepted++;
    else if (result.status === "rejected") counts.needsReview++;
    else if (job.attempts >= PROPOSAL_EMAIL_MAX_ATTEMPTS || Date.now() - Date.parse(job.firstAttemptAt) >= PROPOSAL_EMAIL_RETRY_WINDOW_MS) counts.needsReview++;
    else counts.retry++;
  }
  return { status: "processed", ...counts };
}

/** Best effort only: the atomic outbox survives process loss or a scheduling failure. */
export function scheduleProposalEmailNotification(): void {
  try {
    after(async () => {
      try { await dispatchProposalEmails(); }
      catch { /* Durable pending/leased jobs are recovered by a later authorized dispatch. */ }
    });
  } catch { /* Saving a proposal must not become an error after it has committed. */ }
}
