"use client";

import { useState } from "react";
import { closeAdminSession } from "@/app/session-close";
import { sessionCloseCopy, useSessionClose } from "@/app/use-session-close";

function PrivyLogoutButton() {
  const session = useSessionClose();
  return <><button disabled={session.closing} onClick={async () => { if (await session.close()) window.location.assign("/admin/login"); }}>{session.closing ? sessionCloseCopy.en.closing : "Sign out"}</button>{session.state === "failed" && <p role="alert">{sessionCloseCopy.en.failed}</p>}</>;
}

function LegacyLogoutButton() {
  const [state, setState] = useState<"idle" | "closing" | "failed">("idle");
  return <><button disabled={state === "closing"} onClick={async () => {
    setState("closing");
    try { await closeAdminSession(); window.location.assign("/admin/login"); }
    catch { setState("failed"); }
  }}>{state === "closing" ? "Closing session…" : "Sign out"}</button>{state === "failed" && <p role="alert">Administrator session closure could not be verified. Please retry.</p>}</>;
}

export default function AdminLogoutButton({ privyEnabled }: { privyEnabled: boolean }) {
  return privyEnabled ? <PrivyLogoutButton /> : <LegacyLogoutButton />;
}
