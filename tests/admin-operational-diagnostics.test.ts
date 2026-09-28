import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readOperationalDiagnostics } from "../app/admin/wallets/operational-diagnostics";
const identity = { method: "privy" as const, username: "cristian@browns.studio", displayName: "private-name" };
const fingerprint = createHash("sha256").update("db.example.test/carmelita").digest("hex");
const env = { VERCEL_ENV: "production", CARMELITA_ADMIN_EMAILS: "cristian@browns.studio,cabscryptocontacto@gmail.com",
 DATABASE_URL: "postgresql://fixture:private-password@db-pooler.example.test/carmelita?sslmode=require",
 DATABASE_URL_UNPOOLED: "postgresql://fixture:private-password@db.example.test/carmelita?sslmode=require",
 CARMELITA_PRODUCTION_DATABASE_FINGERPRINT: fingerprint, CARMELITA_QA_DATABASE_FINGERPRINT: "a".repeat(64),
 CARMELITA_PUBLIC_ORIGIN: "https://carmelita.browns.studio", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" };
test("operational verification requires production and current Privy admin before any probe", async () => {
 const query = async () => { assert.fail("must not query"); };
 for (const [who, config] of [[{...identity, method: "password" as const},env], [{...identity, username:"ordinary@example.test"},env], [identity,{...env,VERCEL_ENV:"preview"}]] as const)
  assert.equal(await readOperationalDiagnostics(who,config,query),null);
});
test("restricted operational verification proves both connections and emits only hashes and checks", async () => {
 let calls=0;
 const result=await readOperationalDiagnostics(identity,env,async()=>{calls++;return [{database_name:"carmelita",role_name:"fixture"}];});
 assert.equal(calls,2); assert.equal(result?.databaseVerified,true);
 assert.equal(result?.runtimeFingerprint,fingerprint); assert.equal(result?.migrationFingerprint,fingerprint);
 assert.equal(result?.checks.expectedAdministratorsPresent,true);
 assert.doesNotMatch(JSON.stringify(result),/private-password|postgresql|db.example|browns.studio|gmail.com|private-name/);
});
test("failed operational query exposes no provider details or false fingerprints", async()=>{
 const result=await readOperationalDiagnostics(identity,env,async()=>{throw new Error("private-password");});
 assert.equal(result?.databaseVerified,false); assert.equal(result?.runtimeFingerprint,null);
 assert.doesNotMatch(JSON.stringify(result),/private-password/);
});


test("operational flags and deployment attestation expose only validated values", async () => {
 const query = async () => [{ database_name: "carmelita", role_name: "fixture" }];
 const result = await readOperationalDiagnostics(identity, { ...env,
  CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED: " TRUE ", STYTCH_PROJECT_ID: "private-project", STYTCH_SECRET: "private-secret", STYTCH_PROJECT_DOMAIN: "https://private-issuer.test",
  VERCEL_GIT_COMMIT_SHA: "b".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_fixture123" }, query);
 assert.equal(result?.checks.oauthResourceEnabled, true);
 assert.equal(result?.checks.stytchConfigurationPresent, true);
 assert.deepEqual(result?.deployment, { commit: "b".repeat(40), id: "dpl_fixture123" });
 assert.doesNotMatch(JSON.stringify(result), /private-project|private-secret|private-issuer/);
 const failed = await readOperationalDiagnostics(identity, { ...env,
  CARMELITA_PUBLIC_ORIGIN: "https://wrong.test", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "false", STELLAR_BAZAAR_DISCOVERY_ENABLED: "true",
  CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED: "false", STYTCH_SECRET: " ", VERCEL_GIT_COMMIT_SHA: "invalid", VERCEL_DEPLOYMENT_ID: "https://private.test",
  CARMELITA_ADMIN_EMAILS: identity.username }, query);
 assert.equal(failed?.checks.oauthResourceEnabled, false);
 assert.equal(failed?.checks.stytchConfigurationPresent, false);
 assert.equal(failed?.checks.publicOriginExpected, false);
 assert.equal(failed?.checks.evmExpansionEnabled, false);
 assert.equal(failed?.checks.bazaarDiscoveryDisabled, false);
 assert.equal(failed?.checks.expectedAdministratorsPresent, false);
 assert.equal(failed?.checks.onlyExpectedAdministrators, false);
 assert.deepEqual(failed?.deployment, { commit: null, id: null });
});

test("production diagnostic rejects Preview connection markers before querying", async () => {
 const result = await readOperationalDiagnostics(identity, { ...env, CARMELITA_PREVIEW_DATABASE_URL: "" }, async () => { assert.fail("must not query"); });
 assert.equal(result?.databaseVerified, false);
 assert.equal(result?.runtimeFingerprint, null);
 assert.equal(result?.migrationFingerprint, null);
});
