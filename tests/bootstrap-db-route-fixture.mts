import assert from "node:assert/strict";
import { mock } from "node:test";

let provisions = 0;
let providerId = "did:privy:fixture";
mock.module(new URL("../app/multichain-account.ts", import.meta.url).href, {
  namedExports: { listPersistedUserWallets: async () => [
    { id: "fixture-wallet", userId: "did:privy:fixture", address: "fixture-address", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { id: "another-wallet", userId: "did:privy:other", address: "another-address", chainType: "stellar", network: "stellar:testnet", status: "active" },
  ] },
});
mock.module(new URL("../app/queries/personal-panels.ts", import.meta.url).href, {
  namedExports: { withPersonalPanelReadDeadline: async (read: () => Promise<unknown>) => read() },
});
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
const { POST, GET } = await import("../app/api/agent/bootstrap/route");
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
process.env.CARMELITA_TEMPO_PRODUCTION_READ_ENABLED = "true";
process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "true";
process.env.VERCEL_ENV = "production";
const existingOnly = await POST(new Request("https://production.test/api/agent/bootstrap", {
  method: "POST", headers: { origin: "https://production.test", host: "production.test", authorization: "Bearer fixture" },
}));
assert.equal(existingOnly.status, 409);
assert.deepEqual(await existingOnly.json(), { error: "existing_wallets_only", next: "/tempo" });
assert.equal(provisions, 1, "production Tempo cannot call wallet provisioning or Friendbot through bootstrap");
const existingRead = await GET(new Request("https://production.test/api/agent/bootstrap", {headers:{authorization:"Bearer fixture"}}));
assert.equal(existingRead.status,200);
const existingBody = await existingRead.json();
assert.equal(existingBody.readOnly,true);assert.equal(existingBody.wallet.id,"fixture-wallet");
assert.equal(existingBody.fundsMoved,false);assert.equal(existingBody.account,null);
assert.equal(provisions,1,"GET cannot create or activate wallets");
assert.equal(existingRead.headers.get("cache-control"),"no-store");
