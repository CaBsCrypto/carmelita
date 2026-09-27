import {
  buildAuthorizationEntryPreimage,
  contract,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import type { PaymentRequirements } from "@x402/core/types";
import {
  getEstimatedLedgerCloseTimeSeconds,
  getNetworkPassphrase,
  getRpcClient,
  getRpcUrl,
  handleSimulationResult,
} from "@x402/stellar";
import { verifyStellarSignature } from "@/app/privy-stellar";
import { x402AuthEntryDigest } from "@/app/x402/privy-signer";
import {
  freezeRequirement,
  type FrozenX402Requirement,
} from "@/app/x402/protocol";
import { freezeX402Request, type FrozenX402Request } from "./request";

const { AssembledTransaction } = contract;

export type PreparedX402Authorization = {
  format: "stellar-x402-client-signature-v1";
  x402Version: number;
  requirement: FrozenX402Requirement;
  transactionJson: string;
  authorizationHash: `0x${string}`;
  maxLedger: number;
  request?: FrozenX402Request;
};

function assembledOptions(requirement: FrozenX402Requirement) {
  const network = requirement.network as `${string}:${string}`;
  return {
    contractId: requirement.asset,
    method: "transfer",
    networkPassphrase: getNetworkPassphrase(network),
    rpcUrl: getRpcUrl(network),
    parseResultXdr: (result: xdr.ScVal) => result,
  };
}

function deserializePrepared(input: PreparedX402Authorization) {
  const parsed = JSON.parse(input.transactionJson) as {
    tx: string;
    simulationResult: { auth: string[]; retval: string };
    simulationTransactionData: string;
  };
  return AssembledTransaction.fromJSON(
    assembledOptions(input.requirement),
    parsed,
  );
}

export function stellarClientSignatureBytes(signature: string) {
  if (!/^0x[0-9a-fA-F]{128}$/.test(signature)) {
    throw new Error("invalid_stellar_client_signature");
  }
  return Buffer.from(signature.slice(2), "hex");
}

export function isPreparedX402Authorization(
  value: unknown,
): value is PreparedX402Authorization {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PreparedX402Authorization>;
  return (
    candidate.format === "stellar-x402-client-signature-v1" &&
    typeof candidate.x402Version === "number" &&
    typeof candidate.transactionJson === "string" &&
    typeof candidate.maxLedger === "number" &&
    typeof candidate.authorizationHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(candidate.authorizationHash) &&
    Boolean(candidate.requirement)
  );
}

export async function prepareX402ClientAuthorization(input: {
  x402Version: number;
  requirement: PaymentRequirements;
  address: string;
}) {
  const request = freezeX402Request(input.x402Version, input.requirement);
  if (input.requirement.extra?.areFeesSponsored !== true) {
    throw new Error("x402_fee_sponsorship_required");
  }

  const rpc = getRpcClient(input.requirement.network);
  const latestLedger = await rpc.getLatestLedger();
  const estimatedLedgerSeconds = await getEstimatedLedgerCloseTimeSeconds(
    input.requirement.network,
  );
  const maxLedger =
    latestLedger.sequence +
    Math.floor(Math.min(300, input.requirement.maxTimeoutSeconds) / estimatedLedgerSeconds);
  const options = assembledOptions(freezeRequirement(input.requirement));
  const transaction = await AssembledTransaction.build({
    ...options,
    args: [
      nativeToScVal(input.address, { type: "address" }),
      nativeToScVal(input.requirement.payTo, { type: "address" }),
      nativeToScVal(input.requirement.amount, { type: "i128" }),
    ],
  });
  handleSimulationResult(transaction.simulation);

  const missingSigners = transaction.needsNonInvokerSigningBy();
  if (
    missingSigners.length !== 1 ||
    missingSigners[0] !== input.address
  ) {
    throw new Error("x402_unexpected_authorization_signers");
  }

  const transactionJson = transaction.toJSON();
  if (!transaction.built) throw new Error("x402_transaction_not_built");
  const operation = transaction.built.operations[0];
  if (
    operation?.type !== "invokeHostFunction" ||
    operation.auth?.length !== 1
  ) {
    throw new Error("x402_authorization_entry_not_unique");
  }
  const authorizationEntry = buildAuthorizationEntryPreimage(
    operation.auth[0],
    maxLedger,
    options.networkPassphrase,
  ).toXDR("base64");

  const authorizationHash = `0x${Buffer.from(
    x402AuthEntryDigest(authorizationEntry),
  ).toString("hex")}` as const;

  return {
    format: "stellar-x402-client-signature-v1",
    x402Version: input.x402Version,
    requirement: freezeRequirement(input.requirement),
    transactionJson,
    authorizationHash,
    maxLedger,
    request,
  } satisfies PreparedX402Authorization;
}

export async function createSignedX402Payload(input: {
  prepared: PreparedX402Authorization;
  address: string;
  signature: string;
}) {
  const expectedDigest = Buffer.from(
    input.prepared.authorizationHash.slice(2),
    "hex",
  );
  const signature = stellarClientSignatureBytes(input.signature);
  if (!verifyStellarSignature(input.address, expectedDigest, signature)) {
    throw new Error("stellar_client_signature_verification_failed");
  }

  const transaction = deserializePrepared(input.prepared);
  let signedEntries = 0;
  await transaction.signAuthEntries({
    address: input.address,
    expiration: input.prepared.maxLedger,
    signAuthEntry: async (authEntry) => {
      const actualHash = `0x${Buffer.from(
        x402AuthEntryDigest(authEntry),
      ).toString("hex")}`;
      if (actualHash !== input.prepared.authorizationHash) {
        throw new Error("x402_authorization_payload_changed");
      }
      signedEntries += 1;
      return {
        signedAuthEntry: signature.toString("base64"),
        signerAddress: input.address,
      };
    },
  });
  if (signedEntries !== 1) {
    throw new Error("x402_authorization_signature_not_applied");
  }

  await transaction.simulate();
  handleSimulationResult(transaction.simulation);
  if (transaction.needsNonInvokerSigningBy().length > 0) {
    throw new Error("x402_authorization_still_unsigned");
  }
  if (!transaction.built) throw new Error("x402_transaction_not_built");

  return {
    x402Version: input.prepared.x402Version,
    transaction: transaction.built.toXDR(),
    requirement: input.prepared.requirement,
  };
}
