"use client";

import { useState } from "react";
import styles from "./proposal-email.module.css";

export default function ProposalEmailControls({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/notifications", { method: "POST", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok || result.status !== "processed") throw new Error("unavailable");
      setMessage(`${result.accepted} accepted by the email provider; ${result.retry} scheduled for retry; ${result.needsReview} require review. Refresh to update the queue.`);
    } catch { setMessage("Email notices could not be processed. Your saved proposals remain in the review inbox."); }
    finally { setBusy(false); }
  }
  return <div id="proposal-email-controls" className={styles.actions}>
    <button type="button" disabled={!ready || busy} onClick={retry}>{busy ? "Processing notices…" : "Retry due email notices"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
