import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { acceptanceArg, acceptanceReport, assertRemotePreview, deploymentArg, previewAcceptanceTarget, redactAcceptanceSecrets, vercelCurl, type AcceptanceCheck } from "./agent-gateway-preview-acceptance";

export type Registry = {
  summary: { users: number; wallets: number; completeUsers: number; needsAttention: number };
  users: Array<{
    email: string | null;
    registeredComplete: boolean;
    missingNetworks: string[];
    invalidAddressNetworks: string[];
    duplicateNetworks: string[];
    wallets: Array<{ network: string; address: string; status: string; validAddress: boolean }>;
  }>;
};

export function validateRegistryUser(registry: Registry, email: string) {
  const users = registry.users.filter((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
  assert.equal(users.length, 1, "Expected exactly one registry record for the selected test identity");
  const user = users[0];
  assert.equal(user.registeredComplete, true, "Required wallet records were not provisioned");
  assert.deepEqual(user.missingNetworks, [], "Missing wallet network");
  assert.deepEqual(user.duplicateNetworks, [], "Duplicate wallet network");
  assert.deepEqual(user.invalidAddressNetworks, [], "Invalid wallet address");
  for (const network of ["stellar:testnet", "avalanche:fuji", "solana:devnet"]) {
    const wallets = user.wallets.filter((wallet) => wallet.network === network);
    assert.equal(wallets.length, 1, `Expected exactly one ${network} wallet`);
    assert.equal(wallets[0].validAddress, true, `Invalid ${network} address`);
  }
  return user;
}

export async function runWalletOnboardingAcceptance(args: string[] = process.argv, env: Record<string, string | undefined> = process.env) {
  const target = previewAcceptanceTarget({
    url: acceptanceArg("--url", args) ?? env.CARMELITA_PREVIEW_URL,
    deployment: deploymentArg(args, env.CARMELITA_PREVIEW_DEPLOYMENT),
    commit: acceptanceArg("--commit", args) ?? env.CARMELITA_PREVIEW_COMMIT,
  }, env);
  const emails = [acceptanceArg("--email", args), acceptanceArg("--second-email", args)].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase());
  if (emails.length === 2 && emails[0] === emails[1]) throw new Error("two_distinct_test_identities_required");
  const username = env.CARMELITA_ADMIN_USERNAME;
  const password = env.CARMELITA_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("set_CARMELITA_ADMIN_USERNAME_and_CARMELITA_ADMIN_PASSWORD");
  const secrets = new Set([username, password, ...emails]);
  const checks: AcceptanceCheck[] = [];
  async function check(name: string, operation: () => Promise<string>) {
    const started = performance.now();
    try {
      const detail = await operation();
      checks.push({ name, status: "PASS", durationMs: Math.round(performance.now() - started), detail });
    } catch (error) {
      checks.push({ name, status: "FAIL", durationMs: Math.round(performance.now() - started), detail: redactAcceptanceSecrets(error instanceof Error ? error.message : "unknown_error", secrets) });
    }
  }
  const request = (path: string, options: { method?: string; body?: unknown; headers?: string[]; includeHeaders?: boolean } = {}) => vercelCurl({ deployment: target.deployment, origin: target.url, path, ...options }, secrets);
  let remoteVerified = false;
  await check("Remote Preview isolation and commit", async () => {
    const health = await request("/api/health");
    assert.equal(health.status, 200, "Remote Preview health unavailable");
    assertRemotePreview(health.body, target);
    remoteVerified = true;
    return "Runtime database fingerprint and commit match the explicitly selected Preview";
  });
  if (!remoteVerified) {
    checks.push({ name: "Wallet registry acceptance", status: "PENDING", durationMs: 0, detail: "No authenticated request made because remote isolation or commit verification failed." });
    return acceptanceReport({ url: target.url, deployment: target.deployment, commit: target.commit, checks });
  }
  await check("OAuth protected-resource metadata", async () => {
    const metadata = await request("/.well-known/oauth-protected-resource");
    assert.equal(metadata.status, 200, "OAuth metadata unavailable");
    const oauth = metadata.body as { resource?: string; authorization_servers?: string[]; scopes_supported?: string[] };
    assert.equal(oauth.resource, `${target.url}/api/mcp/agent`, "OAuth resource URL mismatch");
    assert.ok(oauth.authorization_servers?.length, "OAuth authorization server missing");
    for (const scope of ["agent:read", "agent:context", "agent:conversation", "agent:plan"]) assert.ok(oauth.scopes_supported?.includes(scope), `Missing OAuth scope ${scope}`);
    return "Discovery includes the required authorization scopes";
  });
  await check("Unauthenticated wallet registry protection", async () => {
    assert.equal((await request("/api/admin/wallets")).status, 401, "Wallet registry is not protected");
    return "Anonymous access returned HTTP 401";
  });
  let cookie: string | undefined;
  let registry: Registry | undefined;
  await check("Preview administrator session", async () => {
    const login = await request("/api/admin/session", { method: "POST", body: { username, password }, includeHeaders: true });
    assert.equal(login.status, 200, "Admin login failed");
    cookie = login.headers?.["set-cookie"]?.split(";", 1)[0];
    if (!cookie?.startsWith("aa_founder_session=")) throw new Error("admin_session_cookie_missing");
    secrets.add(cookie);
    secrets.add(cookie.slice(cookie.indexOf("=") + 1));
    return "Authenticated through protected Preview using the Vercel CLI session";
  });
  await check("Authenticated wallet registry consistency", async () => {
    assert.ok(cookie, "Administrator session unavailable");
    const response = await request("/api/admin/wallets", { headers: [`Cookie: ${cookie}`, "Cache-Control: no-store"] });
    assert.equal(response.status, 200, "Authenticated registry failed");
    registry = response.body as Registry;
    assert.equal(registry.summary.users, registry.users.length, "Registry user total mismatch");
    assert.equal(registry.summary.wallets, registry.users.reduce((total, user) => total + user.wallets.length, 0), "Registry wallet total mismatch");
    return "Registry totals match the returned records; no user details included in this report";
  });
  for (const [index, email] of emails.entries()) {
    await check(`Registered wallets for test identity ${index + 1}`, async () => {
      assert.ok(registry, "Wallet registry unavailable");
      validateRegistryUser(registry, email);
      return "One valid registered address on Stellar Testnet, Avalanche Fuji and Solana Devnet; on-chain activation not required";
    });
  }
  if (emails.length === 2) {
    await check("Distinct test identity wallet ownership", async () => {
      assert.ok(registry, "Wallet registry unavailable");
      const first = validateRegistryUser(registry, emails[0]);
      const second = validateRegistryUser(registry, emails[1]);
      for (const wallet of first.wallets) assert.ok(!second.wallets.some((other) => other.network === wallet.network && other.address === wallet.address), "Test identities share a wallet address");
      return "The two selected test identities have distinct wallet addresses";
    });
  } else checks.push({ name: "Two registered test identities", status: "PENDING", durationMs: 0, detail: "Supply --email and --second-email after both exclusive test users have completed visible Privy onboarding." });
  checks.push({ name: "Human application acceptance", status: "PENDING", durationMs: 0, detail: "Registry checks do not prove login, session recovery, bootstrap replay, chat/memory persistence, WebMCP lifecycle or cross-user API denial. Attach separate browser evidence." });
  if (cookie) await check("Administrator session cleanup", async () => {
    assert.equal((await request("/api/admin/session", { method: "DELETE", headers: [`Cookie: ${cookie}`] })).status, 200, "Admin logout failed");
    return "Administrator session closed; no wallet or user records deleted";
  });
  secrets.clear();
  return acceptanceReport({ url: target.url, deployment: target.deployment, commit: target.commit, checks });
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const report = await runWalletOnboardingAcceptance();
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}
