import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Wallet Center exposes Fuji and Solana Devnet active cards and diagnostics", async () => {
  const source = await readFile(
    new URL("../app/agent/wallet-center.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /network: "avalanche:fuji"/);
  assert.match(source, /\/api\/agent\/wallets\/avalanche/);
  assert.match(source, /explicitUserConfirmation: true/);
  assert.match(source, /Solana Devnet/);
  assert.match(source, /\/api\/agent\/wallets\/solana/);
  assert.match(source, /\/api\/agent\/wallets\/solana\/fund/);
});

test("Wallet Center is mounted after authenticated onboarding", async () => {
  const source = await readFile(
    new URL("../app/agent/agent-onboarding.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import WalletCenter from "\.\/wallet-center"/);
  assert.match(source, /<WalletCenter/);
  assert.match(source, /getAccessToken=\{getAccessToken\}/);
});
