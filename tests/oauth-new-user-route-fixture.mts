import assert from "node:assert/strict";
import { mock } from "node:test";
import type { UserWallet, WalletFamily } from "../app/wallets/types";

// Exercise the HTTP handler, owner orchestration, wallet preparation and Privy
// selection/creation. Only the external Stytch, Privy and persistence boundaries
// are synthetic; this does not certify a live provider login or hosted callback.
const owner = "did:privy:synthetic-new-owner";
const identity = { id: owner, email: "new-owner@example.test" };
const addresses = {
  stellar: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  evm: "0x1111111111111111111111111111111111111111",
  solana: "11111111111111111111111111111111",
};
const chainTypes = { stellar: "stellar", evm: "ethereum", solana: "solana" } as const;
type Canonical = { id: string; address: string; chainType: string; userId: string };
type Candidate = { id: string; address: string; chain_type: string; external_id?: string };
const canonical = new Map<WalletFamily, Canonical>();
const provider = new Map<WalletFamily, Candidate[]>();
const events: string[] = [];
const created: WalletFamily[] = [];
let profile: typeof identity | null = null;
let failProvider: WalletFamily | null = null;
let failStorage: WalletFamily | "profile" | null = null;
let networkRequests = 0;
let faucetRequests = 0;

for (const key of ["CARMELITA_TEMPO_TESTNET_ENABLED", "CARMELITA_TEMPO_PRODUCTION_READ_ENABLED",
  "CARMELITA_PREVIEW_ISOLATED", "CARMELITA_PREVIEW_DATABASE_URL", "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED",
  "VERCEL_ENV", "VERCEL_TARGET_ENV", "CARMELITA_EVM_TESTNET_EXPANSION_ENABLED"]) delete process.env[key];

function reset() {
  canonical.clear(); provider.clear(); events.length = 0; created.length = 0;
  for (const family of ["stellar", "evm", "solana"] as const) provider.set(family, []);
  profile = null; failProvider = null; failStorage = null;
  networkRequests = 0; faucetRequests = 0;
}
function persist(wallet: UserWallet) {
  assert.equal(profile?.id, owner, "The verified profile must persist before wallet registration");
  events.push("persist:" + wallet.family);
  if (failStorage === wallet.family) throw new Error("wallet_persistence_unavailable");
  canonical.set(wallet.family, { id: wallet.id, address: wallet.address, chainType: wallet.chainType, userId: owner });
  return wallet;
}
mock.method(globalThis, "fetch", async () => {
  networkRequests++;
  throw new Error("unexpected external network request");
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: {
    hasDatabase: () => true,
    getDb: () => ({
      execute: async () => { events.push("storage:check"); return []; },
      insert: () => ({ values: (saved: { id: string; email: string }) => ({
        onConflictDoUpdate: async () => {
          events.push("profile");
          if (failStorage === "profile") throw new Error("synthetic private storage detail");
          assert.equal(saved.id, owner);
          profile = { id: saved.id, email: saved.email };
        },
      }) }),
    }),
  },
});
mock.module(new URL("../app/multichain-account.ts", import.meta.url).href, {
  namedExports: {
    getCanonicalStellarWallet: async (id: string) => { assert.equal(id, owner); return canonical.get("stellar") ?? null; },
    getCanonicalEvmWallet: async (id: string) => { assert.equal(id, owner); return canonical.get("evm") ?? null; },
    getCanonicalSolanaWallet: async (id: string) => { assert.equal(id, owner); return canonical.get("solana") ?? null; },
    persistWalletNetworks: async (input: { userId: string; wallet: UserWallet }) => { assert.equal(input.userId, owner); return persist(input.wallet); },
    persistActivatedWallet: async (input: { userId: string; wallet: UserWallet }) => { assert.equal(input.userId, owner); return persist(input.wallet); },
  },
});
mock.module(new URL("../app/agent-account.ts", import.meta.url).href, {
  namedExports: { persistAgentAccount: async (input: { userId: string; wallet: UserWallet; activation: string }) => {
    assert.equal(input.userId, owner); assert.equal(input.activation, "unknown"); persist(input.wallet);
    return { profile: { ...identity, status: "active" }, persistence: { configured: true, provider: "synthetic" }, history: [] };
  } },
});
mock.module(new URL("../app/privy-client.ts", import.meta.url).href, {
  namedExports: { getPrivyClient: () => ({ wallets: () => ({
    list: async (input: { user_id: string; chain_type: string }) => {
      assert.equal(input.user_id, owner);
      const family = input.chain_type === "ethereum" ? "evm" : input.chain_type as WalletFamily;
      events.push("list:" + family);
      return { async *[Symbol.asyncIterator]() { yield* provider.get(family)!; } };
    },
    create: async (input: { chain_type: string; owner: { user_id: string }; external_id: string; idempotency_key: string }) => {
      assert.equal(profile?.id, owner, "No provider creation before durable profile persistence");
      assert.equal(input.owner.user_id, owner);
      assert.equal(input.external_id, input.idempotency_key);
      const family = input.chain_type === "ethereum" ? "evm" : input.chain_type as WalletFamily;
      events.push("create:" + family);
      if (failProvider === family) throw new Error("synthetic private provider detail");
      const wallet = { id: "synthetic-" + family, address: addresses[family], chain_type: chainTypes[family], external_id: input.external_id };
      provider.get(family)!.push(wallet); created.push(family);
      return wallet;
    },
  }) }) },
});
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: {
    verifyPrivyAccessToken: async (token: string) => { assert.equal(token, "synthetic-new-token"); return { user_id: owner }; },
    getPrivyUserIdentity: async (id: string) => { assert.equal(id, owner); return identity; },
    getStellarTestnetAccount: async (address: string) => {
      assert.equal(address, addresses.stellar); events.push("stellar:read");
      return { exists: false, sequence: null, balances: [] };
    },
    fundStellarTestnetWallet: async () => { faucetRequests++; throw new Error("OAuth must not fund Testnet accounts"); },
    isValidStellarAddress: (address: string) => address === addresses.stellar,
  },
});
mock.module(new URL("../app/stytch/connected-apps-config.ts", import.meta.url).href, {
  namedExports: { readStytchConnectedAppsConfig: () => ({ issuer: "https://oauth.example.test" }) },
});
mock.module(new URL("../app/stytch/connected-apps-client.ts", import.meta.url).href, {
  namedExports: {
    parseOAuthAuthorizationRequest: (query: string) => { assert.equal(query, "synthetic-query"); return {}; },
    StytchConnectedAppsClient: class {
      async ensureUserForPrivy(id: string, email: string) {
        assert.equal(id, owner); assert.equal(email, identity.email); return "synthetic-oauth-subject";
      }
      async preflightAuthorization() { events.push("preflight"); return { requestedScopes: ["agent:read"], consentRequired: true }; }
      async submitAuthorization(_request: unknown, subject: string, consentGranted: boolean) {
        assert.equal(subject, "synthetic-oauth-subject");
        if (consentGranted) assert.equal(canonical.size, 3, "All canonical families must persist before issuing the grant");
        events.push(consentGranted ? "grant" : "deny");
        return { redirectUri: "https://chat.example.test/callback", consentGranted };
      }
    },
  },
});
mock.module(new URL("../app/services/oauth-subject-link-store.ts", import.meta.url).href, {
  namedExports: { linkOAuthSubject: async (input: { privyDid: string }) => {
    assert.equal(input.privyDid, owner); assert.equal(canonical.size, 3); events.push("link");
  } },
});
const { POST } = await import("../app/api/oauth/stytch/authorize/route");
function request(consentGranted = true) {
  return new Request("https://synthetic-registration.example.test/api/oauth/stytch/authorize", {
    method: "POST",
    headers: { origin: "https://synthetic-registration.example.test", authorization: "Bearer synthetic-new-token", "content-type": "application/json" },
    body: JSON.stringify({ query: "synthetic-query", consentGranted }),
  });
}
function noFinancialRequests() {
  assert.equal(faucetRequests, 0);
  assert.equal(networkRequests, 0);
}
async function granted() {
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).consentGranted, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(events.slice(-2), ["link", "grant"]);
  assert.equal(canonical.size, 3);
  assert.ok(events.includes("stellar:read"), "Missing on-chain activation must not block prepared identities");
  noFinancialRequests();
}

reset();
await granted();
assert.deepEqual(created.toSorted(), ["evm", "solana", "stellar"]);
assert.deepEqual(profile, identity);
assert.ok(events.indexOf("profile") < events.findIndex(event => event.startsWith("create:")));
const firstIdentities = structuredClone([...canonical]);
events.length = 0;
await granted();
assert.deepEqual([...canonical], firstIdentities);
assert.equal(created.length, 3, "A reconnect must reuse every provider wallet");

for (const registered of [false, true]) {
  reset();
  const existingEvm = { id: "synthetic-existing-evm", address: addresses.evm, chain_type: "ethereum" };
  provider.set("evm", [existingEvm]);
  if (registered) canonical.set("evm", { id: existingEvm.id, address: existingEvm.address, chainType: "ethereum", userId: owner });
  await granted();
  assert.equal(canonical.get("evm")?.id, existingEvm.id);
  assert.deepEqual(created.toSorted(), ["solana", "stellar"], "An EVM-only owner receives only the missing families, with or without prior registration");
}

reset(); failProvider = "solana";
let response = await POST(request());
assert.equal(response.status, 503);
assert.deepEqual(await response.json(), { ok: false, error: "oauth_wallet_preparation_incomplete" });
assert.deepEqual(profile, identity);
assert.equal(canonical.size, 2);
assert.ok(!events.includes("link") && !events.includes("grant"));
const partialIdentities = structuredClone([...canonical]);
failProvider = null; events.length = 0;
await granted();
for (const [family, wallet] of partialIdentities) assert.deepEqual(canonical.get(family), wallet);
assert.deepEqual(created.toSorted(), ["evm", "solana", "stellar"], "Retry cannot duplicate successful families");

for (const failure of ["profile", "stellar", "evm", "solana"] as const) {
  reset(); failStorage = failure;
  response = await POST(request());
  assert.equal(response.status, 503, failure);
  assert.deepEqual(await response.json(), { ok: false, error: "oauth_wallet_preparation_incomplete" });
  assert.ok(!events.includes("link") && !events.includes("grant"), "Storage failure cannot issue or link a grant");
  if (failure === "profile") assert.equal(created.length, 0);
  noFinancialRequests();
  const issuedWallets = structuredClone([...provider]);
  failStorage = null; events.length = 0;
  await granted();
  for (const [family, wallets] of issuedWallets) {
    if (wallets.length) assert.deepEqual(provider.get(family), wallets, "A storage retry must recover the already issued provider wallet");
  }
  assert.equal(created.length, 3, "Recovering storage cannot create duplicate provider wallets");
}

reset();
response = await POST(request(false));
assert.equal(response.status, 200);
assert.equal((await response.json()).consentGranted, false);
assert.deepEqual(events, ["deny"]);
assert.equal(profile, null);
assert.equal(created.length, 0);
noFinancialRequests();
