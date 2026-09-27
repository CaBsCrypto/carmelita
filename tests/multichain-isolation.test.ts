import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of [
  "app/agent-chat-store.ts",
  "app/api/agent/defindex/route.ts",
  "app/api/agent/soroswap/route.ts",
  "app/api/agent/x402/route.ts",
]) {
  test(`${file} rejects non-Stellar wallets before Stellar execution`, () => {
    const source = readFileSync(file, "utf8");
    assert.match(source, /listPersistedUserWallets/);
    assert.match(source, /candidate\.userId === userId && candidate\.network === "stellar:testnet" && candidate\.chainType === "stellar"/);
    assert.doesNotMatch(source, /\.from\(agentWallets\)/);
  });
}
