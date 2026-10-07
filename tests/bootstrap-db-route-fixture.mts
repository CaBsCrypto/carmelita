import assert from "node:assert/strict";
import { mock } from "node:test";

let provisions = 0;
let providerId = "did:privy:fixture";
mock.module(new URL("../app/wallets/onboarding.ts", import.meta.url).href, {
  namedExports: { provisionUserWallets: async () => {
    provisions++;
    throw new Error("wallet_persistence_unavailable", { cause: new Error("private database transport detail") });
  } },
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: { hasDatabase: () => true },
});
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: {
    PRIVY_WALLET_ARCHITECTURE: {},
    getPrivyStellarReadiness: () => ({}),
    getPrivyUserIdentity: async () => ({ id: providerId, email: "fixture@example.test" }),
    verifyPrivyAccessToken: async () => ({ user_id: "did:privy:fixture" }),
  },
});
const { POST } = await import("../app/api/agent/bootstrap/route");
const response = await POST(new Request("https://preview.test/api/agent/bootstrap", {
  method: "POST", headers: { origin: "https://preview.test", host: "preview.test", authorization: "Bearer fixture" },
}));
assert.equal(provisions, 1);
assert.equal(response.status, 503);
assert.deepEqual(await response.json(), { error: "wallet_persistence_unavailable" });
providerId = "did:privy:another";
const mismatched = await POST(new Request("https://preview.test/api/agent/bootstrap", {
  method: "POST", headers: { origin: "https://preview.test", host: "preview.test", authorization: "Bearer fixture" },
}));
assert.equal(provisions, 1);
assert.equal(mismatched.status, 409);
assert.deepEqual(await mismatched.json(), { error: "privy_identity_mismatch" });
const insecureOrigin = await POST(new Request("https://preview.test/api/agent/bootstrap", {
  method: "POST", headers: { origin: "http://preview.test", host: "preview.test", authorization: "Bearer fixture" },
}));
assert.equal(provisions, 1);
assert.equal(insecureOrigin.status, 403);
