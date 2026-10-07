import assert from "node:assert/strict";
import test from "node:test";
import { inspectWalletRecovery, recoverRegisteredWallets, type WalletRecoveryDependencies } from "../app/admin/wallets/recovery";
import type { AdminWalletUser } from "../app/admin/wallets/data";

const identity = { id: "did:privy:existingowner", email: "owner@example.com" };
function fixture() {
  const calls: string[] = [];
  const user: AdminWalletUser = { privyDid: identity.id, email: identity.email, status: "active", registeredComplete: true,
    complete: false, invalidAddressNetworks: [], inactiveNetworks: ["stellar:testnet"],
    createdAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-01-02T00:00:00Z", wallets: [],
    missingNetworks: [], duplicateNetworks: [], uniqueWallets: 3, networkAssociations: 5, evmIdentityConflict: false };
  const dependencies: WalletRecoveryDependencies = {
    registeredUser: async id => { calls.push("registered"); return { id, status: "active" }; },
    identity: async id => { calls.push("provider"); assert.equal(id, identity.id); return identity; },
    persistProfile: async saved => { calls.push("profile"); assert.deepEqual(saved, identity); },
    provision: async input => {
      calls.push("wallets"); assert.deepEqual(input, { userId: identity.id, email: identity.email });
      const ready = { status: "ready", error: null, retryable: false };
      return { stellar: {}, evm: {}, solana: {}, preparation: { stellar: ready, evm: ready, solana: ready } } as Awaited<ReturnType<WalletRecoveryDependencies["provision"]>>;
    },
    registryUser: async id => { calls.push("registry"); assert.equal(id, identity.id); return user; },
    audit: async event => { assert.equal(event.userId, identity.id); assert.equal(event.actor, "admin"); calls.push(event.outcome); },
  };
  return { dependencies, calls, user };
}
const input = { privyDid: identity.id, expectedEmail: identity.email, actor: "admin" };

test("inspection verifies an existing owner without provisioning or persisting", async () => {
  const { dependencies, calls } = fixture();
  assert.deepEqual(await inspectWalletRecovery(identity.id, dependencies), { identity, fundsMoved: false, signingRequired: false });
  assert.deepEqual(calls, ["registered", "provider"]);
});

test("missing, inactive and mismatched identities never prepare wallets", async () => {
  for (const [registeredUser, provider, error] of [
    [null, identity, "registered_user_not_found"],
    [{ id: identity.id, status: "disabled" }, identity, "registered_user_inactive"],
    [{ id: identity.id, status: "active" }, { ...identity, id: "did:privy:other" }, "privy_identity_mismatch"],
    [{ id: identity.id, status: "active" }, { ...identity, email: null }, "verified_email_required"],
  ] as const) {
    const { dependencies, calls } = fixture();
    dependencies.registeredUser = async () => registeredUser;
    dependencies.identity = async () => provider;
    await assert.rejects(recoverRegisteredWallets(input, dependencies), new RegExp(error));
    assert.deepEqual(calls, []);
  }
});

test("provider outage and changed inspection prevent every mutation", async () => {
  const { dependencies, calls } = fixture();
  await assert.rejects(recoverRegisteredWallets({ ...input, expectedEmail: "other@example.com" }, dependencies), /recovery_inspection_changed/);
  assert.deepEqual(calls, ["registered", "provider"]);
  calls.length = 0;
  dependencies.identity = async () => { throw new Error("private provider payload"); };
  await assert.rejects(recoverRegisteredWallets(input, dependencies), error => error instanceof Error && error.message === "provider_identity_unavailable");
  assert.deepEqual(calls, ["registered"]);
});

test("recovery persists only the verified identity and distinguishes registration from activation", async () => {
  const { dependencies, calls, user } = fixture();
  const result = await recoverRegisteredWallets(input, dependencies);
  assert.deepEqual(calls, ["registered", "provider", "started", "profile", "wallets", "registry", "completed"]);
  assert.equal(result.user, user);
  assert.equal(result.registrationComplete, true);
  assert.equal(result.networkActivationComplete, false);
  assert.equal(result.fundsMoved, false);
  assert.equal(result.signingRequired, false);
});

test("partial or conflicting preparation cannot report successful recovery", async () => {
  for (const status of ["failed", "conflict"] as const) {
    const { dependencies, calls } = fixture();
    const original = dependencies.provision;
    dependencies.provision = async target => {
      const result = await original(target);
      result.preparation.evm.status = status;
      return result;
    };
    await assert.rejects(recoverRegisteredWallets(input, dependencies), status === "conflict" ? /wallet_identity_conflict/ : /oauth_wallet_preparation_incomplete/);
    assert.ok(!calls.includes("completed") && !calls.includes("registry"));
    assert.equal(calls.at(-1), "failed");
  }
});

test("registry or persistence failure cannot announce completion; repeat uses the same owner", async () => {
  const { dependencies, calls, user } = fixture();
  user.registeredComplete = false;
  await assert.rejects(recoverRegisteredWallets(input, dependencies), /oauth_wallet_preparation_incomplete/);
  assert.ok(!calls.includes("completed"));
  user.registeredComplete = true;
  calls.length = 0;
  await recoverRegisteredWallets(input, dependencies);
  assert.equal(calls.at(-1), "completed");
  calls.length = 0;
  dependencies.persistProfile = async () => { throw new Error("wallet_persistence_unavailable"); };
  await assert.rejects(recoverRegisteredWallets(input, dependencies), /wallet_persistence_unavailable/);
  assert.ok(!calls.includes("wallets") && !calls.includes("completed"));
});

test("recovery returns and audits actual Stellar activation and Testnet funding", async () => {
  const { dependencies, user } = fixture();
  const audits: Parameters<WalletRecoveryDependencies["audit"]>[0][] = [];
  dependencies.audit = async value => { audits.push(value); };
  const provision = dependencies.provision;
  dependencies.provision = async target => ({ ...await provision(target), activation: "active", fundsMoved: true,
    testnetActivation: { account: { exists: true, sequence: "1", balances: [] }, activation: "active",
      faucetRequested: true, fundsMoved: true, transactionHash: "a".repeat(64), error: null, retryable: false, retryAfterMs: null } });
  user.complete = true;
  const result = await recoverRegisteredWallets(input, dependencies);
  assert.equal(result.networkActivationComplete, true);
  assert.equal(result.stellarActivationComplete, true);
  assert.equal(result.fundsMoved, true);
  assert.equal(result.testnetActivation?.faucetRequested, true);
  assert.deepEqual(audits.map(value => [value.outcome, value.fundsMoved, value.faucetRequested]),
    [["started", false, false], ["completed", true, true]]);
});

test("lost recovery response cannot audit no funds or claim live activation from a stale registry", async () => {
  const { dependencies, user } = fixture();
  const audits: Parameters<WalletRecoveryDependencies["audit"]>[0][] = [];
  dependencies.audit = async value => { audits.push(value); };
  const provision = dependencies.provision;
  dependencies.provision = async target => ({ ...await provision(target), activation: "unknown", fundsMoved: null,
    testnetActivation: { account: null, activation: "unknown", faucetRequested: true, fundsMoved: null,
      transactionHash: null, error: "stellar_account_unavailable", retryable: true, retryAfterMs: 60000 } });
  user.complete = true;
  const result = await recoverRegisteredWallets(input, dependencies);
  assert.equal(result.networkActivationComplete, false);
  assert.equal(result.fundsMoved, null);
  assert.equal(audits.at(-1)?.fundsMoved, null);
  dependencies.provision = async () => { throw new Error("provider request interrupted"); };
  await assert.rejects(recoverRegisteredWallets(input, dependencies));
  assert.equal(audits.at(-1)?.outcome, "failed");
  assert.equal(audits.at(-1)?.fundsMoved, null);
});
