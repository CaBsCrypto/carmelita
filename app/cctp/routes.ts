import { StrKey } from "@stellar/stellar-sdk";
import { PublicKey } from "@solana/web3.js";
import { CCTP_TESTNET, buildCctpFujiToStellarPlan } from "../connectors/circle-cctp";
import { walletNetworkIdSchema, type WalletNetworkId } from "../wallets/types";

export const BRIDGE_RESEARCH_DATE = "2026-09-29";
export const BRIDGE_SOURCES = {
  support: "https://developers.circle.com/cctp/concepts/supported-chains-and-domains",
  assets: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
  contracts: "https://developers.circle.com/cctp/references/contract-addresses",
  usdt0: "https://developers.stellar.org/launch/usdt0",
} as const;

type Endpoint = {
  network: WalletNetworkId;
  domain: number | null;
  chainId: number | null;
  asset: { code: "USDC"; identifier: string; decimals: number } | null;
  contracts: Readonly<Record<string, string>> | null;
};

// These are research descriptors, not an executor configuration.
const endpoints: Record<WalletNetworkId, Endpoint> = {
  "avalanche:fuji": {
    network: "avalanche:fuji", domain: 1, chainId: 43113,
    asset: { code: "USDC", identifier: CCTP_TESTNET.avalanche.usdc, decimals: 6 },
    contracts: {
      tokenMessenger: CCTP_TESTNET.avalanche.tokenMessengerV2,
      messageTransmitter: CCTP_TESTNET.avalanche.messageTransmitterV2,
    },
  },
  "stellar:testnet": {
    network: "stellar:testnet", domain: 27, chainId: null,
    asset: { code: "USDC", identifier: CCTP_TESTNET.stellar.usdcIssuer, decimals: 7 },
    contracts: {
      tokenMessenger: CCTP_TESTNET.stellar.tokenMessengerMinter,
      messageTransmitter: CCTP_TESTNET.stellar.messageTransmitter,
      forwarder: CCTP_TESTNET.stellar.cctpForwarder,
    },
  },
  "base:sepolia": {
    network: "base:sepolia", domain: 6, chainId: 84532,
    asset: { code: "USDC", identifier: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    contracts: {
      tokenMessenger: CCTP_TESTNET.avalanche.tokenMessengerV2,
      messageTransmitter: CCTP_TESTNET.avalanche.messageTransmitterV2,
    },
  },
  "solana:devnet": {
    network: "solana:devnet", domain: 5, chainId: null,
    asset: { code: "USDC", identifier: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 },
    contracts: null,
  },
  "bnb:testnet": {
    network: "bnb:testnet", domain: null, chainId: 97, asset: null, contracts: null,
  },
};

export function describeBridgeRoute(source: string, destination: string) {
  const from = walletNetworkIdSchema.parse(source);
  const to = walletNetworkIdSchema.parse(destination);
  if (from === to || (from !== "stellar:testnet" && to !== "stellar:testnet")) {
    throw new Error("bridge_route_not_catalogued");
  }
  const blocked = from === "bnb:testnet" || to === "bnb:testnet";
  const implemented = from === "avalanche:fuji" && to === "stellar:testnet";
  return {
    id: `${from}->${to}`, environment: "testnet" as const,
    source: structuredClone(endpoints[from]), destination: structuredClone(endpoints[to]),
    protocol: blocked ? null : "Circle CCTP V2",
    status: blocked ? "blocked" as const : implemented ? "implemented_partial" as const : "verified_documentation" as const,
    acceptedOnchain: false, executionEnabled: false,
    blockers: blocked ? ["bnb_usdc_cctp_unsupported", "alternative_testnet_route_unverified"]
      : ["onchain_acceptance_pending", ...(implemented ? [] : ["execution_adapter_pending"]),
        ...(from === "solana:devnet" || to === "solana:devnet" ? ["solana_program_verification_pending"] : [])],
    checkedAt: BRIDGE_RESEARCH_DATE, evidence: BRIDGE_SOURCES,
  };
}

export function listBridgeRoutes() {
  return (["avalanche:fuji", "base:sepolia", "solana:devnet", "bnb:testnet"] as const)
    .flatMap((network) => [describeBridgeRoute(network, "stellar:testnet"), describeBridgeRoute("stellar:testnet", network)]);
}

export function assertBridgeAsset(network: string, code: string, identifier: string) {
  const endpoint = endpoints[walletNetworkIdSchema.parse(network)];
  const expected = endpoint.asset;
  const equal = endpoint.chainId !== null
    ? expected?.identifier.toLowerCase() === identifier.toLowerCase()
    : expected?.identifier === identifier;
  if (!expected || code !== expected.code || !equal) throw new Error("bridge_asset_mismatch");
}

function assertAddress(network: WalletNetworkId, address: string) {
  if (network === "stellar:testnet") {
    if (!StrKey.isValidEd25519PublicKey(address)) throw new Error("bridge_address_invalid");
  } else if (network === "solana:devnet") {
    try { if (new PublicKey(address).toBase58() !== address) throw new Error(); }
    catch { throw new Error("bridge_address_invalid"); }
  } else if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("bridge_address_invalid");
}

export function buildBridgeResearchPlan(input: {
  source: string; destination: string; sourceAddress: string; destinationAddress: string; amount: string;
}) {
  const route = describeBridgeRoute(input.source, input.destination);
  if (route.status === "blocked") throw new Error("bridge_route_blocked");
  assertAddress(route.source.network, input.sourceAddress);
  assertAddress(route.destination.network, input.destinationAddress);
  // CCTP wire amounts have six decimals, including Stellar's seven-decimal asset.
  if (!/^\d{1,7}(?:\.\d{1,6})?$/.test(input.amount)) throw new Error("bridge_amount_precision_invalid");
  const [whole, fraction = ""] = input.amount.split(".");
  const atomic = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
  if (atomic <= BigInt(0) || atomic > BigInt("1000000000000")) throw new Error("bridge_amount_invalid");
  return {
    route, amountAtomic: atomic.toString(),
    sourceAmountAtomic: (atomic * (route.source.asset?.decimals === 7 ? BigInt(10) : BigInt(1))).toString(),
    destinationAmountBeforeFeesAtomic: (atomic * (route.destination.asset?.decimals === 7 ? BigInt(10) : BigInt(1))).toString(),
    sourceAddress: input.sourceAddress, destinationAddress: input.destinationAddress,
    quote: { status: "unavailable" as const, amountReceived: null, fees: null, expiresAt: null },
    prerequisites: ["registered_wallets", "source_gas", "source_usdc", "destination_gas",
      ...(route.source.network === "stellar:testnet" || route.destination.network === "stellar:testnet"
        ? ["stellar_activation", "stellar_circle_usdc_trustline"] : [])],
    legacyPlan: route.source.network === "avalanche:fuji"
      ? buildCctpFujiToStellarPlan(input) : null,
    approvalRequired: true, fundsMoved: false, transactionPrepared: false, bazaarPaymentAuthorized: false,
  };
}
