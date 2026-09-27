import {
  Address,
  buildAuthorizationEntryPreimage,
  extractBaseAddress,
  FeeBumpTransaction,
  hash,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  StrKey,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { PreparedX402Authorization } from "@/app/x402/client-authorization";
import { X402_DEMO_LIMIT_ATOMIC, X402_TESTNET_USDC } from "@/app/x402/assets";

export type StellarX402ExecutionEvidence = {
  signedTransaction: string;
  authorizationHash: string;
  nonce: string;
  maxLedger: number;
  firstLedger: number;
  network: string;
  walletAddress: string;
  assetContract: string;
  payTo: string;
  amountAtomic: string;
  requestHash: string;
  claimedAt: string;
};

export type StellarX402ReadRpc = {
  getNetwork(): Promise<{ passphrase: string }>;
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(request: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
  getTransaction(transactionHash: string): Promise<rpc.Api.GetTransactionResponse>;
};

export type StellarX402ReconciliationResult = {
  status: "verified" | "pending";
  transactionHash?: string;
  verification?: Record<string, unknown>;
  cursor: string | null;
  reason?: string;
};

const HASH = /^[a-fA-F0-9]{64}$/;
const AUTH_HASH = /^0x[a-fA-F0-9]{64}$/;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_CANDIDATES = 20;
const READ_BUDGET_MS = 20_000;

function invariant(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}

function testnetRpc(): StellarX402ReadRpc {
  // This verifier cannot use a caller-supplied URL or an environment Mainnet fallback.
  return new rpc.Server("https://soroban-testnet.stellar.org", { timeout: 10_000 });
}

async function assertTestnet(client: StellarX402ReadRpc) {
  invariant((await client.getNetwork()).passphrase === Networks.TESTNET, "x402_rpc_network_mismatch");
}

function ledger(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

function validateTerms(execution: Pick<StellarX402ExecutionEvidence,
  "network" | "walletAddress" | "assetContract" | "payTo" | "amountAtomic" | "maxLedger" | "authorizationHash" | "requestHash"
>) {
  invariant(execution.network === X402_TESTNET_USDC.network, "x402_reconciliation_testnet_only");
  invariant(execution.assetContract === X402_TESTNET_USDC.contract, "x402_reconciliation_asset_mismatch");
  invariant(StrKey.isValidEd25519PublicKey(execution.walletAddress), "x402_reconciliation_wallet_invalid");
  invariant(StrKey.isValidEd25519PublicKey(execution.payTo) || StrKey.isValidContract(execution.payTo),
    "x402_reconciliation_recipient_invalid");
  invariant(/^[1-9]\d*$/.test(execution.amountAtomic) && BigInt(execution.amountAtomic) <= X402_DEMO_LIMIT_ATOMIC,
    "x402_reconciliation_amount_invalid");
  invariant(ledger(execution.maxLedger), "x402_reconciliation_expiry_invalid");
  invariant(AUTH_HASH.test(execution.authorizationHash), "x402_reconciliation_authorization_invalid");
  invariant(HASH.test(execution.requestHash), "x402_reconciliation_request_hash_invalid");
}

function transferArgs(execution: Pick<StellarX402ExecutionEvidence, "walletAddress" | "payTo" | "amountAtomic">) {
  return [
    nativeToScVal(execution.walletAddress, { type: "address" }),
    nativeToScVal(execution.payTo, { type: "address" }),
    nativeToScVal(execution.amountAtomic, { type: "i128" }),
  ];
}

function exactTransfer(call: xdr.InvokeContractArgs, execution: StellarX402ExecutionEvidence) {
  const args = transferArgs(execution);
  return Address.fromScAddress(call.contractAddress()).toString() === execution.assetContract
    && call.functionName().toString() === "transfer"
    && call.args().length === args.length
    && call.args().every((value, index) => value.toXDR("base64") === args[index].toXDR("base64"));
}

function inspectSignedAuthorization(signedTransaction: string, execution: StellarX402ExecutionEvidence) {
  const envelope = TransactionBuilder.fromXDR(signedTransaction, Networks.TESTNET);
  const transaction = envelope instanceof FeeBumpTransaction ? envelope.innerTransaction : envelope;
  invariant(transaction.operations.length === 1, "x402_reconciliation_operations_mismatch");
  const operation = transaction.operations[0];
  invariant(operation.type === "invokeHostFunction" && operation.auth?.length === 1,
    "x402_reconciliation_authorization_not_unique");
  invariant(operation.func.switch().name === "hostFunctionTypeInvokeContract"
    && exactTransfer(operation.func.invokeContract(), execution), "x402_reconciliation_transfer_mismatch");
  const authorization = operation.auth[0];
  const kind = authorization.credentials().switch().name;
  // Delegated and source-account credentials need a different acceptance contract.
  invariant(kind === "sorobanCredentialsAddress" || kind === "sorobanCredentialsAddressV2",
    "x402_reconciliation_credentials_unsupported");
  const credentials = kind === "sorobanCredentialsAddressV2"
    ? authorization.credentials().addressV2() : authorization.credentials().address();
  invariant(Address.fromScAddress(credentials.address()).toString() === execution.walletAddress,
    "x402_reconciliation_authorization_owner_mismatch");
  invariant(credentials.signatureExpirationLedger() === execution.maxLedger,
    "x402_reconciliation_authorization_expiry_mismatch");
  const invocation = authorization.rootInvocation();
  invariant(invocation.subInvocations().length === 0
    && invocation.function().switch().name === "sorobanAuthorizedFunctionTypeContractFn"
    && exactTransfer(invocation.function().contractFn(), execution),
  "x402_reconciliation_authorized_transfer_mismatch");

  const digest = hash(buildAuthorizationEntryPreimage(authorization, execution.maxLedger, Networks.TESTNET).toXDR());
  invariant(`0x${digest.toString("hex")}` === execution.authorizationHash.toLowerCase(),
    "x402_reconciliation_authorization_digest_mismatch");
  const signatures = credentials.signature();
  invariant(signatures.switch().name === "scvVec" && signatures.vec()?.length === 1,
    "x402_reconciliation_signature_missing");
  const signatureMap = signatures.vec()![0];
  invariant(signatureMap.switch().name === "scvMap" && signatureMap.map()?.length === 2,
    "x402_reconciliation_signature_invalid");
  const fields = new Map<string, Buffer>();
  for (const field of signatureMap.map()!) {
    invariant(field.key().switch().name === "scvSymbol" && field.val().switch().name === "scvBytes",
      "x402_reconciliation_signature_invalid");
    const key = field.key().sym().toString();
    invariant(!fields.has(key) && (key === "public_key" || key === "signature"),
      "x402_reconciliation_signature_invalid");
    fields.set(key, Buffer.from(field.val().bytes()));
  }
  const signer = Keypair.fromPublicKey(execution.walletAddress);
  const publicKey = fields.get("public_key");
  const signature = fields.get("signature");
  invariant(publicKey?.equals(signer.rawPublicKey()) && signature?.length === 64
    && signer.verify(digest, signature), "x402_reconciliation_signature_invalid");
  return {
    authorization,
    nonce: credentials.nonce().toString(),
    envelope,
    feeBump: envelope instanceof FeeBumpTransaction,
  };
}

export async function captureX402Execution(input: {
  prepared: PreparedX402Authorization;
  signedTransaction: string;
  requestHash: string;
  address: string;
}, client: StellarX402ReadRpc = testnetRpc()): Promise<StellarX402ExecutionEvidence> {
  const execution: StellarX402ExecutionEvidence = {
    signedTransaction: input.signedTransaction,
    authorizationHash: input.prepared.authorizationHash,
    nonce: "",
    maxLedger: input.prepared.maxLedger,
    firstLedger: 0,
    network: input.prepared.requirement.network,
    walletAddress: input.address,
    assetContract: input.prepared.requirement.asset,
    payTo: input.prepared.requirement.payTo,
    amountAtomic: input.prepared.requirement.amount,
    requestHash: input.requestHash,
    claimedAt: new Date().toISOString(),
  };
  validateTerms(execution);
  execution.nonce = inspectSignedAuthorization(input.signedTransaction, execution).nonce;
  await assertTestnet(client);
  const latest = await client.getLatestLedger();
  invariant(ledger(latest.sequence) && latest.sequence <= execution.maxLedger, "x402_authorization_expired");
  execution.firstLedger = latest.sequence;
  return execution;
}

export function validateX402Settlement(settlement: unknown, execution: StellarX402ExecutionEvidence): string {
  validateTerms(execution);
  invariant(settlement !== null && typeof settlement === "object", "x402_settlement_missing");
  const value = settlement as Record<string, unknown>;
  invariant(value.success === true, "x402_settlement_unsuccessful");
  invariant(value.network === execution.network, "x402_settlement_network_mismatch");
  invariant(value.payer === undefined || value.payer === execution.walletAddress, "x402_settlement_payer_mismatch");
  invariant(typeof value.transaction === "string" && HASH.test(value.transaction), "x402_settlement_transaction_invalid");
  return value.transaction.toLowerCase();
}

function matchesTransfer(topics: xdr.ScVal[], amount: xdr.ScVal, execution: StellarX402ExecutionEvidence) {
  if (topics.length !== 3 && topics.length !== 4) return false;
  const args = transferArgs(execution);
  return topics[0].switch().name === "scvSymbol" && topics[0].sym().toString() === "transfer"
    && topics[1].toXDR("base64") === args[0].toXDR("base64")
    && topics[2].toXDR("base64") === args[1].toXDR("base64")
    && amount.toXDR("base64") === args[2].toXDR("base64");
}

function transferEvents(metadata: xdr.TransactionMeta) {
  if (metadata.switch() === 3) return metadata.v3().sorobanMeta()?.events() ?? [];
  if (metadata.switch() === 4) return metadata.v4().operations().flatMap((operation) => operation.events());
  return [];
}

function verifyTransaction(
  response: rpc.Api.GetSuccessfulTransactionResponse,
  transactionHash: string,
  execution: StellarX402ExecutionEvidence,
  persistedAuthorization: xdr.SorobanAuthorizationEntry,
) {
  invariant(response.txHash.toLowerCase() === transactionHash, "x402_rpc_transaction_hash_mismatch");
  invariant(ledger(response.ledger) && response.ledger >= execution.firstLedger && response.ledger <= execution.maxLedger,
    "x402_rpc_transaction_ledger_mismatch");
  const envelope = TransactionBuilder.fromXDR(response.envelopeXdr, Networks.TESTNET);
  invariant(envelope.hash().toString("hex") === transactionHash, "x402_rpc_envelope_hash_mismatch");
  const feeBump = envelope instanceof FeeBumpTransaction;
  invariant(response.feeBump === feeBump, "x402_rpc_fee_bump_mismatch");
  // The facilitator may rebuild the source, or sponsor an inner transaction
  // through a fee bump. Only the final envelope determines who actually pays.
  const feePayer = extractBaseAddress(feeBump ? envelope.feeSource : envelope.source);
  invariant(feePayer !== execution.walletAddress, "x402_rpc_fee_sponsorship_mismatch");
  const outerResult = response.resultXdr.result();
  invariant(outerResult.switch().name === (feeBump ? "txFeeBumpInnerSuccess" : "txSuccess"),
    "x402_rpc_transaction_result_failed");
  const result = feeBump ? outerResult.innerResultPair().result().result() : outerResult;
  if (feeBump) {
    invariant(outerResult.innerResultPair().transactionHash().toString("hex") === envelope.innerTransaction.hash().toString("hex"),
      "x402_rpc_inner_hash_mismatch");
  }
  invariant(result.switch().name === "txSuccess", "x402_rpc_transaction_result_failed");
  const results = result.results();
  invariant(results.length === 1 && results[0].switch().name === "opInner"
    && results[0].tr().switch().name === "invokeHostFunction"
    && results[0].tr().invokeHostFunctionResult().switch().name === "invokeHostFunctionSuccess",
  "x402_rpc_operation_result_failed");
  const parsed = inspectSignedAuthorization(response.envelopeXdr.toXDR("base64"), execution);
  invariant(parsed.nonce === execution.nonce
    && parsed.authorization.toXDR("base64") === persistedAuthorization.toXDR("base64"),
  "x402_rpc_authorization_mismatch");
  const outgoing = transferEvents(response.resultMetaXdr).filter((event) => {
    const contract = event.contractId();
    if (!contract || Address.fromScAddress(xdr.ScAddress.scAddressTypeContract(contract)).toString() !== execution.assetContract
      || event.type().name !== "contract" || event.body().switch() !== 0) return false;
    const topics = event.body().v0().topics();
    return topics.length >= 2 && topics[0].switch().name === "scvSymbol" && topics[0].sym().toString() === "transfer"
      && topics[1].toXDR("base64") === nativeToScVal(execution.walletAddress, { type: "address" }).toXDR("base64");
  });
  invariant(outgoing.length === 1 && matchesTransfer(outgoing[0].body().v0().topics(), outgoing[0].body().v0().data(), execution),
    "x402_rpc_transfer_event_mismatch");
  return {
    version: "stellar-x402-rpc-v1",
    transactionHash,
    network: execution.network,
    ledger: response.ledger,
    feeBump: parsed.feeBump,
    feePayer,
    feesSponsored: true,
    walletAddress: execution.walletAddress,
    assetContract: execution.assetContract,
    payTo: execution.payTo,
    amountAtomic: execution.amountAtomic,
    authorizationHash: execution.authorizationHash,
    nonce: execution.nonce,
    maxLedger: execution.maxLedger,
    requestHash: execution.requestHash,
    verifiedAt: new Date().toISOString(),
  };
}

export async function reconcileX402Payment(input: {
  execution: StellarX402ExecutionEvidence;
  transactionHash?: string | null;
  cursor?: string | null;
}, client: StellarX402ReadRpc = testnetRpc()): Promise<StellarX402ReconciliationResult> {
  let cursor = input.cursor ?? null;
  const pending = (reason: string): StellarX402ReconciliationResult => ({ status: "pending", cursor, reason });
  try {
    const { execution } = input;
    validateTerms(execution);
    invariant(ledger(execution.firstLedger) && execution.firstLedger <= execution.maxLedger,
      "x402_reconciliation_first_ledger_invalid");
    const persisted = inspectSignedAuthorization(execution.signedTransaction, execution);
    invariant(persisted.nonce === execution.nonce, "x402_reconciliation_nonce_mismatch");
    await assertTestnet(client);
    const verify = (response: rpc.Api.GetSuccessfulTransactionResponse, transactionHash: string) => ({
      status: "verified" as const,
      transactionHash,
      verification: verifyTransaction(response, transactionHash, execution, persisted.authorization),
      cursor,
    });
    if (input.transactionHash) {
      invariant(HASH.test(input.transactionHash), "x402_reconciliation_transaction_hash_invalid");
      const transactionHash = input.transactionHash.toLowerCase();
      const response = await client.getTransaction(transactionHash);
      if (response.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        return pending(response.status === rpc.Api.GetTransactionStatus.FAILED
          ? "x402_transaction_failed_unresolved" : "x402_transaction_not_found");
      }
      return verify(response, transactionHash);
    }

    const symbol = nativeToScVal("transfer", { type: "symbol" }).toXDR("base64");
    const [from, to] = transferArgs(execution).map((arg) => arg.toXDR("base64"));
    const filters: rpc.Api.EventFilter[] = [{
      type: "contract",
      contractIds: [execution.assetContract],
      topics: [[symbol, from, to], [symbol, from, to, "*"]],
    }];
    const deadline = Date.now() + READ_BUDGET_MS;
    let candidates = 0;
    const visited = new Set<string>();
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      if (Date.now() >= deadline) return pending("x402_reconciliation_read_budget");
      const page = await client.getEvents(cursor
        ? { filters, cursor, limit: PAGE_SIZE }
        : { filters, startLedger: execution.firstLedger, limit: PAGE_SIZE });
      if (!ledger(page.oldestLedger) || !ledger(page.latestLedger)
        || page.oldestLedger > execution.firstLedger || page.latestLedger < execution.firstLedger) {
        return pending("x402_reconciliation_history_gap");
      }
      for (const event of page.events) {
        if (event.type !== "contract" || !event.inSuccessfulContractCall
          || event.contractId?.contractId() !== execution.assetContract
          || event.ledger < execution.firstLedger || event.ledger > execution.maxLedger
          || !matchesTransfer(event.topic, event.value, execution)) continue;
        invariant(HASH.test(event.txHash), "x402_rpc_event_hash_invalid");
        const transactionHash = event.txHash.toLowerCase();
        if (visited.has(transactionHash)) continue;
        if (candidates >= MAX_CANDIDATES || Date.now() >= deadline) return pending("x402_reconciliation_read_budget");
        candidates += 1;
        const response = await client.getTransaction(transactionHash);
        // Do not advance this page's cursor while its candidate could still settle.
        if (response.status === rpc.Api.GetTransactionStatus.NOT_FOUND) return pending("x402_candidate_not_found");
        visited.add(transactionHash);
        if (response.status === rpc.Api.GetTransactionStatus.FAILED) continue;
        try {
          return verify(response, transactionHash);
        } catch (error) {
          // Only a different digest on a hash-checked envelope resolves an unrelated
          // authorization. Missing/malformed proof must not move past this page.
          if (!(error instanceof Error) || error.message !== "x402_reconciliation_authorization_digest_mismatch") throw error;
        }
      }
      const previousCursor = cursor;
      cursor = page.cursor || cursor;
      if (page.events.length < PAGE_SIZE || cursor === previousCursor) {
        return pending("x402_matching_settlement_not_found");
      }
    }
    return pending("x402_reconciliation_page_limit");
  } catch (error) {
    return pending(error instanceof Error && /^x402_[a-z0-9_]+$/.test(error.message)
      ? error.message : "x402_reconciliation_rpc_unavailable");
  }
}
