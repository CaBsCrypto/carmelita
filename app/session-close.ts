export class SessionCloseError extends Error {
  constructor(readonly failures: string[]) { super("session_close_not_verified"); }
}

export async function closeAdminSession(fetcher: typeof fetch = fetch) {
  const deleted = await fetcher("/api/admin/session", { method: "DELETE", cache: "no-store" });
  if (!deleted.ok || (await deleted.json()).status !== "signed_out") throw new SessionCloseError(["admin_delete_failed"]);
  const checked = await fetcher("/api/admin/session", { cache: "no-store" });
  if (!checked.ok || (await checked.json()).authenticated !== false) throw new SessionCloseError(["admin_session_not_closed"]);
}

export async function closeSessions({ logoutPrivy, observePrivySignedOut, fetcher = fetch }: {
  logoutPrivy: () => Promise<void>;
  observePrivySignedOut: () => Promise<void>;
  fetcher?: typeof fetch;
}) {
  const failures: string[] = [];
  try { await closeAdminSession(fetcher); }
  catch (error) { failures.push(...(error instanceof SessionCloseError ? error.failures : ["admin_close_unavailable"])); }
  try { await logoutPrivy(); }
  catch { failures.push("privy_logout_failed"); }
  try { await observePrivySignedOut(); }
  catch { failures.push("privy_session_not_closed"); }
  if (failures.length) throw new SessionCloseError(failures);
  return { adminClosed: true, privyClosed: true } as const;
}
