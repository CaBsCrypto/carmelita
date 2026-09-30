import assert from "node:assert/strict";
import test from "node:test";
import { StrKey } from "@stellar/stellar-sdk";
import { walletExplorerUrl } from "../app/wallets/explorer";
import { messageBlocks, safeExplorerLink } from "../app/agent/message-text";
import { registeredWalletsReply } from "../app/agent-chat-wallets";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText } from "../app/agent/message-text";

const stellar = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const evm = `0x${"1".repeat(40)}`;
const solana = "EP4e2aK9EWRNAQvJTgAJ5tQ7qwuiUAfrZozyGFPsesqk";
test("five explorer destinations preserve network and address", () => {
  assert.equal(walletExplorerUrl("stellar:testnet", stellar), `https://stellar.expert/explorer/testnet/account/${stellar}`);
  assert.equal(walletExplorerUrl("avalanche:fuji", evm), `https://explorer-test.avax.network/c-chain/address/${evm}`);
  assert.equal(walletExplorerUrl("bnb:testnet", evm), `https://testnet.bscscan.com/address/${evm}`);
  assert.equal(walletExplorerUrl("base:sepolia", evm), `https://sepolia.basescan.org/address/${evm}`);
  assert.equal(walletExplorerUrl("solana:devnet", solana), `https://explorer.solana.com/address/${solana}?cluster=devnet`);
  for (const network of ["stellar:testnet", "avalanche:fuji", "solana:devnet", "unknown"]) assert.equal(walletExplorerUrl(network, "invalid/address"), null);
});
test("wallet tables retain pending state, language and ownership", () => {
  const rows = [{ id: "stellar", userId: "owner", address: stellar, network: "stellar:testnet", status: "pending" }, { id: "foreign", userId: "other", address: solana, network: "solana:devnet", status: "active" }];
  for (const language of ["es", "en", "pt"] as const) {
    const reply = registeredWalletsReply("owner", rows, language);
    assert.ok(reply.content.includes(walletExplorerUrl("stellar:testnet", stellar)!));
    assert.doesNotMatch(reply.content, new RegExp(solana));
    const table = messageBlocks(reply.content).find(block => block.kind === "table");
    assert.ok(table?.kind === "table"); assert.equal(table.rows.length, 1); assert.equal(table.headers.length, 4);
    assert.deepEqual(reply.actions, []);
  }
});
test("rendering rejects unsafe URLs and treats HTML as text", () => {
  for (const value of ["javascript:alert(1)", "https://stellar.expert.evil.test/", "https://user:password@stellar.expert/", "http://stellar.expert/", "https://stellar.expert:444/"]) assert.equal(safeExplorerLink(value), null);
  assert.equal(safeExplorerLink(walletExplorerUrl("solana:devnet", solana)!), walletExplorerUrl("solana:devnet", solana));
  assert.deepEqual(messageBlocks("<script>bad</script>"), [{kind:"paragraph",text:"<script>bad</script>"}]);
  const html = renderToStaticMarkup(createElement(MessageText, { content: `| Red | Explorador |\n| --- | --- |\n| Stellar | [Ver](${walletExplorerUrl("stellar:testnet", stellar)}) |\n<script>bad</script>` }));
  assert.match(html, /<table/); assert.match(html, /scope="col"/); assert.match(html, /tabindex="0"/);
  assert.match(html, /rel="noopener noreferrer"/); assert.doesNotMatch(html, /<script>/);
});
test("expanded catalog produces five rows with one EVM address and separate links", () => {
  const before = { VERCEL_ENV: process.env.VERCEL_ENV, CARMELITA_PREVIEW_ISOLATED: process.env.CARMELITA_PREVIEW_ISOLATED, CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED };
  Object.assign(process.env, { VERCEL_ENV: "preview", CARMELITA_PREVIEW_ISOLATED: "true", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" });
  try {
    const rows = ["stellar:testnet", "avalanche:fuji", "bnb:testnet", "base:sepolia", "solana:devnet"].map(network => ({ id: network, userId: "owner", network, address: network.startsWith("stellar") ? stellar : network.startsWith("solana") ? solana : evm, status: network.startsWith("stellar") ? "pending" : "active" }));
    for (const language of ["es", "en", "pt"] as const) {
      const reply = registeredWalletsReply("owner", rows, language);
      const table = messageBlocks(reply.content).find(block => block.kind === "table");
      assert.ok(table?.kind === "table"); assert.equal(table.rows.length, 5);
      const evmRows = table.rows.filter(row => row[1] === evm);
      assert.equal(evmRows.length, 3); assert.equal(new Set(evmRows.map(row => row[3])).size, 3);
      assert.match(table.rows[0][2], /pendiente|pending|pendente/);
    }
  } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
