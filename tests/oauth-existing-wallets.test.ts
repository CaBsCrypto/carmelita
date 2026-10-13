import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";
import { assertExistingOAuthWallets } from "../app/stytch/existing-oauth-wallets";
import { existingOAuthWalletsRequired, prepareOAuthWallets } from "../app/stytch/authorize-with-wallets";
import { publicOAuthError } from "../app/stytch/public-error";
import { ConsentRequestError, requestConsentRedirect } from "../app/oauth/authorize/consent-request";
import type { provisionUserWallets } from "../app/wallets/onboarding";
import type { UserWallet, WalletFamily } from "../app/wallets/types";

const owner = "did:privy:synthetic-existing-owner";
const identity = { id: owner, email: "existing-owner@example.test" };
const families = ["stellar", "evm", "solana"] as const;
type Dependencies = NonNullable<Parameters<typeof assertExistingOAuthWallets>[1]>;
type Canonical = NonNullable<Awaited<ReturnType<NonNullable<Dependencies["canonicalEvm"]>>>>;

function fixture() {
  const addresses = {
    stellar: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    evm: "0x" + "aB".repeat(20),
    solana: "11111111111111111111111111111111",
  };
  const chainTypes = { stellar: "stellar", evm: "ethereum", solana: "solana" } as const;
  const canonical = Object.fromEntries(families.map(family => [family, {
    id: "synthetic-" + family, userId: owner, address: addresses[family], chainType: chainTypes[family],
  }])) as Record<WalletFamily, Canonical | null>;
  const wallets = Object.fromEntries(families.map(family => [family, [{
    id: "synthetic-" + family, address: addresses[family], chainType: chainTypes[family],
    family, owner: "user", created: false,
  }]])) as Record<WalletFamily, UserWallet[]>;
  const calls: string[] = [];
  const read = (family: WalletFamily) => async (userId: string) => {
    assert.equal(userId, owner);
    calls.push("canonical." + family);
    return canonical[family];
  };
  const dependencies: Dependencies = {
    canonicalStellar: read("stellar"), canonicalEvm: read("evm"), canonicalSolana: read("solana"),
    listFamilies: async userId => { assert.equal(userId, owner); calls.push("privy.list"); return wallets; },
  };
  return { canonical, wallets, calls, dependencies };
}

function isolated(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "preview", NODE_ENV: "test", CARMELITA_TEMPO_TESTNET_ENABLED: "true",
    CARMELITA_PREVIEW_ISOLATED: "true",
    CARMELITA_PREVIEW_DATABASE_HOST: "ep-synthetic-qa.example.neon.tech",
    CARMELITA_PRODUCTION_DATABASE_HOST: "ep-synthetic-production.example.neon.tech",
    CARMELITA_PREVIEW_ORIGIN: "https://synthetic-qa.vercel.app",
    CARMELITA_PREVIEW_DEPLOYMENT: "dpl_syntheticexisting",
    CARMELITA_PREVIEW_DATABASE_URL: "postgresql://fixture:fake-password@ep-synthetic-qa-pooler.example.neon.tech/qa?sslmode=require",
    CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: "postgresql://fixture:fake-password@ep-synthetic-qa.example.neon.tech/qa?sslmode=require",
    ...overrides,
  };
}

let externalRequests = 0;
mock.method(globalThis, "fetch", async () => {
  externalRequests++;
  throw new Error("unexpected Horizon, Friendbot or other network request");
});

test("existing OAuth wallets are read only for the authenticated owner and permit EVM address casing", async () => {
  const f = fixture();
  f.wallets.evm[0].address = f.wallets.evm[0].address.toLowerCase();
  const before = structuredClone({ canonical: f.canonical, wallets: f.wallets });
  await assertExistingOAuthWallets(owner, f.dependencies);
  assert.deepEqual(f.calls.sort(), ["canonical.evm", "canonical.solana", "canonical.stellar", "privy.list"]);
  assert.deepEqual({ canonical: f.canonical, wallets: f.wallets }, before);
  assert.equal(externalRequests, 0);
});

for (const family of families) {
  test("missing canonical " + family + " wallet fails instead of provisioning", async () => {
    const f = fixture(); f.canonical[family] = null;
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "oauth_existing_wallets_required" });
    assert.equal(externalRequests, 0);
  });
  test("missing Privy " + family + " wallet fails instead of creating or recovering it", async () => {
    const f = fixture(); f.wallets[family] = [];
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "oauth_existing_wallets_required" });
    assert.equal(externalRequests, 0);
  });
  test("canonical " + family + " owner mismatch fails closed", async () => {
    const f = fixture(); f.canonical[family]!.userId = "did:privy:synthetic-other-owner";
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
  test("canonical " + family + " provider ID mismatch cannot select a replacement wallet", async () => {
    const f = fixture(); f.wallets[family][0].id = "synthetic-other-wallet-id";
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
  test("canonical " + family + " address mismatch fails closed", async () => {
    const f = fixture();
    f.canonical[family]!.address = family === "evm" ? "0x" + "cd".repeat(20)
      : family === "solana" ? "22222222222222222222222222222222" : "not-the-provider-address";
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
  test("canonical " + family + " chain type mismatch fails closed", async () => {
    const f = fixture(); f.canonical[family]!.chainType = family === "evm" ? "solana" : "ethereum";
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
  test("Privy " + family + " family mismatch fails closed", async () => {
    const f = fixture(); f.wallets[family][0].family = family === "stellar" ? "solana" : "stellar";
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
  test("duplicate Privy matches for canonical " + family + " identity are rejected", async () => {
    const f = fixture(); f.wallets[family].push({ ...f.wallets[family][0] });
    await assert.rejects(assertExistingOAuthWallets(owner, f.dependencies), { message: "wallet_identity_conflict" });
  });
}

test("Privy and canonical transport failures have fixed errors without leaking provider details", async () => {
  const privateDetail = "synthetic-provider-token-at-https://private.example.test";
  for (const name of ["canonicalStellar", "canonicalEvm", "canonicalSolana", "listFamilies"] as const) {
    const f = fixture();
    const dependencies = { ...f.dependencies, [name]: async () => { throw new Error(privateDetail); } };
    await assert.rejects(assertExistingOAuthWallets(owner, dependencies), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "oauth_existing_wallets_unavailable");
      assert.ok(!error.message.includes(privateDetail));
      return true;
    });
  }
  const f = fixture();
  await assert.rejects(assertExistingOAuthWallets(owner, {
    ...f.dependencies, canonicalEvm: async () => { throw new Error("wallet_identity_conflict"); },
  }), { message: "wallet_identity_conflict" });
});

test("public OAuth errors preserve existing-wallet actions and sanitize isolation diagnostics", () => {
  for (const [input, code, status] of [
    ["oauth_existing_wallets_required", "oauth_existing_wallets_required", 409],
    ["oauth_existing_wallets_unavailable", "oauth_existing_wallets_unavailable", 503],
    ["wallet_identity_conflict", "wallet_identity_conflict", 409],
    ["preview_isolation_invalid_database_synthetic-private-detail", "oauth_existing_wallets_unavailable", 503],
  ] as const) {
    assert.deepEqual(publicOAuthError(new Error(input), "authorize"), { code, status });
  }
});

test("consent distinguishes missing wallets and unavailable verification without accepting a callback", async () => {
  for (const [code, status, clientCode] of [
    ["oauth_existing_wallets_required", 409, "existing_wallets_required"],
    ["oauth_existing_wallets_unavailable", 503, "existing_wallets_unavailable"],
    ["wallet_identity_conflict", 409, "wallet_identity_conflict"],
  ] as const) {
    let requests = 0;
    await assert.rejects(requestConsentRedirect(
      "redirect_uri=https%3A%2F%2Fchat.example.test%2Fcallback&state=synthetic", true,
      async () => "synthetic-token",
      async () => {
        requests++;
        return Response.json({ error: code, redirectUri: "https://chat.example.test/callback?state=synthetic&code=must-not-be-accepted" }, { status });
      },
    ), (error: unknown) => error instanceof ConsentRequestError && error.code === clientCode);
    assert.equal(requests, 1);
  }
  assert.equal(externalRequests, 0);
});

test("raw Preview Tempo intent chooses validation even when isolation is incomplete", () => {
  assert.equal(existingOAuthWalletsRequired(isolated()), true);
  assert.equal(existingOAuthWalletsRequired({ VERCEL_ENV: "preview", CARMELITA_TEMPO_TESTNET_ENABLED: "true" }), true);
  assert.equal(existingOAuthWalletsRequired({ CARMELITA_PREVIEW_ISOLATED: "true", CARMELITA_TEMPO_TESTNET_ENABLED: "true" }), true);
  assert.equal(existingOAuthWalletsRequired({}), false);
  assert.equal(existingOAuthWalletsRequired({ VERCEL_ENV: "production" }), false);
  assert.equal(existingOAuthWalletsRequired({ VERCEL_ENV: "preview", CARMELITA_TEMPO_TESTNET_ENABLED: "false" }), false);
});

test("isolated Tempo consent validates existing identities without profile, provisioning or chain requests", async () => {
  const calls: string[] = [];
  await prepareOAuthWallets(identity,
    async () => { calls.push("provision"); throw new Error("unexpected wallet provisioning"); },
    async () => { calls.push("profile"); throw new Error("unexpected profile write"); },
    { env: isolated(), validateExisting: async userId => { assert.equal(userId, owner); calls.push("validate"); } },
  );
  assert.deepEqual(calls, ["validate"]);
  assert.equal(externalRequests, 0, "Horizon 404 cannot trigger fallback because this path never requests Horizon");
});

for (const code of ["oauth_existing_wallets_required", "wallet_identity_conflict", "oauth_existing_wallets_unavailable"]) {
  test("existing wallet rejection " + code + " never falls back to legacy preparation", async () => {
    const calls: string[] = [];
    await assert.rejects(prepareOAuthWallets(identity,
      async () => { calls.push("provision"); throw new Error("legacy provisioning reached"); },
      async () => { calls.push("profile"); },
      { env: isolated(), validateExisting: async () => { calls.push("validate"); throw new Error(code); } },
    ), { message: code });
    assert.deepEqual(calls, ["validate"]);
    assert.equal(externalRequests, 0);
  });
}

test("invalid Preview isolation rejects before every dependency and never falls back to production preparation", async () => {
  for (const overrides of [
    { CARMELITA_PREVIEW_ISOLATED: undefined },
    { CARMELITA_PREVIEW_DATABASE_URL: undefined },
    { CARMELITA_PRODUCTION_DATABASE_HOST: "ep-synthetic-qa.example.neon.tech" },
    { VERCEL_TARGET_ENV: "production" },
    { VERCEL_ENV: "production" },
  ]) {
    const calls: string[] = [];
    await assert.rejects(prepareOAuthWallets(identity,
      async () => { calls.push("provision"); throw new Error("legacy provisioning reached"); },
      async () => { calls.push("profile"); },
      { env: isolated(overrides), validateExisting: async () => { calls.push("validate"); } },
    ), /preview_isolation_/);
    assert.deepEqual(calls, []);
  }
});

test("default and production OAuth preserve legacy profile then wallet preparation", async () => {
  const ready = { status: "ready" as const, error: null, retryable: false };
  const result = { stellar: {}, evm: {}, solana: {}, preparation: {
    stellar: ready, evm: ready, solana: ready,
  } } as Awaited<ReturnType<typeof provisionUserWallets>>;
  for (const env of [{}, { VERCEL_ENV: "production", CARMELITA_TEMPO_TESTNET_ENABLED: "true" }]) {
    const calls: string[] = [];
    await prepareOAuthWallets(identity,
      async input => { assert.deepEqual(input, { userId: owner, email: identity.email }); calls.push("provision"); return result; },
      async saved => { assert.deepEqual(saved, identity); calls.push("profile"); },
      { env, validateExisting: async () => { calls.push("validate"); throw new Error("unexpected Preview validation"); } },
    );
    assert.deepEqual(calls, ["profile", "provision"]);
  }
  assert.equal(externalRequests, 0);
});
