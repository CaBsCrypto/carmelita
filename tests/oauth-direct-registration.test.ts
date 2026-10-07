import assert from "node:assert/strict";
import test from "node:test";
import { authorizeOwner } from "../app/stytch/authorize-owner";
import { parseOAuthAuthorizationRequest } from "../app/stytch/connected-apps-client";
const identity = { id: "did:privy:new-user", email: "new@example.com" };
const request = parseOAuthAuthorizationRequest("client_id=synthetic&redirect_uri=https%3A%2F%2Fchat.example%2Fcb&response_type=code&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256&resource=https%3A%2F%2Fcarmelita.example%2Fapi%2Fmcp%2Fagent&scope=agent%3Aread");
function fixtures(failure?: "preflight" | "prepare" | "link") {
  const calls: string[] = [];
  const dependencies = {
    client: {
      ensureUserForPrivy: async (id: string, email: string) => { assert.deepEqual({ id, email }, identity); calls.push("identity"); return "subject"; },
      preflightAuthorization: async () => { calls.push("preflight"); if (failure === "preflight") throw new Error("bad_client"); return { client: { clientId: "synthetic", clientName: "Chat" }, requestedScopes: ["agent:read"], consentRequired: true }; },
      submitAuthorization: async (_request: typeof request, subject: string, granted: boolean) => { assert.equal(subject, "subject"); calls.push(granted ? "grant" : "deny"); return { redirectUri: "https://chat.example/cb" }; },
    },
    prepare: async (owner: typeof identity) => { assert.deepEqual(owner, identity); calls.push("prepare"); if (failure === "prepare") throw new Error("wallet_persistence_unavailable"); },
    link: async (owner: { issuer: string; subject: string; privyDid: string }) => { assert.equal(owner.privyDid, identity.id); calls.push("link"); if (failure === "link") throw new Error("conflict"); },
  };
  return { calls, dependencies };
}
test("direct chat consent validates, prepares the verified owner, links and then grants", async () => {
  const { calls, dependencies } = fixtures();
  await authorizeOwner({ identity, issuer: "https://issuer.example", request, consentGranted: true }, dependencies);
  assert.deepEqual(calls, ["identity", "preflight", "prepare", "link", "grant"]);
});
test("denial never prepares wallets or links the account", async () => {
  const { calls, dependencies } = fixtures();
  await authorizeOwner({ identity, issuer: "https://issuer.example", request, consentGranted: false }, dependencies);
  assert.deepEqual(calls, ["identity", "deny"]);
});
test("validation, preparation and linking failures prevent a grant", async () => {
  for (const failure of ["preflight", "prepare", "link"] as const) {
    const { calls, dependencies } = fixtures(failure);
    await assert.rejects(authorizeOwner({ identity, issuer: "https://issuer.example", request, consentGranted: true }, dependencies));
    assert.ok(!calls.includes("grant"));
    if (failure === "preflight") assert.ok(!calls.includes("prepare"));
  }
});
