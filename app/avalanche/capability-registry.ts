import { z } from "zod";

export const avalancheCapabilityIdSchema = z.enum([
  "avalanche.docs.search", "avalanche.wallet.status", "avalanche.wallet.transfer",
  "dexalot.markets.list", "dexalot.quote.read", "x402.report.purchase",
  "circle.cctp.fuji_to_stellar",
]);
export type AvalancheCapabilityId = z.infer<typeof avalancheCapabilityIdSchema>;
type Requirement = "privy_session" | "evm_wallet" | "fuji_avax" | "fuji_usdc" | "stellar_wallet" | "stellar_usdc_trustline";
export type AvalancheCapability = {
  id: AvalancheCapabilityId; provider: string; title: string; description: string;
  status: "live" | "ready_to_test" | "planned";
  operation: "read" | "financial" | "cross_chain";
  approval: "none" | "privy_single" | "privy_dual";
  network: "avalanche:fuji" | "avalanche:fuji+stellar:testnet";
  requires: readonly Requirement[]; evidence: string; nextAction: string;
};

const capabilities: readonly AvalancheCapability[] = [
  { id: "avalanche.docs.search", provider: "Avalanche Builder Hub MCP", title: "Search official Avalanche knowledge", description: "Search bounded official documentation from the agent.", status: "live", operation: "read", approval: "none", network: "avalanche:fuji", requires: ["privy_session"], evidence: "Read-only MCP adapter with an allowlisted docs_search tool.", nextAction: "Ask Carmelita to research an Avalanche integration." },
  { id: "avalanche.wallet.status", provider: "Privy", title: "Inspect the user's Fuji wallet", description: "Return the user-owned EVM address and verified balances.", status: "live", operation: "read", approval: "none", network: "avalanche:fuji", requires: ["privy_session", "evm_wallet"], evidence: "Privy ownership and Fuji RPC balance checks are implemented.", nextAction: "Ask Carmelita to show the Avalanche wallet and balances." },
  { id: "avalanche.wallet.transfer", provider: "Privy", title: "Send an exact Fuji AVAX amount", description: "Freeze an exact recipient and amount before user signing.", status: "ready_to_test", operation: "financial", approval: "privy_single", network: "avalanche:fuji", requires: ["privy_session", "evm_wallet", "fuji_avax"], evidence: "Prepared transaction, receipt verification and replay guards pass automated tests.", nextAction: "Run one small transfer between known Fuji wallets." },
  { id: "dexalot.markets.list", provider: "Dexalot", title: "List Dexalot Testnet markets", description: "Read the deployed Testnet market catalog without a key.", status: "live", operation: "read", approval: "none", network: "avalanche:fuji", requires: ["privy_session"], evidence: "Public Testnet catalog adapter is read-only and bounded.", nextAction: "Ask Carmelita to list Dexalot Testnet pairs." },
  { id: "dexalot.quote.read", provider: "Dexalot", title: "Get a non-firm Dexalot quote", description: "Calculate a read-only quote without reserving liquidity.", status: "live", operation: "read", approval: "none", network: "avalanche:fuji", requires: ["privy_session"], evidence: "Quote responses are validated and explicitly marked non-firm.", nextAction: "Ask Carmelita to quote 1 AVAX to USDC on Dexalot." },
  { id: "x402.report.purchase", provider: "0xGasless", title: "Purchase an x402 report", description: "Authorize 0.01 Fuji USDC with EIP-3009 and sponsored gas.", status: "live", operation: "financial", approval: "privy_single", network: "avalanche:fuji", requires: ["privy_session", "evm_wallet", "fuji_usdc"], evidence: "Settled for real on Fuji on 2026-07-31 in transaction 0x3c03d58756d93da7b8a1409cf621d859c853ed54d710974229e5183cfd9b70ad (block 57475367), independently verified against the RPC: exactly one USDC Transfer of 10000 atomic units from the payer to the frozen payTo, plus an EIP-3009 AuthorizationUsed log burning the nonce. The facilitator sent the transaction; the payer wallet held zero AVAX, so gas sponsorship is measured rather than assumed.", nextAction: "Run a second-user acceptance and replay the paid request: runtime settlement now waits for and persists exact Fuji USDC receipt evidence before delivery." },
  { id: "circle.cctp.fuji_to_stellar", provider: "Circle CCTP V2", title: "Bridge USDC from Fuji to Stellar Testnet", description: "Burn on Fuji, verify Circle attestation, then mint and forward on Stellar.", status: "ready_to_test", operation: "cross_chain", approval: "privy_dual", network: "avalanche:fuji+stellar:testnet", requires: ["privy_session", "evm_wallet", "fuji_avax", "fuji_usdc", "stellar_wallet", "stellar_usdc_trustline"], evidence: "The resumable state machine and attestation validation pass automated tests.", nextAction: "Complete one end-to-end 1 USDC bridge with two scoped approvals." },
];

export type AvalancheCapabilityContext = { authenticated?: boolean; evmWallet?: boolean; stellarWallet?: boolean; fujiAvax?: boolean; fujiUsdc?: boolean; stellarUsdcTrustline?: boolean };
const contextKey = { privy_session: "authenticated", evm_wallet: "evmWallet", stellar_wallet: "stellarWallet", fuji_avax: "fujiAvax", fuji_usdc: "fujiUsdc", stellar_usdc_trustline: "stellarUsdcTrustline" } as const satisfies Record<Requirement, keyof AvalancheCapabilityContext>;
export function listAvalancheCapabilities() { return capabilities.map((capability) => ({ ...capability })); }
export function getAvalancheCapability(id: AvalancheCapabilityId) {
  const capability = capabilities.find((item) => item.id === id);
  if (!capability) throw new Error("avalanche_capability_not_found");
  return { ...capability };
}
export function planAvalancheCapability(id: AvalancheCapabilityId, context: AvalancheCapabilityContext = {}) {
  const capability = getAvalancheCapability(id);
  const blockers = capability.requires.filter((requirement) => context[contextKey[requirement]] !== true);
  return { capability, executable: capability.status !== "planned" && blockers.length === 0, blockers, approvalRequired: capability.approval !== "none", boundary: capability.operation === "read" ? "read_only" : "prepare_then_explicit_privy_approval" } as const;
}


