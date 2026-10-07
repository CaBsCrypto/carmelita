import assert from "node:assert/strict";
import test from "node:test";
import { registryNetworkRows, type RegistryResult, type RegistryWallet } from "../app/agent/registry-wallet-model";

const networkIds = ["stellar:testnet", "avalanche:fuji", "bnb:testnet", "base:sepolia", "solana:devnet"];
const explorerUrls = [
  "https://stellar.expert/explorer/testnet/account/GFIXTURE",
  "https://explorer-test.avax.network/c-chain/address/0xfixture",
  "https://testnet.bscscan.com/address/0xfixture",
  "https://sepolia.basescan.org/address/0xfixture",
  "https://explorer.solana.com/address/solana-fixture?cluster=devnet",
];
const wallets: RegistryWallet[] = networkIds.map((network, index) => ({
  network, address: index > 0 && index < 4 ? "0xfixture" : index === 0 ? "GFIXTURE" : "solana-fixture",
  chainType: index === 0 ? "stellar" : index === 4 ? "solana" : "ethereum", status: "active", explorerUrl: explorerUrls[index],
}));
const result = (overrides: Partial<RegistryResult> = {}): RegistryResult => ({
  wallets, walletRegistration: { unregisteredNetworks: [] }, walletReadiness: { complete: true, missingNetworks: [] },
  source: "Controlled registry", queriedAt: "2026-10-01T22:00:00.000Z", ...overrides,
});

test("registry projection preserves five associations, three families and server-provided Testnet explorers", () => {
  const input = result();
  const before = structuredClone(input);
  const rows = registryNetworkRows(input);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map(row => row.family)).size, 3);
  assert.deepEqual(rows.map(row => row.network), networkIds);
  assert.equal(new Set(rows.filter(row => row.family === "evm").map(row => row.address)).size, 1);
  assert.equal(new Set(rows.filter(row => row.family === "evm").map(row => row.explorerUrl)).size, 3);
  assert.deepEqual(rows.map(row => row.explorerUrl), explorerUrls);
  assert.equal(new URL(rows[4].explorerUrl!).searchParams.get("cluster"), "devnet");
  assert.deepEqual(input, before);
  assert.ok(rows.every(row => !("balance" in row) && !("accountExists" in row)));
});

test("pending records retain their address and supplied explorer while missing associations stay explicit", () => {
  const suppliedUrl = "https://registry.example/updated-stellar-explorer?address=GFIXTURE";
  const rows = registryNetworkRows(result({
    wallets: [{ ...wallets[0], status: "pending", explorerUrl: suppliedUrl }],
    walletRegistration: { unregisteredNetworks: networkIds.slice(1) },
    walletReadiness: { complete: false, missingNetworks: networkIds.slice(1) },
  }));
  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].registrationState, "registered");
  assert.equal(rows[0].address, "GFIXTURE");
  assert.equal(rows[0].explorerUrl, suppliedUrl);
  for (const row of rows.slice(1)) assert.deepEqual([row.status, row.registrationState, row.address, row.explorerUrl], [null, null, null, null]);
});

test("backend registration state is authoritative and legacy fallback only recognizes persisted statuses", () => {
  for (const status of ["active", "pending", "registered"]) {
    assert.equal(registryNetworkRows(result({ wallets: [{ ...wallets[0], status }] }))[0].registrationState, "registered");
  }
  for (const registrationState of ["unknown", "unrecognized", "pending_registration"]) {
    const row = registryNetworkRows(result({ wallets: [{ ...wallets[0], registrationState }] }))[0];
    assert.equal(row.status, "active");
    assert.equal(row.registrationState, "unknown");
    assert.equal(row.address, wallets[0].address);
  }
  assert.equal(registryNetworkRows(result({ wallets: [{ ...wallets[0], status: "unrecognized" }] }))[0].registrationState, "unknown");
  const input = result({ wallets: [{ ...wallets[0], status: "pending", registrationState: "registered" }] });
  const before = structuredClone(input);
  const row = registryNetworkRows(input)[0];
  assert.equal(row.registrationState, "registered");
  assert.equal(row.status, "pending");
  assert.ok(!("onChainAccountExists" in row) && !("balance" in row));
  assert.deepEqual(input, before);
});

test("null explorer metadata is not reconstructed from the network or wallet address", () => {
  const rows = registryNetworkRows(result({ wallets: [{ ...wallets[0], explorerUrl: null }] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].explorerUrl, null);
  assert.deepEqual(registryNetworkRows(result({ wallets: [] })), []);
});

test("duplicate associations have one detailed row and preserve the active server record", () => {
  const rows = registryNetworkRows(result({
    wallets: [{ ...wallets[0], address: "old-pending", status: "pending", explorerUrl: null }, ...wallets],
    walletRegistration: { unregisteredNetworks: ["stellar:testnet", "stellar:testnet"] },
  }));
  assert.equal(rows.length, 5);
  assert.equal(rows[0].address, wallets[0].address);
  assert.equal(rows[0].status, "active");
});
