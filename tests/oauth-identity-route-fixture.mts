import assert from "node:assert/strict";
import { mock } from "node:test";

const owner = "did:privy:authenticatedowner";
let providerId = "did:privy:anotherowner";
const calls = {
  token: 0, identity: 0, parse: 0, config: 0, construct: 0,
  ensureUser: 0, preflight: 0, prepare: 0, provision: 0, submit: 0, link: 0, fetch: 0,
};
mock.method(globalThis, "fetch", async () => { calls.fetch++; throw new Error("unexpected external request"); });
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: {
    verifyPrivyAccessToken: async (token: string) => {
      calls.token++;
      assert.equal(token, "synthetic-test-token");
      return { user_id: owner };
    },
    getPrivyUserIdentity: async (requested: string) => {
      calls.identity++;
      assert.equal(requested, owner);
      return { id: providerId, email: "synthetic-owner@example.test" };
    },
  },
});
mock.module(new URL("../app/stytch/connected-apps-config.ts", import.meta.url).href, {
  namedExports: { readStytchConnectedAppsConfig: () => { calls.config++; return { issuer: "https://oauth.example.test" }; } },
});
mock.module(new URL("../app/stytch/connected-apps-client.ts", import.meta.url).href, {
  namedExports: {
    parseOAuthAuthorizationRequest: (query: string) => { calls.parse++; assert.equal(query, "fixture-query"); return {}; },
    StytchConnectedAppsClient: class {
      constructor() { calls.construct++; }
      async ensureUserForPrivy(id: string, email: string) {
        calls.ensureUser++; assert.equal(id, owner); assert.equal(email, "synthetic-owner@example.test");
        return "synthetic-stytch-subject";
      }
      async preflightAuthorization() {
        calls.preflight++;
        return { client: { clientId: "fixture" }, requestedScopes: ["agent:read"], consentRequired: true };
      }
      async submitAuthorization(_request: unknown, subject: string, consent: boolean) {
        calls.submit++; assert.equal(subject, "synthetic-stytch-subject");
        return { redirectUri: "https://chat.example.test/callback", consentGranted: consent };
      }
    },
  },
});
mock.module(new URL("../app/wallets/onboarding.ts", import.meta.url).href, {
  namedExports: { provisionUserWallets: async () => { calls.provision++; throw new Error("unexpected wallet provisioning"); } },
});
mock.module(new URL("../app/stytch/authorize-with-wallets.ts", import.meta.url).href, {
  namedExports: { prepareOAuthWallets: async (identity: { id: string }) => { calls.prepare++; assert.equal(identity.id, owner); } },
});
mock.module(new URL("../app/services/oauth-subject-link-store.ts", import.meta.url).href, {
  namedExports: { linkOAuthSubject: async (identity: { privyDid: string }) => { calls.link++; assert.equal(identity.privyDid, owner); } },
});

const { POST: authorize } = await import("../app/api/oauth/stytch/authorize/route");
const { POST: preflight } = await import("../app/api/oauth/stytch/preflight/route");
function request(path: string, consentGranted?: boolean) {
  return new Request("https://preview.example.test/api/oauth/stytch/" + path, {
    method: "POST",
    headers: { origin: "https://preview.example.test", authorization: "Bearer synthetic-test-token", "content-type": "application/json" },
    body: JSON.stringify({ query: "fixture-query", ...(consentGranted === undefined ? {} : { consentGranted }) }),
  });
}

for (const [handler, path, consent] of [
  [preflight, "preflight", undefined], [authorize, "authorize", true], [authorize, "authorize", false],
] as const) {
  const response = await handler(request(path, consent));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: "wallet_identity_conflict" });
  assert.equal(response.headers.get("cache-control"), "no-store");
}
assert.equal(calls.token, 3);
assert.equal(calls.identity, 3);
for (const name of ["parse", "config", "construct", "ensureUser", "preflight", "prepare", "provision", "submit", "link", "fetch"] as const) {
  assert.equal(calls[name], 0, "Mismatched identity reached " + name);
}

// The same real route/owner orchestration accepts the authenticated provider
// identity and still prepares only after explicit positive consent.
providerId = owner;
const validPreflight = await preflight(request("preflight"));
assert.equal(validPreflight.status, 200);
assert.equal(calls.ensureUser, 1);
assert.equal(calls.preflight, 1);
assert.equal(calls.prepare, 0);
assert.equal(calls.link, 0);
const denied = await authorize(request("authorize", false));
assert.equal(denied.status, 200);
assert.equal(calls.ensureUser, 2);
assert.equal(calls.submit, 1);
assert.equal(calls.prepare, 0);
assert.equal(calls.link, 0);
const granted = await authorize(request("authorize", true));
assert.equal(granted.status, 200);
assert.equal(calls.ensureUser, 3);
assert.equal(calls.preflight, 2);
assert.equal(calls.prepare, 1);
assert.equal(calls.submit, 2);
assert.equal(calls.link, 1);
assert.equal(calls.provision, 0);
assert.equal(calls.fetch, 0);
