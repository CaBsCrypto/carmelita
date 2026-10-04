import assert from "node:assert/strict";
import test from "node:test";
import { chatWalletContext, walletContext } from "../app/agent-chat-store";
import { chatBalanceDisplay } from "../app/agent/chat-balance-display";
import type { listPersistedUserWallets } from "../app/multichain-account";

const row: Awaited<ReturnType<typeof listPersistedUserWallets>>[number] = {
  id: "stellar", walletId: "stellar", userId: "owner", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  chainType: "stellar", network: "stellar:testnet", status: "pending", updatedAt: new Date(),
};

test("chat context deadline bounds a stalled Stellar provider even when it ignores cancellation", async () => {
  let signal: AbortSignal | undefined;
  const result = await walletContext("owner", async () => [row], async (_address, received) => {
    signal = received;
    return new Promise(() => {});
  }, 15);
  assert.equal(signal?.aborted, true);
  assert.equal(result?.address, row.address);
  assert.equal(result?.balance, null);
  assert.equal(result?.accountExists, null);
  assert.equal(chatBalanceDisplay(result?.balance, result?.accountExists, "es"), "Saldo no disponible");
});

test("chat read intent orchestration skips Stellar context before and after wallet/balance replies", async () => {
  for (const content of ["Mis billeteras", "My wallets", "Minhas carteiras", "Show my wallet", "Dame mis wallets", "Muéstrame mis saldos nativos", "Show my balances"]) {
    for (const stage of ["before", "after"]) {
      assert.equal(await chatWalletContext("owner", content, async () => {
        assert.fail(`RPC-dependent context called ${stage} read reply`);
      }), null);
    }
  }
  let calls = 0;
  await chatWalletContext("owner", "Explain Stellar", async () => { calls++; return null; });
  assert.equal(calls, 1);
});

test("pending, failed and real zero balances stay distinct in chat UI values", () => {
  for (const language of ["es", "en", "pt"] as const) {
    const unknown = chatBalanceDisplay(null, null, language);
    const pending = chatBalanceDisplay(null, false, language);
    assert.notEqual(unknown, "0");
    assert.notEqual(pending, "0");
    assert.notEqual(unknown, pending);
    assert.equal(chatBalanceDisplay("0", true, language), "0");
    assert.equal(chatBalanceDisplay("12.345", true, language), "12.345");
    assert.equal(chatBalanceDisplay(undefined, true, language), unknown);
  }
});


test("actual sendAgentMessage completes owned wallet and partial balance reads without ancillary Stellar RPC", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx",
    fileURLToPath(new URL("./chat-send-read-fixture.mts", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
});
