"use client";
import { useRef, useState } from "react";
import type { AdminWalletUser } from "./data";
import type { PreparationJobState } from "@/app/wallets/preparation-store";
export default function WalletPreparationPanel({ users }: { users: Pick<AdminWalletUser, "privyDid" | "email">[] }) {
  const [userId, setUserId] = useState("");
  const [jobs, setJobs] = useState<PreparationJobState[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function load(retry = false) {
    if (!userId || busy) return;
    const version = ++generation.current;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(retry ? "/api/admin/wallet-preparation" : `/api/admin/wallet-preparation?userId=${encodeURIComponent(userId)}`, {
        method: retry ? "POST" : "GET", cache: "no-store", headers: retry ? { "Content-Type": "application/json" } : undefined,
        body: retry ? JSON.stringify({ userId }) : undefined,
      });
      if (!response.ok) throw new Error("Could not read preparation status.");
      const body = await response.json();
      if (version !== generation.current) return;
      setJobs(body.jobs); setMessage(retry ? `${body.retried} existing transient families scheduled for retry.` : "Status loaded.");
    } catch { if (version === generation.current) setMessage("Preparation unavailable. Try again."); }
    finally { if (version === generation.current) setBusy(false); }
  }
  const retryable = jobs?.some(job => job.families.some(family => family.retryable && (family.status === "pending" || family.status === "review")));
  return <section aria-label="Wallet preparation"><h2>Wallet preparation</h2>
    <p>Review existing preparation jobs. Retrying only schedules transient failures; it does not create a new job or resolve identity conflicts.</p>
    <label>User <select value={userId} onChange={event => { generation.current++; setUserId(event.target.value); setJobs(null); setMessage(""); setBusy(false); }}><option value="">Select a user</option>{users.map(user => <option key={user.privyDid} value={user.privyDid}>{user.email ?? user.privyDid}</option>)}</select></label>
    <button disabled={!userId || busy} onClick={() => void load()}>Read status</button>
    <button disabled={!userId || busy || !retryable} onClick={() => void load(true)}>Retry transient failures</button>
    <p role="status">{message}</p>
    {jobs?.length === 0 && <p>No existing preparation job. Normal login starts preparation.</p>}
    {jobs?.map(job => <div key={job.id}><p>{job.catalog}</p><ul>{job.families.map(family => <li key={family.family}>{family.family}: {family.status}; attempts {family.attempts}{family.errorCode ? `; ${family.errorCode}` : ""}</li>)}</ul></div>)}
  </section>;
}
