import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("first-party bootstrap provisions Fuji additively and retains Stellar", async () => {
  const source = await readFile(new URL("../app/api/agent/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /sameOrigin/);
  assert.match(source, /provisionUserWallets/);
  assert.match(source, /wallets:\s*\{[\s\S]*stellar:\s*onboarding\.stellar,[\s\S]*avalanche:\s*onboarding\.avalanche\.wallet/);
  assert.match(source, /wallet:\s*onboarding\.stellar,[\s\S]*wallets:/);
  assert.doesNotMatch(source, /rawSign|signTypedData|sendTransaction|fundWallet|faucet/i);
});

test("onboarding is metadata-only and MCP context exposes persisted networks", async () => {
  const onboarding = await readFile(new URL("../app/wallets/avalanche-onboarding.ts", import.meta.url), "utf8");
  const context = await readFile(new URL("../app/mcp/agent-context.ts", import.meta.url), "utf8");
  assert.match(onboarding, /network:\s*AVALANCHE_ONBOARDING_NETWORK/);
  assert.match(onboarding, /fundsMoved:\s*false/);
  assert.match(onboarding, /signingRequired:\s*false/);
  assert.doesNotMatch(onboarding, /rawSign|signTypedData|sendTransaction|faucet/i);
  assert.match(context, /listPersistedUserWallets\(userId\)/);
  assert.match(context, /map\(\(\{ address, chainType, network, status \}\) => \(\{ address, chainType, network, status \}\)\)/);
  assert.doesNotMatch(context, /\.from\(agentWallets\)/);
  assert.match(context, /paymentSigning:\s*"not_enabled"/);
  assert.doesNotMatch(context, /privateKey|secret|balance/);
});

test("onboarding UI renders one EVM wallet with enabled networks while retaining Stellar", async () => {
  const source = await readFile(new URL("../app/agent/agent-onboarding.tsx", import.meta.url), "utf8");
  assert.match(source, /wallets:\s*\{/);
  assert.match(source, /result\.wallets\.evm\.address/);
  assert.match(source, /EVM WALLET/);
  assert.match(source, /result\.evm\.networks\.map/);
  assert.match(source, /result\.wallet\.address/);
  assert.doesNotMatch(source, /fundWallet|rawSign|sendTransaction/);
});
