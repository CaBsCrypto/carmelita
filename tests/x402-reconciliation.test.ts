import assert from "node:assert/strict";
import test from "node:test";
import { Networks, rpc, StrKey, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import {
  captureX402Execution, reconcileX402Payment, validateX402Settlement,
} from "../app/x402/reconciliation";
import { fixtureRecipient, reconciliationRpc, stellarReconciliationFixture } from "./x402-reconciliation-fixtures";

test("captures the real signed authorization and pre-send ledger for V1 and V2", async () => {
  for (const authV2 of [false, true]) {
    const fixture = await stellarReconciliationFixture({ authV2 });
    const captured = await captureX402Execution({
      prepared: fixture.prepared, signedTransaction: fixture.signedTransaction,
      requestHash: fixture.execution.requestHash, address: fixture.execution.walletAddress,
    }, reconciliationRpc(fixture));
    assert.equal(captured.nonce, fixture.execution.nonce);
    assert.equal(captured.authorizationHash, fixture.execution.authorizationHash);
    assert.equal(captured.firstLedger, 100);
    assert.equal(captured.signedTransaction, fixture.signedTransaction);
  }
});

test("preserves signed Int64 authorization nonces without Number conversion", async () => {
  const fixture = await stellarReconciliationFixture({ nonce: "-9223372036854775808" });
  const captured = await captureX402Execution({
    prepared: fixture.prepared, signedTransaction: fixture.signedTransaction,
    requestHash: fixture.execution.requestHash, address: fixture.execution.walletAddress,
  }, reconciliationRpc(fixture));
  assert.equal(captured.nonce, "-9223372036854775808");
  assert.equal((await reconcileX402Payment({ execution: captured, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture))).status, "verified");
});

test("accepts a contract recipient while keeping the user signature and transfer exact", async () => {
  const fixture = await stellarReconciliationFixture({ recipient: StrKey.encodeContract(Buffer.alloc(32, 15)) });
  const captured = await captureX402Execution({
    prepared: fixture.prepared, signedTransaction: fixture.signedTransaction,
    requestHash: fixture.execution.requestHash, address: fixture.execution.walletAddress,
  }, reconciliationRpc(fixture));
  const result = await reconcileX402Payment({ execution: captured, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture));
  assert.equal(result.status, "verified", result.reason);
  assert.equal(result.verification?.payTo, fixture.execution.payTo);
});

test("capture rejects expired authorization, non-Testnet RPC and invalid approval signature", async () => {
  const fixture = await stellarReconciliationFixture();
  const input = {
    prepared: fixture.prepared, signedTransaction: fixture.signedTransaction,
    requestHash: fixture.execution.requestHash, address: fixture.execution.walletAddress,
  };
  await assert.rejects(captureX402Execution(input, reconciliationRpc(fixture, {
    getLatestLedger: async () => ({ sequence: 201 }),
  })), /authorization_expired/);
  await assert.rejects(captureX402Execution(input, reconciliationRpc(fixture, {
    getNetwork: async () => ({ passphrase: Networks.PUBLIC }),
  })), /network_mismatch/);
  const transaction = TransactionBuilder.fromXDR(fixture.signedTransaction, Networks.TESTNET);
  const envelope = transaction.toEnvelope();
  envelope.v1().tx().operations()[0].body().invokeHostFunctionOp().auth()[0].credentials().address().signature(xdr.ScVal.scvVoid());
  await assert.rejects(captureX402Execution({ ...input, signedTransaction: envelope.toXDR("base64") }, reconciliationRpc(fixture)),
    /signature_missing/);
});

test("receipt validation rejects false success, wrong network/payer and malformed hash", async () => {
  const fixture = await stellarReconciliationFixture();
  const receipt = { success: true, network: fixture.execution.network, payer: fixture.execution.walletAddress, transaction: fixture.transactionHash };
  assert.equal(validateX402Settlement(receipt, fixture.execution), fixture.transactionHash);
  assert.equal(validateX402Settlement({ ...receipt, payer: undefined }, fixture.execution), fixture.transactionHash);
  for (const override of [{ success: false }, { network: "stellar:pubnet" }, { payer: fixtureRecipient.publicKey() }, { transaction: "xyz" }]) {
    assert.throws(() => validateX402Settlement({ ...receipt, ...override }, fixture.execution));
  }
});

test("verifies facilitator-rebuilt and fee-bump hashes using exact auth and transfer metadata", async () => {
  for (const feeBump of [false, true]) {
    for (const metadataVersion of [3, 4] as const) {
      const fixture = await stellarReconciliationFixture({ feeBump, metadataVersion });
      assert.notEqual(TransactionBuilder.fromXDR(fixture.signedTransaction, Networks.TESTNET).hash().toString("hex"), fixture.transactionHash);
      const result = await reconcileX402Payment({ execution: fixture.execution, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture));
      assert.equal(result.status, "verified", result.reason);
      assert.equal(result.transactionHash, fixture.transactionHash);
      assert.equal(result.verification?.feeBump, feeBump);
      assert.equal(result.verification?.feesSponsored, true);
      assert.ok(StrKey.isValidEd25519PublicKey(String(result.verification?.feePayer)));
      assert.notEqual(result.verification?.feePayer, fixture.execution.walletAddress);
      assert.equal(result.verification?.nonce, fixture.execution.nonce);
      assert.equal(result.verification?.requestHash, fixture.execution.requestHash);
    }
  }
});

test("rejects user-paid fees for normal and fee-bump envelopes, including muxed aliases", async () => {
  for (const feeBump of [false, true]) {
    for (const muxedFeeSource of [false, true]) {
      const fixture = await stellarReconciliationFixture({ feeBump, muxedFeeSource, userPaysFee: true });
      const result = await reconcileX402Payment({ execution: fixture.execution, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture));
      assert.equal(result.status, "pending");
      assert.equal(result.reason, "x402_rpc_fee_sponsorship_mismatch");
      assert.equal(result.verification, undefined);
    }
  }
});

test("accepts an external fee sponsor even when the inner transaction source is the user", async () => {
  const fixture = await stellarReconciliationFixture({ feeBump: true, innerSourceIsUser: true, muxedFeeSource: true });
  const captured = await captureX402Execution({
    prepared: fixture.prepared, signedTransaction: fixture.signedTransaction,
    requestHash: fixture.execution.requestHash, address: fixture.execution.walletAddress,
  }, reconciliationRpc(fixture));
  const result = await reconcileX402Payment({ execution: captured, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture));
  assert.equal(result.status, "verified", result.reason);
  assert.equal(result.verification?.feesSponsored, true);
  assert.notEqual(result.verification?.feePayer, captured.walletAddress);
});

test("recovers the exact authorization after response loss using read-only event discovery", async () => {
  const fixture = await stellarReconciliationFixture({ feeBump: true, authV2: true });
  const calls: string[] = [];
  const result = await reconcileX402Payment({ execution: fixture.execution }, reconciliationRpc(fixture, {
    getEvents: async (request) => {
      calls.push("events");
      assert.equal(request.startLedger, 100);
      assert.equal(request.filters[0].contractIds?.[0], fixture.execution.assetContract);
      return fixture.page;
    },
    getTransaction: async (hash) => { calls.push("transaction"); assert.equal(hash, fixture.transactionHash); return fixture.transaction; },
  }));
  assert.equal(result.status, "verified", result.reason);
  assert.deepEqual(calls, ["events", "transaction"]);
});

test("rejects a successful transaction with different nonce, altered recipient or incorrect delivery-independent transfer amount", async () => {
  const fixture = await stellarReconciliationFixture();
  for (const candidate of [
    await stellarReconciliationFixture({ nonce: "54321" }),
    await stellarReconciliationFixture({ eventAmount: "99999" }),
    await stellarReconciliationFixture({ eventRecipient: fixture.execution.walletAddress }),
  ]) {
    const result = await reconcileX402Payment({ execution: fixture.execution, transactionHash: candidate.transactionHash }, reconciliationRpc(candidate));
    assert.equal(result.status, "pending");
    assert.equal(result.verification, undefined);
  }
});

test("checks actual envelope hash, persisted nonce, Mainnet signature and ledger range", async () => {
  const fixture = await stellarReconciliationFixture();
  const mainnet = await stellarReconciliationFixture({ signatureNetwork: Networks.PUBLIC });
  for (const result of [
    await reconcileX402Payment({ execution: { ...fixture.execution, nonce: "9" } }, reconciliationRpc(fixture)),
    await reconcileX402Payment({ execution: mainnet.execution, transactionHash: mainnet.transactionHash }, reconciliationRpc(mainnet)),
    await reconcileX402Payment({ execution: fixture.execution, transactionHash: "aa".repeat(32) }, reconciliationRpc(fixture, {
      getTransaction: async () => ({ ...fixture.transaction, txHash: "aa".repeat(32) }),
    })),
    await reconcileX402Payment({ execution: fixture.execution, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture, {
      getTransaction: async () => ({ ...fixture.transaction, ledger: 99 }),
    })),
  ]) assert.equal(result.status, "pending");
});

test("rejects SUCCESS labels with failed XDR results or mismatched fee-bump inner hash", async () => {
  const fixture = await stellarReconciliationFixture();
  const failed = new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString("100"), result: xdr.TransactionResultResult.txFailed([]), ext: new xdr.TransactionResultExt(0),
  });
  assert.equal((await reconcileX402Payment({ execution: fixture.execution, transactionHash: fixture.transactionHash }, reconciliationRpc(fixture, {
    getTransaction: async () => ({ ...fixture.transaction, resultXdr: failed }),
  }))).status, "pending");
  const bump = await stellarReconciliationFixture({ feeBump: true });
  bump.transaction.resultXdr.result().innerResultPair().transactionHash(Buffer.alloc(32));
  const result = await reconcileX402Payment({ execution: bump.execution, transactionHash: bump.transactionHash }, reconciliationRpc(bump));
  assert.equal(result.status, "pending");
  assert.equal(result.reason, "x402_rpc_inner_hash_mismatch");
});

test("does not lose the page cursor when a candidate is missing, malformed or RPC times out", async () => {
  const fixture = await stellarReconciliationFixture();
  const missing: rpc.Api.GetMissingTransactionResponse = {
    status: rpc.Api.GetTransactionStatus.NOT_FOUND, txHash: fixture.transactionHash,
    latestLedger: 150, oldestLedger: 1, latestLedgerCloseTime: 1, oldestLedgerCloseTime: 1,
  };
  const emptyMetadata = new xdr.TransactionMeta(0, []);
  for (const getTransaction of [
    async () => missing,
    async () => ({ ...fixture.transaction, resultMetaXdr: emptyMetadata }),
    async () => { throw new Error("timeout with private endpoint details"); },
  ]) {
    const result = await reconcileX402Payment({ execution: fixture.execution, cursor: "previous-page" }, reconciliationRpc(fixture, { getTransaction }));
    assert.equal(result.status, "pending");
    assert.equal(result.cursor, "previous-page");
    assert.equal(JSON.stringify(result).includes("private endpoint"), false);
  }
});

test("ignores another verified envelope's different authorization but keeps the target", async () => {
  const fixture = await stellarReconciliationFixture();
  const other = await stellarReconciliationFixture({ nonce: "54321" });
  const result = await reconcileX402Payment({ execution: fixture.execution }, reconciliationRpc(fixture, {
    getEvents: async () => ({ ...fixture.page, events: [other.event, fixture.event] }),
    getTransaction: async (hash) => hash === other.transactionHash ? other.transaction : fixture.transaction,
  }));
  assert.equal(result.status, "verified", result.reason);
  assert.equal(result.transactionHash, fixture.transactionHash);
});

test("empty and expired/history-pruned searches remain pending and never establish non-payment", async () => {
  const fixture = await stellarReconciliationFixture();
  for (const page of [
    { ...fixture.page, events: [], latestLedger: 500 },
    { ...fixture.page, oldestLedger: 101 },
    { ...fixture.page, latestLedger: 50 },
  ]) {
    const result = await reconcileX402Payment({ execution: fixture.execution }, reconciliationRpc(fixture, { getEvents: async () => page }));
    assert.equal(result.status, "pending");
    assert.equal(result.transactionHash, undefined);
  }
});

test("scans at most five pages and checkpoints only completed pages", async () => {
  const fixture = await stellarReconciliationFixture();
  let pages = 0;
  const result = await reconcileX402Payment({ execution: fixture.execution }, reconciliationRpc(fixture, {
    getEvents: async () => {
      pages += 1;
      return { ...fixture.page, events: Array.from({ length: 100 }, () => ({ ...fixture.event, ledger: 99 })), cursor: `page-${pages}` };
    },
    getTransaction: async () => { throw new Error("out-of-window events must not query transactions"); },
  }));
  assert.equal(pages, 5);
  assert.equal(result.status, "pending");
  assert.equal(result.cursor, "page-5");
  assert.equal(result.reason, "x402_reconciliation_page_limit");
});

test("preserves the last completed page if the next page contains an unresolved candidate", async () => {
  const fixture = await stellarReconciliationFixture();
  let pages = 0;
  const result = await reconcileX402Payment({ execution: fixture.execution }, reconciliationRpc(fixture, {
    getEvents: async () => ++pages === 1
      ? { ...fixture.page, events: Array.from({ length: 100 }, () => ({ ...fixture.event, ledger: 99 })), cursor: "completed-first" }
      : { ...fixture.page, cursor: "must-not-advance" },
    getTransaction: async () => { throw new Error("temporary RPC failure"); },
  }));
  assert.equal(result.status, "pending");
  assert.equal(result.cursor, "completed-first");
});
