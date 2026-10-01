import assert from "node:assert/strict";
import test from "node:test";
import { registryNetworkRows } from "../app/agent/registry-wallet-model";
import type { WalletRow, WalletNetworkView } from "../app/agent/wallet-readings";

const ids = ["stellar:testnet", "avalanche:fuji", "bnb:testnet", "base:sepolia", "solana:devnet"];
const networks: WalletNetworkView[] = ids.map(id => ({id, name: id, family: id.startsWith("stellar") ? "stellar" : id.startsWith("solana") ? "solana" : "evm", nativeAsset: "TEST", rollout: "experimental"}));
const wallets: WalletRow[] = ids.map((network, index) => ({id: String(index), network, address: index > 0 && index < 4 ? "0xshared" : "address" + index, chainType: "test", status: "active"}));

test("registry preserves five associations, shared EVM address and distinct test explorers", () => {
  const rows = registryNetworkRows(wallets, networks);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => row.status), Array(5).fill("active"));
  assert.equal(new Set(rows.slice(1, 4).map(row => row.address)).size, 1);
  assert.equal(new Set(rows.slice(1, 4).map(row => row.explorerUrl)).size, 3);
  assert.match(rows[0].explorerUrl!, /explorer\/testnet\/account\//);
  assert.equal(new URL(rows[4].explorerUrl!).searchParams.get("cluster"), "devnet");
});

test("partial registry keeps missing networks visible and pending states explicit", () => {
  const rows = registryNetworkRows([{...wallets[0], status: "pending"}], networks);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[1].status, null);
  assert.equal(rows[1].address, null);
  assert.equal(rows[1].explorerUrl, null);
});

test("planned networks are excluded and unexpected explorer networks fail closed", () => {
  const rows = registryNetworkRows(wallets, [...networks.map(network => ({...network, rollout: "planned"})), {...networks[0], id: "unknown", rollout: "active"}]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].explorerUrl, null);
});
