import {
  Account, Address, authorizeEntry, buildAuthorizationEntryPreimage, Contract,
  hash, Keypair, MuxedAccount, nativeToScVal, Networks, Operation, rpc,
  TransactionBuilder, xdr,
} from "@stellar/stellar-sdk";
import { X402_TESTNET_USDC } from "../app/x402/assets";
import type { PreparedX402Authorization } from "../app/x402/client-authorization";
import type { StellarX402ExecutionEvidence, StellarX402ReadRpc } from "../app/x402/reconciliation";

// Deterministic, unfunded identities used only to generate local XDR fixtures.
export const fixtureSigner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));
export const fixtureRecipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12));
const facilitator = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 13));
const feePayer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 14));

export async function stellarReconciliationFixture(options: {
  nonce?: string;
  maxLedger?: number;
  feeBump?: boolean;
  authV2?: boolean;
  signatureNetwork?: string;
  amount?: string;
  recipient?: string;
  eventAmount?: string;
  eventRecipient?: string;
  metadataVersion?: 3 | 4;
  userPaysFee?: boolean;
  muxedFeeSource?: boolean;
  innerSourceIsUser?: boolean;
} = {}) {
  const amount = options.amount ?? "100000";
  const payTo = options.recipient ?? fixtureRecipient.publicKey();
  const maxLedger = options.maxLedger ?? 200;
  const nonce = options.nonce ?? "12345";
  const signatureNetwork = options.signatureNetwork ?? Networks.TESTNET;
  const args = [
    nativeToScVal(fixtureSigner.publicKey(), { type: "address" }),
    nativeToScVal(payTo, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
  ];
  const call = new xdr.InvokeContractArgs({
    contractAddress: new Address(X402_TESTNET_USDC.contract).toScAddress(),
    functionName: "transfer",
    args,
  });
  const credentials = new xdr.SorobanAddressCredentials({
    address: new Address(fixtureSigner.publicKey()).toScAddress(),
    nonce: xdr.Int64.fromString(nonce),
    signatureExpirationLedger: maxLedger,
    signature: xdr.ScVal.scvVoid(),
  });
  const unsigned = new xdr.SorobanAuthorizationEntry({
    credentials: options.authV2
      ? xdr.SorobanCredentials.sorobanCredentialsAddressV2(credentials)
      : xdr.SorobanCredentials.sorobanCredentialsAddress(credentials),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(call),
      subInvocations: [],
    }),
  });
  const authorization = await authorizeEntry(unsigned, fixtureSigner, maxLedger, signatureNetwork);
  const digest = hash(buildAuthorizationEntryPreimage(authorization, maxLedger, signatureNetwork).toXDR());
  const authorizationHash = `0x${digest.toString("hex")}` as const;
  const operation = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(call),
    auth: [authorization],
  });
  const clientTransaction = new TransactionBuilder(new Account(fixtureSigner.publicKey(), "1"), {
    fee: "100", networkPassphrase: Networks.TESTNET,
  }).addOperation(operation).setTimeout(0).build();
  const innerSigner = options.innerSourceIsUser || (!options.feeBump && options.userPaysFee) ? fixtureSigner : facilitator;
  const innerAccount = new Account(innerSigner.publicKey(), "20");
  const innerSource = !options.feeBump && options.muxedFeeSource ? new MuxedAccount(innerAccount, "42") : innerAccount;
  const inner = new TransactionBuilder(innerSource, {
    fee: "100", networkPassphrase: Networks.TESTNET,
  }).addOperation(operation).setTimeout(0).build();
  inner.sign(innerSigner);
  const outerSigner = options.userPaysFee ? fixtureSigner : feePayer;
  const feeSource = options.muxedFeeSource
    ? new MuxedAccount(new Account(outerSigner.publicKey(), "0"), "42").accountId()
    : outerSigner.publicKey();
  const outer = options.feeBump
    ? TransactionBuilder.buildFeeBumpTransaction(feeSource, "100", inner, Networks.TESTNET)
    : inner;
  if (options.feeBump) outer.sign(outerSigner);
  const transactionHash = outer.hash().toString("hex");
  const signedTransaction = clientTransaction.toXDR();
  const prepared: PreparedX402Authorization = {
    format: "stellar-x402-client-signature-v1",
    x402Version: 2,
    requirement: { network: X402_TESTNET_USDC.network, asset: X402_TESTNET_USDC.contract, amount, payTo },
    transactionJson: "{}",
    authorizationHash,
    maxLedger,
  };
  const execution: StellarX402ExecutionEvidence = {
    signedTransaction, authorizationHash, nonce, maxLedger, firstLedger: 100,
    network: X402_TESTNET_USDC.network, walletAddress: fixtureSigner.publicKey(),
    assetContract: X402_TESTNET_USDC.contract, payTo, amountAtomic: amount,
    requestHash: "ab".repeat(32), claimedAt: "2026-09-08T00:00:00.000Z",
  };
  const topics = [
    nativeToScVal("transfer", { type: "symbol" }),
    nativeToScVal(fixtureSigner.publicKey(), { type: "address" }),
    nativeToScVal(options.eventRecipient ?? payTo, { type: "address" }),
    nativeToScVal(`USDC:${X402_TESTNET_USDC.issuer}`, { type: "string" }),
  ];
  const value = nativeToScVal(options.eventAmount ?? amount, { type: "i128" });
  const contractEvent = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0), contractId: new Address(execution.assetContract).toScAddress().contractId(),
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics, data: value })),
  });
  const metadata = options.metadataVersion === 4
    ? new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({
      ext: new xdr.ExtensionPoint(0), txChangesBefore: [], txChangesAfter: [],
      operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes: [], events: [contractEvent] })],
      sorobanMeta: null, events: [], diagnosticEvents: [],
    }))
    : new xdr.TransactionMeta(3, new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0), txChangesBefore: [], txChangesAfter: [], operations: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: new xdr.SorobanTransactionMetaExt(0), events: [contractEvent],
        returnValue: xdr.ScVal.scvVoid(), diagnosticEvents: [],
      }),
    }));
  const operationResults = [xdr.OperationResult.opInner(xdr.OperationResultTr.invokeHostFunction(
    xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32)),
  ))];
  const transaction: rpc.Api.GetSuccessfulTransactionResponse = {
    status: rpc.Api.GetTransactionStatus.SUCCESS, txHash: transactionHash,
    latestLedger: 150, oldestLedger: 1, latestLedgerCloseTime: 1000, oldestLedgerCloseTime: 1,
    ledger: 120, createdAt: 900, applicationOrder: 1, feeBump: options.feeBump ?? false,
    envelopeXdr: outer.toEnvelope(), resultMetaXdr: metadata,
    resultXdr: new xdr.TransactionResult({
      feeCharged: xdr.Int64.fromString("100"),
      result: options.feeBump
        ? xdr.TransactionResultResult.txFeeBumpInnerSuccess(new xdr.InnerTransactionResultPair({
          transactionHash: inner.hash(),
          result: new xdr.InnerTransactionResult({
            feeCharged: xdr.Int64.fromString("100"),
            result: xdr.InnerTransactionResultResult.txSuccess(operationResults), ext: new xdr.InnerTransactionResultExt(0),
          }),
        }))
        : xdr.TransactionResultResult.txSuccess(operationResults),
      ext: new xdr.TransactionResultExt(0),
    }),
    events: { contractEventsXdr: [[contractEvent]], transactionEventsXdr: [] },
  };
  const event: rpc.Api.EventResponse = {
    id: "0000000000000000120-0000000000", type: "contract", ledger: 120,
    ledgerClosedAt: "2026-09-08T00:00:00.000Z", transactionIndex: 1, operationIndex: 0,
    inSuccessfulContractCall: true, txHash: transactionHash,
    contractId: new Contract(execution.assetContract), topic: topics, value,
  };
  const page: rpc.Api.GetEventsResponse = {
    events: [event], cursor: "fixture-page-complete", oldestLedger: 1, latestLedger: 150,
    latestLedgerCloseTime: "1000", oldestLedgerCloseTime: "1",
  };
  return { execution, prepared, signedTransaction, transactionHash, transaction, event, page, authorization };
}

export function reconciliationRpc(
  fixture: Awaited<ReturnType<typeof stellarReconciliationFixture>>,
  overrides: Partial<StellarX402ReadRpc> = {},
): StellarX402ReadRpc {
  return {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }),
    getLatestLedger: async () => ({ sequence: 100 }),
    getEvents: async () => fixture.page,
    getTransaction: async () => fixture.transaction,
    ...overrides,
  };
}
