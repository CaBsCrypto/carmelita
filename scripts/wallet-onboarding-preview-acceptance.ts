import assert from "node:assert/strict";

type Registry = {
  summary: { users: number; wallets: number; completeUsers: number; needsAttention: number };
  users: Array<{
    email: string | null;
    complete: boolean;
    registeredComplete: boolean;
    missingNetworks: string[];
    inactiveNetworks: string[];
    invalidAddressNetworks: string[];
    duplicateNetworks: string[];
    wallets: Array<{ network: string; address: string; status: string; validAddress: boolean }>;
  }>;
};

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function baseUrl() {
  return (arg("--url") ?? process.env.CARMELITA_PREVIEW_URL ?? "https://carmelita-oauth-preview.vercel.app").replace(/\/$/, "");
}

async function login(url: string) {
  const username = process.env.CARMELITA_ADMIN_USERNAME;
  const password = process.env.CARMELITA_ADMIN_PASSWORD;
  if (!username || !password) throw new Error("set_CARMELITA_ADMIN_USERNAME_and_CARMELITA_ADMIN_PASSWORD");
  const response = await fetch(`${url}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ username, password }),
    redirect: "manual",
  });
  assert.equal(response.status, 200, "admin login failed");
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("aa_founder_session=")) throw new Error("admin session cookie missing");
  return cookie;
}

async function main() {
  const url = baseUrl();
  const email = arg("--email")?.trim().toLowerCase();
  const metadata = await fetch(`${url}/.well-known/oauth-authorization-server`);
  assert.equal(metadata.status, 200, "OAuth metadata is unavailable");
  const oauth = await metadata.json() as { authorization_endpoint?: string; scopes_supported?: string[] };
  assert.ok(oauth.authorization_endpoint?.includes("/oauth/authorize"), "OAuth authorization endpoint missing");
  for (const scope of ["agent:read", "agent:context", "agent:conversation", "agent:plan"]) {
    assert.ok(oauth.scopes_supported?.includes(scope), `OAuth metadata missing ${scope}`);
  }

  const unauthenticated = await fetch(`${url}/api/admin/wallets`, { redirect: "manual" });
  assert.equal(unauthenticated.status, 401, "wallet registry is not protected");
  const cookie = await login(url);
  const response = await fetch(`${url}/api/admin/wallets`, { headers: { cookie, accept: "application/json" }, cache: "no-store" });
  assert.equal(response.status, 200, "authenticated wallet registry failed");
  const registry = await response.json() as Registry;
  assert.equal(registry.summary.users, registry.users.length, "registry user total mismatch");
  assert.equal(registry.summary.wallets, registry.users.reduce((total, user) => total + user.wallets.length, 0), "registry wallet total mismatch");

  if (email) {
    const user = registry.users.find((candidate) => candidate.email?.toLowerCase() === email);
    assert.ok(user, `no registry user found for ${email}`);
    assert.equal(user.registeredComplete, true, `both wallet records were not provisioned for ${email}`);
    assert.deepEqual(user.missingNetworks, [], `missing wallet network for ${email}`);
    assert.deepEqual(user.duplicateNetworks, [], `duplicate wallet network for ${email}`);
    assert.deepEqual(user.invalidAddressNetworks, [], `invalid wallet address for ${email}`);
    for (const network of ["stellar:testnet", "avalanche:fuji"]) {
      assert.equal(user.wallets.filter((wallet) => wallet.network === network).length, 1, `${email} must have exactly one ${network} wallet`);
    }
  }

  console.log(JSON.stringify({
    status: "PASS",
    url,
    oauth: "ready",
    registryProtected: true,
    summary: registry.summary,
    checkedUser: email ?? null,
    humanAcceptanceRequired: !email,
    note: email
      ? "The selected user has one valid registered address on Stellar Testnet and Avalanche Fuji. Active/on-chain status is reported separately."
      : "Reconnect a fresh ChatGPT user, approve Privy consent, then rerun with --email user@example.com.",
  }, null, 2));
}

await main();
