import assert from "node:assert/strict";
import test from "node:test";
import { compareWalletReference, inspectWalletAssociations, runWalletAcceptance, walletAcceptanceSnapshot, walletReferenceKey } from "../app/preview-acceptance/wallet-checks";

const userId = "did:privy:test-user";
const evmAddress = `0x${"a".repeat(40)}`;
const networks = ["stellar:testnet", "avalanche:fuji", "solana:devnet", "bnb:testnet", "base:sepolia"];
const rows = networks.map((network) => ({ id: network.startsWith("stellar") ? "stellar-id" : network.startsWith("solana") ? "solana-id" : "evm-id", address: network.startsWith("stellar") ? "GSTELLAR" : network.startsWith("solana") ? "SOLANA" : evmAddress, chainType: network.startsWith("stellar") ? "stellar" : network.startsWith("solana") ? "solana" : "ethereum", network, status: "active" }));
const list = { wallets: rows, networks: networks.map((id) => ({ id, family: id.startsWith("stellar") ? "stellar" : id.startsWith("solana") ? "solana" : "evm", rollout: "experimental" })) };
const health = { deployment: { environment: "preview", gitCommitSha: "a".repeat(40), url: "https://qa.vercel.app" }, previewIsolation: { verified: true, databaseFingerprint: "b".repeat(64) } };

function fixtureFetch(calls: { path: string; options?: RequestInit }[], override?: (path: string, options?: RequestInit) => Response | undefined): typeof fetch {
  return async (input, options) => {
    const path = String(input);
    calls.push({ path, options });
    const custom = override?.(path, options);
    if (custom) return custom;
    if (path === "/api/health") return Response.json(health);
    if (path.startsWith("/api/agent/wallets/evm?") && !new Headers(options?.headers).has("authorization")) return Response.json({ error: "authentication_required" }, { status: 401 });
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer fixture-token");
    if (path === "/api/agent/wallets") return Response.json(list);
    if (path === "/api/agent/bootstrap") return Response.json({ user: { id: userId }, wallets: { evm: { id: "evm-id", address: evmAddress }, avalanche: { id: "evm-id", address: evmAddress } }, evm: { fundsMoved: false, signingRequired: false }, avalanche: { fundsMoved: false, signingRequired: false }, solana: { fundsMoved: false, signingRequired: false } });
    if (path === "/api/admin/privy-session") {
      assert.equal(options?.credentials, "omit", "acceptance must not establish an admin cookie");
      return Response.json({ error: "access_denied" }, { status: 403 });
    }
    if (path === "/api/agent/wallets/solana") return Response.json({ network: "solana:devnet", address: "SOLANA", balance: "0 SOL", nativeAsset: "SOL" });
    const parsed = new URL(path, "https://qa.vercel.app");
    const network = parsed.searchParams.get("network");
    if ([...parsed.searchParams.keys()].some((key) => key !== "network") || !networks.includes(network ?? "")) return Response.json({ error: "invalid_evm_network" }, { status: 400 });
    return Response.json({ network, chainId: network === "avalanche:fuji" ? 43113 : network === "bnb:testnet" ? 97 : 84532, address: evmAddress, balance: "0", nativeAsset: "TEST" });
  };
}

test("wallet-only acceptance reads five associations, checks EVM overrides and never invokes financial or memory fixtures", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const report = await runWalletAcceptance({ token: "fixture-token", userId, signal: new AbortController().signal, fetcher: fixtureFetch(calls) });
  assert.equal(report.status, "PASS");
  assert.equal(report.checks.length, 13);
  assert.equal(report.target?.commit, health.deployment.gitCommitSha);
  assert.equal(report.target?.deployment, health.deployment.url);
  assert.ok(report.checks.filter((check) => check.name.startsWith("Rechazo de")).every((check) => check.http === 400));
  assert.ok(calls.every((call) => !/chat|memory|fund|faucet|trustline|payment|bootstrap/.test(call.path)));
  assert.deepEqual(calls.filter((call) => call.options?.method === "POST").map((call) => call.path), ["/api/admin/privy-session"]);
  assert.doesNotMatch(JSON.stringify(report), /fixture-token/);
});

test("bootstrap is an explicit operation and keeps the shared alias and no-funds contract", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const report = await runWalletAcceptance({ token: "fixture-token", userId, signal: new AbortController().signal, fetcher: fixtureFetch(calls), bootstrap: true });
  assert.equal(report.status, "PASS");
  assert.equal(calls.filter((call) => call.path === "/api/agent/bootstrap").length, 1);
  assert.deepEqual(calls.filter((call) => call.options?.method === "POST").map((call) => call.path), ["/api/agent/bootstrap"]);
});

test("unverified environment prevents bootstrap and every authenticated request", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const report = await runWalletAcceptance({ token: "fixture-token", userId, signal: new AbortController().signal, bootstrap: true, fetcher: fixtureFetch(calls, (path) => path === "/api/health" ? Response.json({ ...health, deployment: { ...health.deployment, environment: "production" } }) : undefined) });
  assert.equal(report.status, "FAIL");
  assert.equal(report.checks[1].status, "PENDING");
  assert.deepEqual(calls.map((call) => call.path), ["/api/health"]);
});

test("partial rollout, duplicate associations and alternate EVM identities are not accepted", () => {
  assert.equal(inspectWalletAssociations(list).evm.length, 3);
  assert.throws(() => inspectWalletAssociations({ ...list, wallets: [...rows, rows[1]] }), /duplicados/);
  assert.throws(() => inspectWalletAssociations({ ...list, wallets: rows.map((row, index) => index === 4 ? { ...row, id: "second-evm" } : row) }), /única billetera/);
  assert.throws(() => inspectWalletAssociations({ ...list, networks: list.networks.filter((network) => network.id !== "base:sepolia") }), /inconsistente/);
  const basic = { wallets: rows.slice(0, 3), networks: list.networks.map((network) => ({ ...network, rollout: network.id === "bnb:testnet" || network.id === "base:sepolia" ? "planned" : "experimental" })) };
  assert.equal(inspectWalletAssociations(basic).expected.length, 3);
});

test("RPC failures are localized failures instead of a zero balance or complete success", async () => {
  const report = await runWalletAcceptance({ token: "fixture-token", userId, signal: new AbortController().signal, fetcher: fixtureFetch([], (path) => path === "/api/agent/wallets/evm?network=bnb%3Atestnet" ? Response.json({ error: "rpc_secret_should_not_leak" }, { status: 502 }) : undefined) });
  assert.equal(report.status, "FAIL");
  const check = report.checks.find((check) => check.name === "Saldo de bnb:testnet");
  assert.equal(check?.status, "FAIL");
  assert.match(check?.detail ?? "", /Saldo no disponible/);
  assert.doesNotMatch(JSON.stringify(report), /rpc_secret_should_not_leak/);
});

test("reload evidence is scoped to one account, commit and deployment and remains pending on the same page", () => {
  const snapshot = walletAcceptanceSnapshot(rows);
  const previous = { snapshot, page: "first-page", date: "2026-09-08T12:00:00.000Z" };
  assert.equal(compareWalletReference(previous, snapshot, "first-page").status, "PENDING");
  assert.equal(compareWalletReference(previous, snapshot, "reloaded-page").status, "PASS");
  assert.equal(compareWalletReference(previous, snapshot.map((row, index) => index === 0 ? { ...row, id: "changed-id" } : row), "reloaded-page").status, "FAIL");
  const target = { commit: health.deployment.gitCommitSha, deployment: health.deployment.url, databaseFingerprint: health.previewIsolation.databaseFingerprint };
  assert.notEqual(walletReferenceKey("user-a", target), walletReferenceKey("user-b", target));
  assert.notEqual(walletReferenceKey("user-a", target), walletReferenceKey("user-a", { ...target, commit: "c".repeat(40) }));
  assert.notEqual(walletReferenceKey("user-a", target), walletReferenceKey("user-a", { ...target, deployment: "https://other.vercel.app" }));
});

test("an origin rejection cannot pass the administrative role check", async () => {
  const report = await runWalletAcceptance({ token: "fixture-token", userId, signal: new AbortController().signal, fetcher: fixtureFetch([], (path) => path === "/api/admin/privy-session" ? Response.json({ error: "invalid_origin" }, { status: 403 }) : undefined) });
  assert.equal(report.checks.find((check) => check.name === "Cuenta de prueba sin permiso administrativo")?.status, "FAIL");
});
