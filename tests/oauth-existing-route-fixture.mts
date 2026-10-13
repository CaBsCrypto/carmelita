import assert from "node:assert/strict";
import { mock } from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const owner = "did:privy:synthetic-existing-owner";
const calls = { validate: 0, provision: 0, profile: 0, link: 0, submit: 0, preflight: 0, fetch: 0 };
let providerId = owner;
let validationError: string | null = null;
let preflightError: string | null = null;

function setPreview(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
    CARMELITA_TEMPO_TESTNET_ENABLED: "true", CARMELITA_PREVIEW_ISOLATED: "true",
    CARMELITA_PREVIEW_DATABASE_HOST: "ep-synthetic-qa.example.neon.tech",
    CARMELITA_PRODUCTION_DATABASE_HOST: "ep-synthetic-production.example.neon.tech",
    CARMELITA_PREVIEW_DATABASE_URL: "postgresql://fixture:fake-password@ep-synthetic-qa-pooler.example.neon.tech/qa?sslmode=require",
    CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: "postgresql://fixture:fake-password@ep-synthetic-qa.example.neon.tech/qa?sslmode=require",
    CARMELITA_PREVIEW_ORIGIN: "https://synthetic-qa.vercel.app",
    CARMELITA_PREVIEW_DEPLOYMENT: "dpl_syntheticexisting",
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
function reset() {
  for (const name of Object.keys(calls) as (keyof typeof calls)[]) calls[name] = 0;
  validationError = null; preflightError = null; providerId = owner;
  setPreview();
}
mock.method(globalThis, "fetch", async () => { calls.fetch++; throw new Error("unexpected Horizon, Friendbot or provider request"); });
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: {
    verifyPrivyAccessToken: async (token: string) => {
      assert.equal(token, "synthetic-existing-token"); return { user_id: owner };
    },
    getPrivyUserIdentity: async (userId: string) => {
      assert.equal(userId, owner); return { id: providerId, email: "existing-owner@example.test" };
    },
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
        assert.equal(id, owner); assert.equal(email, "existing-owner@example.test"); return "synthetic-oauth-subject";
      }
      async preflightAuthorization() {
        calls.preflight++;
        if (preflightError) throw new Error(preflightError);
        return { client: { clientId: "synthetic" }, requestedScopes: ["agent:read", "agent:context"], consentRequired: true };
      }
      async submitAuthorization(_request: unknown, subject: string, consentGranted: boolean) {
        calls.submit++; assert.equal(subject, "synthetic-oauth-subject");
        return { redirectUri: "https://chat.example.test/callback", consentGranted };
      }
    },
  },
});
mock.module(new URL("../app/wallets/onboarding.ts", import.meta.url).href, {
  namedExports: { provisionUserWallets: async () => { calls.provision++; throw new Error("unexpected legacy wallet provisioning"); } },
});
mock.module(new URL("../app/stytch/oauth-profile.ts", import.meta.url).href, {
  namedExports: { persistVerifiedOAuthProfile: async () => { calls.profile++; throw new Error("unexpected legacy profile write"); } },
});
mock.module(new URL("../app/services/oauth-subject-link-store.ts", import.meta.url).href, {
  namedExports: { linkOAuthSubject: async (input: { privyDid: string }) => { calls.link++; assert.equal(input.privyDid, owner); } },
});

// Keep the real policy selector. Only the provider/registry read boundary is mocked;
// the production route, owner orchestration, isolation guard and preparation are real.
mock.module(new URL("../app/stytch/existing-oauth-wallets.ts", import.meta.url).href, {
  namedExports: {
    assertExistingOAuthWallets: async (userId: string) => {
      calls.validate++; assert.equal(userId, owner);
      if (validationError) throw new Error(validationError);
    },
  },
});
const { POST } = await import("../app/api/oauth/stytch/authorize/route");
function request(consentGranted = true) {
  return new Request("https://synthetic-qa.vercel.app/api/oauth/stytch/authorize", {
    method: "POST",
    headers: { origin: "https://synthetic-qa.vercel.app", authorization: "Bearer synthetic-existing-token", "content-type": "application/json" },
    body: JSON.stringify({ query: "synthetic-query", consentGranted }),
  });
}
function assertNoLegacyOrNetwork() {
  assert.equal(calls.provision, 0);
  assert.equal(calls.profile, 0);
  assert.equal(calls.fetch, 0, "Consent must never request Horizon, Friendbot or create a provider wallet");
}

for (const [code, status, publicCode] of [
  ["oauth_existing_wallets_required", 409, "oauth_existing_wallets_required"],
  ["oauth_existing_wallets_unavailable", 503, "oauth_existing_wallets_unavailable"],
  ["wallet_identity_conflict", 409, "wallet_identity_conflict"],
] as const) {
  reset(); validationError = code;
  const response = await POST(request());
  assert.equal(response.status, status, code);
  assert.deepEqual(await response.json(), { ok: false, error: publicCode });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.validate, 1);
  assert.equal(calls.preflight, 1);
  assert.equal(calls.link, 0);
  assert.equal(calls.submit, 0, "A failed existing-wallet read must not issue an OAuth grant");
  assertNoLegacyOrNetwork();
}

reset();
setPreview({ CARMELITA_PREVIEW_DATABASE_URL: undefined });
const unisolated = await POST(request());
assert.notEqual(unisolated.status, 200);
assert.equal((await unisolated.json()).ok, false);
assert.equal(calls.validate, 0);
assert.equal(calls.submit, 0);
assert.equal(calls.link, 0);
assertNoLegacyOrNetwork();

reset(); providerId = "did:privy:synthetic-other-owner";
const mismatch = await POST(request());
assert.equal(mismatch.status, 409);
assert.equal(calls.validate, 0);
assert.equal(calls.preflight, 0);
assert.equal(calls.submit, 0);
assertNoLegacyOrNetwork();

reset(); preflightError = "stytch_oauth_scope_not_grantable";
const badScope = await POST(request());
assert.equal(badScope.status, 400);
assert.equal(calls.validate, 0);
assert.equal(calls.submit, 0);
assert.equal(calls.link, 0);
assertNoLegacyOrNetwork();

reset();
const denied = await POST(request(false));
assert.equal(denied.status, 200);
assert.equal((await denied.json()).consentGranted, false);
assert.equal(calls.validate, 0);
assert.equal(calls.link, 0);
assert.equal(calls.submit, 1);
assertNoLegacyOrNetwork();

type CapturedProvider = {
  appId: string;
  clientId?: string;
  config: {
    embeddedWallets?: {
      ethereum: { createOnLogin: string };
      solana: { createOnLogin: string };
      disableAutomaticMigration: boolean;
    };
    supportedChains: { id: number }[];
  };
};
const providerConfigurations: CapturedProvider[] = [];
mock.module("@privy-io/react-auth", {
  namedExports: {
    PrivyProvider: (props: CapturedProvider & { children: ReactNode }) => {
      providerConfigurations.push({ appId: props.appId, clientId: props.clientId, config: props.config });
      return createElement("div", null, props.children);
    },
  },
});
const { default: Providers } = await import("../app/providers");
const { existingOAuthWalletsRequired } = await import("../app/stytch/authorize-with-wallets");
// React.createElement injects children from its third argument; the fixture's
// props omit that required field while retaining the real Providers component.
const ProviderWithElementChildren = Providers as ComponentType<Omit<Parameters<typeof Providers>[0], "children">>;
const child = createElement("span", null, "synthetic-provider-child");
const existingMarkup = renderToStaticMarkup(createElement(ProviderWithElementChildren, {
  appId: "synthetic-public-app", clientId: "synthetic-public-client",
  existingWalletsOnly: existingOAuthWalletsRequired(), tempoTestnetEnabled: true,
}, child));
assert.ok(existingMarkup.includes("synthetic-provider-child"));
assert.equal(providerConfigurations.length, 1);
assert.deepEqual(providerConfigurations[0].config.embeddedWallets, {
  ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" }, disableAutomaticMigration: true,
});
assert.equal(providerConfigurations[0].clientId, "synthetic-public-client");
assert.deepEqual(providerConfigurations[0].config.supportedChains.map(chain => chain.id), [43113, 42431]);

const legacyMarkup = renderToStaticMarkup(createElement(ProviderWithElementChildren, { appId: "synthetic-public-app" }, child));
assert.ok(legacyMarkup.includes("synthetic-provider-child"));
assert.equal(providerConfigurations.length, 2);
assert.equal(Object.hasOwn(providerConfigurations[1].config, "embeddedWallets"), false,
  "Legacy login must retain its configured embedded-wallet behavior");
assert.deepEqual(providerConfigurations[1].config.supportedChains.map(chain => chain.id), [43113]);

assert.equal(renderToStaticMarkup(createElement(ProviderWithElementChildren, { existingWalletsOnly: true }, child)),
  "<span>synthetic-provider-child</span>");
assert.equal(providerConfigurations.length, 2, "Missing AppID must not initialize a Privy provider");
assertNoLegacyOrNetwork();

reset();
const granted = await POST(request());
assert.equal(granted.status, 200);
assert.equal((await granted.json()).consentGranted, true);
assert.equal(calls.validate, 1);
assert.equal(calls.preflight, 1);
assert.equal(calls.link, 1);
assert.equal(calls.submit, 1);
assertNoLegacyOrNetwork();
