import { readProposalEmailConfig } from "@/app/integrations/proposal-email";
import { listProposalEmailJobs } from "@/app/integrations/proposal-email-store";
import ProposalEmailControls from "./proposal-email-controls";
import styles from "./proposal-email.module.css";

const labels: Record<string, string> = {
  pending: "Pending", sending: "Processing", retry: "Retry scheduled",
  accepted: "Accepted by provider", needs_review: "Needs manual review",
};

export async function renderProposalEmailPanel(storageReady: boolean) {
  const config = readProposalEmailConfig();
  let jobs: Awaited<ReturnType<typeof listProposalEmailJobs>> = [];
  let queueReady = storageReady;
  if (config.enabled && storageReady) {
    try { jobs = await listProposalEmailJobs(); }
    catch { queueReady = false; }
  }
  return <section className={styles.panel} aria-labelledby="proposal-email-heading">
    <div className={styles.heading}>
      <div>
        <h2 id="proposal-email-heading">Email notices</h2>
        <p>New service proposals remain in this private inbox for manual review. Email notices do not approve or publish them.</p>
      </div>
      <strong>{config.enabled ? "Enabled" : "Disabled"}</strong>
    </div>
    {!config.enabled && <p>Email notices are disabled in this environment.</p>}
    {config.enabled && !config.ready && <p>Configure these server variables to send pending notices: <code>{config.missing.join(", ")}</code>.</p>}
    {config.enabled && !queueReady && <p>The notification queue is unavailable. Saved proposals are kept in the inbox.</p>}
    <ProposalEmailControls ready={config.enabled && config.ready && queueReady} />
    {config.enabled && queueReady && <>
      <p>Up to 100 recent notices. Provider acceptance does not confirm delivery to the mailbox.</p>
      {jobs.length === 0 ? <p>No email notices queued yet.</p> : <ul className={styles.jobs}>{jobs.map(job => <li key={job.proposalId}>
        <a href={`#proposal-${job.proposalId}`}>Proposal {job.proposalId.slice(0, 8)}</a>
        <span>{labels[job.state] ?? "Unknown state"}</span>
        <small>{job.attempts} attempts{job.errorCode ? ` · ${job.errorCode}` : ""}</small>
      </li>)}</ul>}
    </>}
  </section>;
}
