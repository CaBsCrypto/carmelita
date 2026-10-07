import { sessionAbortable, withSessionDeadline } from "../agent/session-request";

type Dependencies = {
  verify: (token: string) => Promise<{ user_id: string }>;
  identity: (userId: string) => Promise<{ email: string | null }>;
  wallets: (userId: string) => Promise<{ status: string }[]>;
};

export async function connectionReadinessResponse(request: Request, dependencies: Dependencies, timeoutMs = 10_000) {
  const headers = { "Cache-Control": "no-store" };
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  let authenticated = false;
  try {
    return await withSessionDeadline(request.signal, timeoutMs, async signal => {
      const { user_id: userId } = await sessionAbortable(() => dependencies.verify(match[1]), signal);
      authenticated = true;
      const [identity, wallets] = await sessionAbortable(() => Promise.all([dependencies.identity(userId), dependencies.wallets(userId)]), signal);
      return Response.json({ emailReady: Boolean(identity.email), registeredWallets: wallets.filter(wallet => wallet.status === "active").length }, { headers });
    });
  } catch { return Response.json({ error: authenticated ? "readiness_unavailable" : "authentication_required" }, { status: authenticated ? 503 : 401, headers }); }
}
