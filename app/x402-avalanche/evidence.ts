export type AvalancheSettlementEvidence = {
  transactionHash: string;
  network: "eip155:43113";
  payer: string;
  payTo: string;
  asset: string;
  amountAtomic: string;
  blockNumber?: string;
};
