import { z } from "zod";
import { defineQuery } from "./types";
import { agentContinuationUrl } from "./links";
import { getSoroswapHealth, getSoroswapQuote } from "@/app/connectors/soroswap";
import { DEFINDEX_TESTNET, getDefindexPosition } from "@/app/connectors/defindex";
import { getCctpFujiToStellarFees, CCTP_TESTNET } from "@/app/connectors/circle-cctp";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { diagnoseEvmWallet, getErc20Balance } from "@/app/wallets/evm-rpc";
import { getWalletNetwork } from "@/app/wallets/networks";
import { discoverMppRouterServices } from "@/app/infrastructure/mpp-router";
import { getChannelsReadiness } from "@/app/infrastructure/openzeppelin-channels";
import { getAgentPlannerReadiness } from "@/app/agent-planner";
import { getLangGraphReadiness } from "@/app/orchestration/readiness";
import { getUnblckReadiness } from "@/app/connectors/unblck";
import { stellar8004Draft } from "@/app/infrastructure/stellar-8004";

const emptyInput = z.object({}).strict();
const publicReadErrors: Record<string, ReadonlySet<string>> = {
  soroswap_quote_unavailable: new Set(["soroswap_not_configured", "soroswap_auth_failed", "soroswap_rate_limited", "soroswap_route_unavailable", "soroswap_upstream_failed", "soroswap_quote_asset_mismatch", "soroswap_amount_out_of_bounds", "soroswap_assets_must_differ", "invalid_soroswap_amount", "invalid_soroswap_slippage"]),
  defindex_position_unavailable: new Set(["defindex_read_failed", "invalid_stellar_address"]),
  cctp_fee_unavailable: new Set(["cctp_fee_content_type_invalid", "cctp_fee_response_too_large", "cctp_fee_json_invalid", "cctp_fee_timeout", "cctp_fee_unreachable", "cctp_fee_payload_invalid"]),
};
function errorCode(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message.split(":", 1)[0] : fallback;
  return publicReadErrors[fallback]?.has(value) || fallback === "cctp_fee_unavailable" && /^cctp_fee_http_[45]\d{2}$/.test(value) ? value : fallback;
}
const unavailable = (code: string, source: string) => ({ status: "unavailable" as const, error: code, source, fetchedAt: new Date().toISOString() });

const defaultDependencies = {
  getSoroswapQuote, getSoroswapHealth, getDefindexPosition, listWallets: listPersistedUserWallets,
  getStellarTestnetAccount, diagnoseEvmWallet, getErc20Balance, getCctpFujiToStellarFees,
  discoverMppRouterServices, getChannelsReadiness, getAgentPlannerReadiness, getLangGraphReadiness,
  getUnblckReadiness,
  soroswapConfigured: () => Boolean(process.env.SOROSWAP_API_KEY?.trim()),
};
export type DiscoveryQueryDependencies = typeof defaultDependencies;

/** Public readiness metadata has one projection for the legacy GET and authenticated reads. */
export async function readPublicInfrastructureStatus(overrides: Partial<DiscoveryQueryDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const [catalog, health] = await Promise.all([
    dependencies.discoverMppRouterServices(), dependencies.getSoroswapHealth().catch(() => null),
  ]);
  const planner = dependencies.getAgentPlannerReadiness();
  const channels = dependencies.getChannelsReadiness();
  const workflows = dependencies.getLangGraphReadiness();
  const unblck = dependencies.getUnblckReadiness();
  const publicPlanner = { configured: planner.configured, enabled: planner.enabled, provider: planner.provider, model: planner.model, mode: planner.mode };
  return {
    fetchedAt: new Date().toISOString(), executionEnabled: false,
    soroswap: {
      configured: dependencies.soroswapConfigured(), network: "testnet", assets: ["XLM", "USDC"],
      quote: "read-only", execution: "privy-explicit-approval",
      apiReachable: health?.reachable ?? null, routeAvailable: health?.available ?? null,
      protocols: health?.protocols ?? [], sourceStatus: health ? "ok" : "unavailable",
    },
    planner: publicPlanner, langchain: publicPlanner,
    openzeppelin: { provider: channels.provider, configured: channels.configured, network: channels.network,
      submissionEnabled: channels.submissionEnabled, custody: channels.custody, userSignatureRequired: true, role: channels.role },
    langgraph: { implemented: workflows.implemented, runtime: workflows.runtime, mode: workflows.mode,
      productionRouting: workflows.productionRouting, productionCapabilities: workflows.productionCapabilities,
      durablePersistenceConfigured: workflows.durablePersistenceConfigured, approvalBinding: workflows.approvalBinding,
      idempotencyKey: workflows.idempotencyKey, nodes: workflows.nodes, boundaries: workflows.boundaries },
    unblck: { configured: unblck.configured, channels: unblck.channels, capabilities: unblck.capabilities, sourceOfTruth: unblck.sourceOfTruth },
    mppRouter: { network: "mainnet", catalogAccess: "free", endpointBilling: catalog.source === "live" ? "provider-reported" : "unverified",
      source: catalog.source, catalogSource: catalog.source, sourceStatus: catalog.source === "live" ? "ok" : "unavailable",
      services: catalog.services, examplesOnly: catalog.source !== "live", executionEnabled: false },
    stellar8004: stellar8004Draft,
  };
}

/** Business reads use provider/SELECT adapters directly, never the mutating route lifecycle. */
export function createDiscoveryQueries(overrides: Partial<DiscoveryQueryDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return [
    defineQuery({
      id: "stellar.soroswap.quote", toolName: "read_stellar_soroswap_quote", title: "Read a Soroswap Testnet quote",
      description: "Quote XLM/USDC on Stellar Testnet without building, signing or submitting a swap. A failed source is unavailable, never a trade offer.",
      inputSchema: z.object({
        assetIn: z.enum(["XLM", "USDC"]), assetOut: z.enum(["XLM", "USDC"]),
        amount: z.string().trim().max(32).regex(/^\d+(?:\.\d{1,7})?$/).refine(value => Number(value) > 0 && Number(value) <= 100),
        slippageBps: z.number().int().min(1).max(500).default(50),
      }).strict().refine(value => value.assetIn !== value.assetOut, "soroswap_assets_must_differ"),
      scope: "agent:read", dataScope: "stellar_testnet", requirements: ["soroswap_api"],
      execute: async (input) => {
        try {
          const quote = await dependencies.getSoroswapQuote(input);
          return {
            status: "ok", source: "Soroswap", sourceUrl: "https://api.soroswap.finance", fetchedAt: new Date().toISOString(),
            network: "stellar:testnet", assetIn: quote.assetIn, assetOut: quote.assetOut, amountIn: quote.amountIn,
            amountOut: quote.amountOut, minimumAmountOut: quote.minimumAmountOut, priceImpactPct: quote.priceImpactPct,
            platform: quote.platform, slippageBps: quote.slippageBps, routePlan: quote.routePlan,
            fundsMoved: false, transactionPrepared: false,
          };
        } catch (error) { return unavailable(errorCode(error, "soroswap_quote_unavailable"), "Soroswap"); }
      },
    }),
    defineQuery({
      id: "offchain.mpp.catalog", toolName: "read_offchain_mpp_catalog", title: "Read the public MPP service catalog",
      description: "Discover public service metadata only. Fallback entries are unverified examples, never current availability or prices; providers are not contacted or paid.",
      inputSchema: emptyInput, scope: "agent:read", dataScope: "public_offchain",
      execute: async () => {
        const catalog = await dependencies.discoverMppRouterServices();
        return { status: catalog.source === "live" ? "ok" : "unavailable", source: "MPP Router", catalogSource: catalog.source,
          services: catalog.services, fetchedAt: new Date().toISOString(), executionEnabled: false,
          ...(catalog.source === "fallback" ? { error: "mpp_catalog_unavailable", examplesOnly: true } : {}) };
      },
    }),
    defineQuery({
      id: "offchain.infrastructure.status", toolName: "read_offchain_infrastructure_status", title: "Read connection infrastructure availability",
      description: "Report public integration configuration and source availability. Does not return credentials, enable execution, or initiate authorizations.",
      inputSchema: emptyInput, scope: "agent:read", dataScope: "integration_metadata",
      execute: async () => readPublicInfrastructureStatus(dependencies),
    }),
    defineQuery({
      id: "stellar.defindex.position.read", toolName: "read_stellar_defindex_position_read", title: "Read your DeFindex Testnet positions",
      description: "Read balance shares of the authenticated owner's Stellar Testnet vaults. Does not create wallets, prepare deposits or return signed transactions.",
      inputSchema: z.object({ asset: z.enum(["XLM", "USDC"]).optional() }).strict(),
      scope: "agent:read", dataScope: "stellar_testnet", requirements: ["stellar_wallet"],
      execute: async ({ asset }, context) => {
        const wallet = (await dependencies.listWallets(context.userId)).find(row => row.userId === context.userId && row.chainType === "stellar" && row.network === "stellar:testnet" && row.status === "active");
        if (!wallet) return { status: "requirement_missing", requirement: "stellar_wallet", continuationUrl: agentContinuationUrl(), network: "stellar:testnet", positions: [] };
        const assets = asset ? [asset] : ["XLM", "USDC"] as const;
        const positions = await Promise.all(assets.map(async current => {
          try { return { status: "ok", ...(await dependencies.getDefindexPosition(wallet.address, current)) }; }
          catch (error) { return { ...unavailable(errorCode(error, "defindex_position_unavailable"), "DeFindex"), asset: current }; }
        }));
        return { status: positions.every(item => item.status === "ok") ? "ok" : "partial", network: "stellar:testnet", address: wallet.address,
          source: "DeFindex Soroban RPC", sourceUrl: DEFINDEX_TESTNET.rpcUrl, fetchedAt: new Date().toISOString(), positions,
          fundsMoved: false, transactionPrepared: false };
      },
    }),
    defineQuery({
      id: "circle.cctp.fees.read", toolName: "read_circle_cctp_fees_read", title: "Read Circle CCTP sandbox fees",
      description: "Read sandbox route fees for Avalanche Fuji to Stellar Testnet. Does not construct a bridge plan, request or transaction.",
      inputSchema: emptyInput, scope: "agent:read", dataScope: "testnet_offchain",
      execute: async () => {
        try { return { status: "ok", source: "Circle CCTP Sandbox", ...(await dependencies.getCctpFujiToStellarFees()), fundsMoved: false, transactionPrepared: false }; }
        catch (error) { return unavailable(errorCode(error, "cctp_fee_unavailable"), "Circle CCTP Sandbox"); }
      },
    }),
    defineQuery({
      id: "circle.cctp.readiness.read", toolName: "read_circle_cctp_readiness_read", title: "Read your CCTP Testnet readiness",
      description: "Check existing owner-bound Fuji and Stellar records and balances. Unknown chain reads remain unknown; no onboarding, trustline, bridge plan or payment is performed.",
      inputSchema: emptyInput, scope: "agent:read", dataScope: "testnet_onchain", requirements: ["evm_wallet", "stellar_wallet"],
      execute: async (_, context) => {
        const wallets = (await dependencies.listWallets(context.userId)).filter(row => row.userId === context.userId && row.status === "active");
        const source = wallets.find(row => row.chainType === "ethereum" && row.network === "avalanche:fuji");
        const destination = wallets.find(row => row.chainType === "stellar" && row.network === "stellar:testnet");
        const errors: string[] = [];
        let sourceNetworkMismatch = false;
        const checked = async <T>(read: () => Promise<T>, code: string) => {
          try { return await read(); } catch (error) {
            if (code === "fuji_rpc_unavailable" && error instanceof Error && error.message === "evm_chain_id_mismatch") {
              sourceNetworkMismatch = true;
              errors.push("fuji_chain_id_mismatch");
            } else { errors.push(code); }
            return null;
          }
        };
        const [fuji, usdc, stellar] = await Promise.all([
          source ? checked(() => dependencies.diagnoseEvmWallet(getWalletNetwork("avalanche:fuji"), source.address), "fuji_rpc_unavailable") : null,
          source ? checked(() => dependencies.getErc20Balance(getWalletNetwork("avalanche:fuji"), CCTP_TESTNET.avalanche.usdc, source.address, 6), "fuji_usdc_unavailable") : null,
          destination ? checked(() => dependencies.getStellarTestnetAccount(destination.address, AbortSignal.timeout(10_000)), "stellar_horizon_unavailable") : null,
        ]);
        const circleUsdc = stellar?.balances.find(row => row.asset === "USDC" && row.issuer === CCTP_TESTNET.stellar.usdcIssuer);
        const xlm = stellar?.balances.find(row => row.asset === "XLM");
        return { status: !source || !destination ? "requirement_missing" : errors.length ? "partial" : "ok", route: "avalanche:fuji->stellar:testnet", fetchedAt: new Date().toISOString(),
          sourceAddress: source?.address ?? null, destinationAddress: destination?.address ?? null,
          sourceGasReady: source ? fuji?.funded ?? null : false, sourceUsdcBalance: sourceNetworkMismatch ? null : usdc?.balance ?? null,
          destinationGasReady: destination ? stellar ? stellar.exists && Number(xlm?.balance ?? 0) > 0 : null : false,
          destinationTrustlineReady: destination ? stellar ? Boolean(circleUsdc) : null : false,
          errors, fundsMoved: false, transactionPrepared: false,
          ...(!source || !destination ? { continuationUrl: agentContinuationUrl(), requirements: [!source ? "evm_wallet" : null, !destination ? "stellar_wallet" : null].filter(Boolean) } : {}),
        };
      },
    }),
  ];
}

export const discoveryQueries = createDiscoveryQueries();
