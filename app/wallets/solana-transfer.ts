import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { isValidWalletAddress } from "@/app/wallets/privy";
import { LAMPORTS_PER_SOL, SOLANA_DEVNET_RPC_URL } from "@/app/wallets/solana-client";

export type SolanaTransferPlan = {
  fromAddress: string;
  toAddress: string;
  solAmount: number;
  lamports: number;
  recentBlockhash: string;
  serializedTransaction: string;
  explorerUrl: string;
};

export type SolanaTransferReceipt = {
  signature: string;
  fromAddress: string;
  toAddress: string;
  solAmount: number;
  lamports: number;
  explorerUrl: string;
};

export async function buildSolanaTransferTransaction({
  fromAddress,
  toAddress,
  solAmount,
  rpcUrl = SOLANA_DEVNET_RPC_URL,
}: {
  fromAddress: string;
  toAddress: string;
  solAmount: number;
  rpcUrl?: string;
}): Promise<SolanaTransferPlan> {
  if (!isValidWalletAddress("solana", fromAddress)) {
    throw new Error("invalid_from_solana_address");
  }
  if (!isValidWalletAddress("solana", toAddress)) {
    throw new Error("invalid_to_solana_address");
  }
  if (solAmount <= 0) {
    throw new Error("invalid_sol_amount");
  }

  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);

  const connection = new Connection(rpcUrl, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash();

  const transaction = new Transaction();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;
  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    }),
  );

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }).toString("base64");

  return {
    fromAddress,
    toAddress,
    solAmount,
    lamports,
    recentBlockhash: blockhash,
    serializedTransaction: serialized,
    explorerUrl: `https://explorer.solana.com/address/${fromAddress}?cluster=devnet`,
  };
}

export async function sendSolanaRawTransaction({
  signedTransactionBase64,
  rpcUrl = SOLANA_DEVNET_RPC_URL,
}: {
  signedTransactionBase64: string;
  rpcUrl?: string;
}): Promise<{ signature: string; explorerUrl: string }> {
  if (!signedTransactionBase64 || typeof signedTransactionBase64 !== "string") {
    throw new Error("invalid_signed_transaction");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const rawTx = Buffer.from(signedTransactionBase64, "base64");
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  return {
    signature,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}
