import { createPublicClient, http, keccak256, toHex } from "viem";
import { AVALANCHE_X402, EVM_ADDRESS } from "./config";
import type {
  AvalancheMerchantReceiptVerifier,
  AvalancheMerchantSettlementEvidence,
} from "./merchant";

const TRANSACTION_HASH = /^0x[a-fA-F0-9]{64}$/;
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

type ReceiptLog = {
  address: string;
  topics: readonly string[];
  data: string;
  removed?: boolean;
};
export type AvalancheMerchantReceipt = {
  transactionHash: string;
  status: "success" | "reverted" | "0x1" | "0x0" | string;
  blockNumber?: bigint | string | number;
  logs: readonly ReceiptLog[];
};
export interface AvalancheMerchantReceiptReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(input: { hash: `0x${string}` }): Promise<AvalancheMerchantReceipt>;
}

function topicAddress(value: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("merchant_x402_receipt_topic_invalid");
  }
  return `0x${value.slice(-40)}`.toLowerCase();
}
function atomicValue(value: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("merchant_x402_receipt_amount_invalid");
  }
  return BigInt(value).toString();
}
function blockNumber(value: bigint | string | number | undefined) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(0x[a-fA-F0-9]+|\d+)$/.test(value)) {
    return BigInt(value).toString();
  }
  return undefined;
}

export function createAvalancheMerchantReceiptVerifier(
  reader: AvalancheMerchantReceiptReader,
): AvalancheMerchantReceiptVerifier {
  return {
    async verify({ settlement, record }): Promise<AvalancheMerchantSettlementEvidence> {
      if (!settlement.success || !TRANSACTION_HASH.test(settlement.transaction)) {
        throw new Error("merchant_x402_receipt_transaction_invalid");
      }
      if (await reader.getChainId() !== AVALANCHE_X402.chainId) {
        throw new Error("merchant_x402_receipt_chain_mismatch");
      }
      const receipt = await reader.getTransactionReceipt({
        hash: settlement.transaction as `0x${string}`,
      });
      if (receipt.transactionHash.toLowerCase() !== settlement.transaction.toLowerCase()) {
        throw new Error("merchant_x402_receipt_hash_mismatch");
      }
      if (!receipt.status || !["success", "0x1"].includes(receipt.status)) {
        throw new Error("merchant_x402_receipt_reverted");
      }
      const asset = record.requirement.asset.toLowerCase();
      const payer = record.authorization.from.toLowerCase();
      const payTo = record.authorization.to.toLowerCase();
      if (![asset, payer, payTo].every((value) => EVM_ADDRESS.test(value))) {
        throw new Error("merchant_x402_receipt_address_invalid");
      }
      const matching = receipt.logs.filter((log) => {
        if (log.removed || log.address.toLowerCase() !== asset || log.topics.length !== 3) return false;
        if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return false;
        try {
          return topicAddress(log.topics[1]) === payer &&
            topicAddress(log.topics[2]) === payTo &&
            atomicValue(log.data) === record.authorization.value;
        } catch {
          return false;
        }
      });
      if (matching.length !== 1) {
        throw new Error("merchant_x402_receipt_transfer_not_unique");
      }
      return {
        transactionHash: settlement.transaction,
        network: AVALANCHE_X402.network,
        payer,
        payTo,
        asset,
        amountAtomic: record.authorization.value,
        blockNumber: blockNumber(receipt.blockNumber),
      };
    },
  };
}
export function createFujiJsonRpcReceiptReader(
  rpcUrl = process.env.AVALANCHE_FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
): AvalancheMerchantReceiptReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    async getTransactionReceipt({ hash }) {
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 30_000,
        pollingInterval: 1_000,
      });
      return {
        transactionHash: receipt.transactionHash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
          removed: log.removed,
        })),
      };
    },
  };
}