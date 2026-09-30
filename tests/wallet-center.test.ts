import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Wallet Center exposes Fuji and Solana Devnet active cards and diagnostics", async () => {
  const source = await readFile(
    new URL("../app/agent/wallet-center.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /network: "avalanche:fuji"/);
  assert.match(source, /useWalletReadings/);
  assert.match(source, /explicitUserConfirmation: true/);
  assert.match(source, /Solana Devnet/);
  assert.match(source, /\/api\/agent\/wallets\/solana/);
  assert.match(source, /\/api\/agent\/wallets\/solana\/fund/);
  assert.match(source, /evmNetworks\.map/);
  assert.match(source, /reading\.balance/);
  assert.match(source, /t\.unavailable/);
});

test("chat workspace exposes one read-only wallet panel under demand", async () => {
  const source = await readFile(
    new URL("../app/agent/agent-onboarding.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import RegistryWalletPanel from "\.\/registry-wallet-panel"/);
  assert.match(source, /panel === "wallets" && <RegistryWalletPanel/);
  assert.doesNotMatch(source, /<WalletCenter|agent-wallet-grid/);
  assert.match(source, /getAccessToken=\{getAccessToken\}/);
});
