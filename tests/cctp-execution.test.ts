import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeFunctionData } from "viem";
import { StrKey } from "@stellar/stellar-sdk";
import {
  CCTP_APPROVE_ABI,
  CCTP_BURN_ABI,
  CCTP_MAX_FEE_ATOMIC,
  CCTP_STANDARD_FINALITY,
  encodeCctpApprove,
  encodeCctpBurn,
} from "../app/cctp/evm";
import {
  assertCctpAttestedMessage,
  getCctpAttestation,
} from "../app/cctp/attestation";
import {
  buildCctpFujiToStellarPlan,
  CCTP_TESTNET,
} from "../app/connectors/circle-cctp";

const EVM = "0x2BAa52Fa82FbFd5d103EB30181Bd0Fa11a04c0d0";
const STELLAR = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";

function plan() {
  return buildCctpFujiToStellarPlan({
    amount: "1",
    sourceAddress: EVM,
    destinationAddress: STELLAR,
  });
}

test("CCTP approve grants only the exact bridge amount", () => {
  const decoded = decodeFunctionData({
    abi: CCTP_APPROVE_ABI,
    data: encodeCctpApprove("1000000"),
  });
  assert.equal(decoded.functionName, "approve");
  assert.deepEqual(decoded.args, [
    CCTP_TESTNET.avalanche.tokenMessengerV2,
    BigInt(1_000_000),
  ]);
});

test("CCTP burn is pinned to Stellar forwarder, standard finality and bounded fee", () => {
  const current = plan();
  const decoded = decodeFunctionData({
    abi: CCTP_BURN_ABI,
    data: encodeCctpBurn({
      amountAtomic: current.amountAtomic,
      mintRecipient: current.safety.mintRecipient,
      destinationCaller: current.safety.destinationCaller,
      hookData: current.safety.hookData,
    }),
  });
  assert.equal(decoded.functionName, "depositForBurnWithHook");
  assert.deepEqual(decoded.args?.slice(0, 7), [
    BigInt(1_000_000),
    CCTP_TESTNET.stellar.domain,
    current.safety.mintRecipient,
    CCTP_TESTNET.avalanche.usdc,
    current.safety.destinationCaller,
    CCTP_MAX_FEE_ATOMIC,
    CCTP_STANDARD_FINALITY,
  ]);
  assert.equal(decoded.args?.[2], decoded.args?.[4]);
});

test("CCTP burn rejects different mint recipient and destination caller", () => {
  const current = plan();
  assert.throws(() => encodeCctpBurn({
    amountAtomic: current.amountAtomic,
    mintRecipient: current.safety.mintRecipient,
    destinationCaller: `0x${"00".repeat(32)}`,
    hookData: current.safety.hookData,
  }), /cctp_forwarder_scope_mismatch/);
});

test("Circle attestation polling is one bounded read and reports pending", async () => {
  let calls = 0;
  const result = await getCctpAttestation(
    `0x${"11".repeat(32)}`,
    async (_input, init) => {
      calls += 1;
      assert.equal(init?.method, "GET");
      assert.equal(init?.credentials, "omit");
      return new Response("", { status: 404 });
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.status, "pending");
});

test("Circle complete attestation is normalized without automatic mint", async () => {
  const result = await getCctpAttestation(
    `0x${"11".repeat(32)}`,
    async () => new Response(JSON.stringify({
      messages: [{
        message: `0x${"22".repeat(64)}`,
        attestation: `0x${"33".repeat(65)}`,
        status: "complete",
      }],
    }), { headers: { "content-type": "application/json" } }),
  );
  assert.equal(result.status, "complete");
  assert.match(result.message ?? "", /^0x22/);
});

test("Circle attestation rejects malformed JSON and partial hex bytes", async () => {
  await assert.rejects(
    getCctpAttestation(
      `0x${"11".repeat(32)}`,
      async () => new Response("{", {
        headers: { "content-type": "application/json" },
      }),
    ),
    /cctp_attestation_json_invalid/,
  );
  await assert.rejects(
    getCctpAttestation(
      `0x${"11".repeat(32)}`,
      async () => new Response(JSON.stringify({
        messages: [{ message: "0x1", attestation: "0x22", status: "complete" }],
      })),
    ),
    /cctp_attestation_payload_invalid/,
  );
});

test("CCTP execution API is authenticated, capped and confirmation-scoped", async () => {
  const source = await readFile(
    new URL("../app/api/agent/bridge/cctp/execute/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /sameOrigin/);
  assert.match(source, /MAX_TESTNET_USDC = 5/);
  assert.match(source, /explicitUserConfirmation: z\.literal\(true\)/);
  assert.match(source, /evaluateUserAction/);
  assert.match(source, /quarantineCctpTransfer/);
  assert.ok(
    source.indexOf("assertCctpAttestedMessage({") <
      source.indexOf("row = await saveCctpAttestation({"),
  );
  assert.doesNotMatch(source, /privateKey|secretKey|process\.env.*KEY/i);
});

test("CCTP execution resumes submitted hashes instead of requesting a new signature", async () => {
  const route = await readFile(
    new URL("../app/api/agent/bridge/cctp/execute/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /case "approve_submitted": return row\.approve_tx_hash \? "verify_approve"/);
  assert.match(route, /case "burn_submitted": return row\.burn_tx_hash \? "verify_burn"/);
  assert.match(
    route,
    /prepared\.row\.status === "draft" \|\|\s*prepared\.row\.status === "approve_confirmed"/,
  );
  assert.match(route, /case "mint_submitted": return "mint"/);
  assert.match(route, /stageCctpMintSubmission/);
  assert.doesNotMatch(route, /claimCctpMint/);
  assert.match(route, /action: z\.literal\("refresh_evm"\)/);
  assert.match(route, /refreshCctpEvmPreview/);
});

test("CCTP client persists a broadcast hash before server verification", async () => {
  const source = await readFile(
    new URL("../app/agent/cctp-bridge-action.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useWallets/);
  assert.match(source, /useSignRawHash/);
  assert.match(source, /eth_sendTransaction/);
  assert.match(source, /window\.localStorage\.setItem\(storageKey/);
  assert.match(source, /window\.localStorage\.removeItem\(storageKey/);
  assert.match(source, /localMatchesServer/);
  assert.ok(
    source.indexOf("window.localStorage.setItem(storageKey") <
      source.indexOf("await recordEvm(submittedAction.kind"),
  );
  assert.doesNotMatch(source, /setInterval|privateKey|secretKey/i);
});

test("CCTP durable store rejects replacement hashes and quarantines ambiguity", async () => {
  const source = await readFile(
    new URL("../app/cctp/store.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(source, /approve_tx_hash text UNIQUE/);
  assert.match(source, /burn_tx_hash text UNIQUE/);
  assert.match(source, /mint_tx_hash text UNIQUE/);
  assert.match(source, /hash_replacement_rejected/);
  assert.match(source, /reconciliation_required/);
});

test("CCTP Stellar mint stores one signed payload and checks chain before replay", async () => {
  const store = await readFile(
    new URL("../app/cctp/store.ts", import.meta.url),
    "utf8",
  );
  const stellar = await readFile(
    new URL("../app/cctp/stellar.ts", import.meta.url),
    "utf8",
  );
  assert.match(store, /mint_signed_xdr text/);
  assert.match(store, /mint_expected_hash text/);
  assert.match(store, /cctp_mint_payload_replacement_rejected/);
  assert.ok(stellar.indexOf("getTransaction") < stellar.indexOf("sendTransaction"));
  assert.match(stellar, /cctp_mint_signed_xdr_hash_mismatch/);
});

test("expired EVM previews refresh only before a hash is broadcast", async () => {
  const store = await readFile(
    new URL("../app/cctp/store.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../app/agent/cctp-bridge-action.tsx", import.meta.url),
    "utf8",
  );
  assert.match(store, /refresh_after_broadcast_rejected/);
  assert.match(store, /AND \$\{hashColumn\} IS NULL/);
  assert.match(client, /action: "refresh_evm"/);
});

function uint256(value: bigint) {
  return Buffer.from(value.toString(16).padStart(64, "0"), "hex");
}

function bytes32Evm(value: string) {
  return Buffer.from(value.slice(2).padStart(64, "0"), "hex");
}

function validAttestedMessage() {
  const current = plan();
  const header = Buffer.alloc(148);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(CCTP_TESTNET.avalanche.domain, 4);
  header.writeUInt32BE(CCTP_TESTNET.stellar.domain, 8);
  Buffer.alloc(32, 1).copy(header, 12);
  bytes32Evm(CCTP_TESTNET.avalanche.tokenMessengerV2).copy(header, 44);
  Buffer.from(
    StrKey.decodeContract(CCTP_TESTNET.stellar.tokenMessengerMinter),
  ).copy(header, 76);
  Buffer.from(current.safety.destinationCaller.slice(2), "hex").copy(header, 108);
  header.writeUInt32BE(CCTP_STANDARD_FINALITY, 140);
  header.writeUInt32BE(CCTP_STANDARD_FINALITY, 144);

  const hook = Buffer.from(current.safety.hookData.slice(2), "hex");
  const body = Buffer.alloc(228 + hook.length);
  body.writeUInt32BE(1, 0);
  bytes32Evm(CCTP_TESTNET.avalanche.usdc).copy(body, 4);
  Buffer.from(current.safety.mintRecipient.slice(2), "hex").copy(body, 36);
  uint256(BigInt(current.amountAtomic)).copy(body, 68);
  bytes32Evm(EVM).copy(body, 100);
  uint256(CCTP_MAX_FEE_ATOMIC).copy(body, 132);
  uint256(BigInt(0)).copy(body, 164);
  uint256(BigInt(123456)).copy(body, 196);
  hook.copy(body, 228);
  return `0x${Buffer.concat([header, body]).toString("hex")}` as const;
}

function assertValidMessage(overrides: Partial<{
  amountAtomic: string;
  hookData: string;
  message: `0x${string}`;
}> = {}) {
  const current = plan();
  return assertCctpAttestedMessage({
    message: overrides.message ?? validAttestedMessage(),
    amountAtomic: overrides.amountAtomic ?? current.amountAtomic,
    sourceAddress: EVM,
    mintRecipient: current.safety.mintRecipient,
    destinationCaller: current.safety.destinationCaller,
    hookData: overrides.hookData ?? current.safety.hookData,
    maxFeeAtomic: CCTP_MAX_FEE_ATOMIC,
    finalityThreshold: CCTP_STANDARD_FINALITY,
  });
}

test("attested CCTP message is bound to domains, wallets, amount and hook", () => {
  const decoded = assertValidMessage();
  assert.equal(decoded.sourceDomain, 1);
  assert.equal(decoded.destinationDomain, 27);
  assert.equal(decoded.body.amount, BigInt(plan().amountAtomic));
});

test("attested CCTP message rejects a different amount before mint", () => {
  assert.throws(
    () => assertValidMessage({ amountAtomic: "999999" }),
    /cctp_attested_message_amount_mismatch/,
  );
});

test("attested CCTP message rejects a different destination hook before mint", () => {
  assert.throws(
    () => assertValidMessage({ hookData: `0x${"00".repeat(32)}` }),
    /cctp_attested_message_hook_data_mismatch/,
  );
});

test("attestation from another domain cannot unlock the existing Fuji executor", () => {
  const bytes = Buffer.from(validAttestedMessage().slice(2), "hex");
  bytes.writeUInt32BE(6, 4);
  assert.throws(() => assertValidMessage({ message: `0x${bytes.toString("hex")}` }), /source_domain_mismatch/);
});

test("same-amount attestation with a substituted asset is rejected before mint", () => {
  const bytes = Buffer.from(validAttestedMessage().slice(2), "hex");
  bytes.fill(0, 148 + 4, 148 + 36);
  assert.throws(() => assertValidMessage({ message: `0x${bytes.toString("hex")}` }), /burn_token_mismatch/);
});
