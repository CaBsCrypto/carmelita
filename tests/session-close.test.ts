import assert from "node:assert/strict";
import test from "node:test";
import { closeSessions, SessionCloseError } from "../app/session-close";

function adminFetch(overrides: { deleteStatus?: number; authenticated?: boolean } = {}): typeof fetch {
  return async (_input, options) => options?.method === "DELETE"
    ? Response.json({ status: "signed_out" }, { status: overrides.deleteStatus ?? 200 })
    : Response.json({ authenticated: overrides.authenticated ?? false });
}

test("both sessions are verified only after admin deletion, admin readback and observed Privy logout", async () => {
  const steps: string[] = [];
  const result = await closeSessions({
    fetcher: async (input, options) => { steps.push(options?.method ?? "GET"); return adminFetch()(input, options); },
    logoutPrivy: async () => { steps.push("privy.logout"); },
    observePrivySignedOut: async () => { steps.push("privy.observed.closed"); },
  });
  assert.deepEqual(steps, ["DELETE", "GET", "privy.logout", "privy.observed.closed"]);
  assert.deepEqual(result, { adminClosed: true, privyClosed: true });
});

test("HTTP logout failure remains a failure even if Privy closes", async () => {
  let privyClosed = false;
  await assert.rejects(closeSessions({ fetcher: adminFetch({ deleteStatus: 500 }), logoutPrivy: async () => { privyClosed = true; }, observePrivySignedOut: async () => {} }), (error) => error instanceof SessionCloseError && error.failures.includes("admin_delete_failed"));
  assert.equal(privyClosed, true);
});

test("a retained admin session and unresolved or rejected Privy logout never count as complete", async () => {
  await assert.rejects(closeSessions({ fetcher: adminFetch({ authenticated: true }), logoutPrivy: async () => { throw new Error("network"); }, observePrivySignedOut: async () => { throw new Error("still_authenticated"); } }), (error) => error instanceof SessionCloseError && error.failures.includes("admin_session_not_closed") && error.failures.includes("privy_logout_failed") && error.failures.includes("privy_session_not_closed"));
  await assert.rejects(closeSessions({ fetcher: adminFetch(), logoutPrivy: async () => {}, observePrivySignedOut: async () => { throw new Error("still_authenticated"); } }), (error) => error instanceof SessionCloseError && error.failures.includes("privy_session_not_closed"));
});
