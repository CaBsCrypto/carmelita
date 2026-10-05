type CapabilityMetadata = {
  id: string; title: string; description: string; provider: string;
  operation: string; status: string; nextAction: string;
  version?: string; category?: string; network?: string; dataScope?: string;
  requirements?: readonly string[]; requires?: readonly string[];
  approval?: string; requiresApproval?: boolean;
  channels?: { carmelita: boolean; chatgpt: boolean };
  availability?: { available: boolean };
  execution?: { exposedByGateway: boolean; mode: string };
};

const implementationTitles: Readonly<Record<string, string>> = {
  "stellar.wallet.friendbot_fund": "Stellar Testnet account activation implementation",
  "stellar.usdc.trustline": "Stellar Testnet USDC trustline implementation",
  "stellar.x402.report.purchase": "Stellar x402 resource implementation",
  "stellar.defindex.deposit_xlm": "DeFindex Testnet XLM vault implementation",
  "stellar.defindex.deposit_usdc": "DeFindex Testnet USDC vault implementation",
  "stellar.soroswap.swap": "Soroswap Testnet implementation",
  "avalanche.wallet.transfer": "Fuji AVAX transfer implementation",
  "x402.report.purchase": "Fuji x402 resource implementation",
  "pangolin.swap.avax_to_usdc": "Pangolin Fuji implementation",
  "circle.cctp.fuji_to_stellar": "Fuji and Stellar Testnet bridge implementation",
};

/** Shared read-query projection. It does not infer the current caller channel or
 * change web runtimes: it makes the native ChatGPT boundary explicit wherever
 * these metadata queries are consumed. Never forward a financial nextAction.
 */
export function projectNativeCapabilityBoundary<T extends CapabilityMetadata>(capability: T) {
  if (capability.operation !== "financial" && capability.operation !== "cross_chain") return capability;
  return {
    // Financial metadata is a closed projection. Do not spread source objects:
    // nested workflow/handoff fields must not reintroduce an actionable URL.
    id: capability.id,
    ...(capability.version !== undefined ? { version: capability.version } : {}),
    provider: capability.provider,
    ...(capability.category !== undefined ? { category: capability.category } : {}),
    ...(capability.network !== undefined ? { network: capability.network } : {}),
    ...(capability.dataScope !== undefined ? { dataScope: capability.dataScope } : {}),
    ...(capability.requirements !== undefined ? { requirements: [...capability.requirements] } : {}),
    ...(capability.requires !== undefined ? { requires: [...capability.requires] } : {}),
    ...(capability.approval !== undefined ? { approval: capability.approval } : {}),
    ...(capability.requiresApproval !== undefined ? { requiresApproval: capability.requiresApproval } : {}),
    operation: capability.operation,
    title: implementationTitles[capability.id] ?? `${capability.provider} financial implementation metadata`,
    description: "Implementation metadata only. Native financial preparation, approval, signing and execution in ChatGPT are blocked pending compatibility and client acceptance.",
    status: "blocked" as const,
    implementationStatus: capability.status,
    nextAction: "Native financial use is blocked. This entry documents implementation only; no financial action or checkout handoff is available.",
    ...(capability.channels ? { channels: { carmelita: capability.channels.carmelita, chatgpt: false } } : {}),
    availability: { available: false },
    execution: { exposedByGateway: false as const, mode: "metadata_only" as const },
    nativeChannelBoundary: {
      channel: "chatgpt" as const,
      status: "blocked" as const,
      code: "openai_financial_compatibility_unresolved" as const,
      prepare: false as const, approve: false as const, sign: false as const,
      execute: false as const, checkoutHandoff: false as const,
    },
  };
}
