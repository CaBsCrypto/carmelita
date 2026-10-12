"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProposalReviewInput } from "@/app/integrations/review";
import styles from "./review-controls.module.css";

const labels = { in_review: "In review", rejected: "Reject", accepted_for_pilot: "Accept for pilot" };
export default function ProposalReviewControls({ id, version, status }: { id: string; version: number; status: string }) {
  const router = useRouter();
  const [action, setAction] = useState<ProposalReviewInput["status"]>("in_review");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef<{ key: string; signature: string } | null>(null);
  const pending = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { activeRequest.current?.abort(); activeRequest.current = null; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const signature = JSON.stringify({ action, reason: reason.trim(), version });
    if (request.current?.signature !== signature) request.current = { key: crypto.randomUUID(), signature };
    pending.current = true; setBusy(true); setNotice("");
    const controller = new AbortController(); activeRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/admin/integration-recommendations/${encodeURIComponent(id)}/review`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action, reason: reason.trim(), expectedVersion: version, requestId: request.current.key }) });
      const result = await response.json();
      if (activeRequest.current !== controller) return;
      if (!response.ok) {
        setNotice(response.status === 409 ? "This proposal changed in another review. Refresh the queue before saving again." : response.status === 401 ? "Your administrator session expired. Sign in again before saving." : "The review could not be saved. Your note is preserved; you can retry.");
        return;
      }
      if (result.review?.id !== id || result.review?.status !== action || result.review?.version !== version + 1) throw new Error("invalid_receipt");
      setNotice(action === "accepted_for_pilot" ? "Accepted for pilot. This does not publish, activate or install an application." : "Review saved.");
      router.refresh();
    } catch { if (activeRequest.current === controller) setNotice("The review response is unavailable. Retry with the same decision to check whether it was saved."); }
    finally { window.clearTimeout(timer); if (activeRequest.current === controller) { activeRequest.current = null; pending.current = false; setBusy(false); } }
  }
  return <form className={styles.form} onSubmit={submit} aria-label="Review this proposal">
    <p className={styles.boundary}>Private review only. Accepting a pilot does not publish an app, execute its URL or install it for users.</p>
    <div className={styles.fields}>
      <label>Review decision<select value={action} onChange={event => setAction(event.target.value as ProposalReviewInput["status"])} disabled={busy}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Private reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} required rows={3} disabled={busy} placeholder="Record the review outcome and next steps." /></label>
    </div>
    <div className={styles.actions}><button type="submit" disabled={busy}>{busy ? "Saving review…" : "Save review"}</button><button type="button" disabled={busy} onClick={() => router.refresh()}>Refresh queue</button><small>Current status: {status === "new" ? "Pending review" : status.replaceAll("_", " ")} · Version {version}</small></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
  </form>;
}
