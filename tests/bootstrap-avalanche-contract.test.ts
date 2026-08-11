import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("first-party bootstrap provisions Fuji additively and retains Stellar", async () => {
  const source = await readFile(new URL("../app/api/agent/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /sameOrigin/);
  assert.match(source, /getOrCreateUserWallet\(claims\.user_id, "stellar"\)/);
  assert.match(source, /ensureAvalancheFujiWallet/);
  assert.match(source, /wallets:\s*\{[\s\S]*stellar:\s*wallet,[\s\S]*avalanche:\s*avalanche\.wallet/);
  assert.match(source, /wallet,[\s\S]*wallets:/);
  assert.doesNotMatch(source, /rawSign|signTypedData|sendTransaction|fundWallet|faucet/i);
});

test("onboarding is metadata-only and MCP context exposes persisted networks", async () => {
  const onboarding = await readFile(new URL("../app/wallets/avalanche-onboarding.ts", import.meta.url), "utf8");
  const context = await readFile(new URL("../app/mcp/agent-context.ts", import.meta.url), "utf8");
  assert.match(onboarding, /network:\s*AVALANCHE_ONBOARDING_NETWORK/);
  assert.match(onboarding, /fundsMoved:\s*false/);
  assert.match(onboarding, /signingRequired:\s*false/);
  assert.doesNotMatch(onboarding, /rawSign|signTypedData|sendTransaction|faucet/i);
  assert.match(context, /address:\s*agentWallets\.address/);
  assert.match(context, /chainType:\s*agentWallets\.chainType/);
  assert.match(context, /network:\s*agentWallets\.network/);
  assert.match(context, /where\(eq\(agentWallets\.userId, userId\)\)/);
  assert.match(context, /paymentSigning:\s*"not_enabled"/);
  assert.doesNotMatch(context, /privateKey|secret|balance/);
});
