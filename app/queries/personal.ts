import { z } from "zod";
import { readChatNativeBalance } from "@/app/agent-chat-balances";
import { listMarketWatchlist } from "@/app/connectors/coinmarketcap";
import { listUserConnections } from "@/app/connectors/notion-oauth";
import { getMarketQuotes } from "@/app/market-data/service";
import { buildMcpWalletContext, getAgentMcpContext } from "@/app/mcp/agent-context";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { resolveOAuthSubjectForPrivy } from "@/app/services/oauth-subject-link-store";
import { StytchConnectedAppsClient, type ConnectedAppSummary } from "@/app/stytch/connected-apps-client";
import { readStytchConnectedAppsConfig } from "@/app/stytch/connected-apps-config";
import { getWalletNetwork, isWalletNetworkEnabled } from "@/app/wallets/networks";
import { walletNetworkIdSchema } from "@/app/wallets/types";
import { hasDatabase } from "@/db";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { diagnoseEvmWallet, getErc20Balance } from "@/app/wallets/evm-rpc";
import { AVALANCHE_X402 } from "@/app/x402-avalanche/config";
import { getSolanaDevnetBalance } from "@/app/wallets/solana-client";
import { readAgentActivity, readAgentAutopilot, readAgentConversation, readAgentVault } from "./personal-store";
import { defineQuery } from "./types";
import { agentContinuationUrl } from "./links";

type ConnectedAppsRead = {
  status: "ok" | "connection_required" | "unavailable";
  connectedApps: ConnectedAppSummary[];
  source: "Stytch";
  connectionUrl?: string;
  error?: string;
};

type ConnectedAppsDependencies = {
  config: typeof readStytchConnectedAppsConfig;
  resolveSubject: typeof resolveOAuthSubjectForPrivy;
  listApps: (config: ReturnType<typeof readStytchConnectedAppsConfig>, subject: string) => Promise<ConnectedAppSummary[]>;
};
const connectedAppsDependencies: ConnectedAppsDependencies = {
  config: readStytchConnectedAppsConfig,
  resolveSubject: resolveOAuthSubjectForPrivy,
  listApps: (config, subject) => new StytchConnectedAppsClient(config).listConnectedApps(subject),
};

/** Only resolves an existing link. Never creates a Stytch user or authorization. */
export async function readOwnConnectedApps(userId: string, dependencies: ConnectedAppsDependencies = connectedAppsDependencies): Promise<ConnectedAppsRead> {
  try {
    const config = dependencies.config();
    const subject = await dependencies.resolveSubject({ issuer: config.issuer, privyDid: userId });
    if (!subject) return { status: "connection_required", connectedApps: [], source: "Stytch", connectionUrl: agentContinuationUrl() };
    const connectedApps = (await dependencies.listApps(config, subject)).map(({ id, name, description, clientType, scopes }) => ({ id, name, description, clientType, scopes }));
    return { status: "ok", connectedApps, source: "Stytch" };
  } catch {
    // Config and provider failures can carry private server details: publish a fixed code.
    return { status: "unavailable", connectedApps: [], source: "Stytch", error: "connected_apps_unavailable", connectionUrl: agentContinuationUrl() };
  }
}

export type PersonalQueryDependencies = {
  context: typeof getAgentMcpContext;
  conversation: typeof readAgentConversation;
  wallets: typeof listPersistedUserWallets;
  nativeBalance: typeof readChatNativeBalance;
  watchlist: typeof listMarketWatchlist;
  quotes: typeof getMarketQuotes;
  connections: typeof listUserConnections;
  connectedApps: typeof readOwnConnectedApps;
  memory: typeof readAgentVault;
  activity: typeof readAgentActivity;
  autopilot: typeof readAgentAutopilot;
  stellarAccount: typeof getStellarTestnetAccount;
  evmDiagnostics: typeof diagnoseEvmWallet;
  erc20Balance: typeof getErc20Balance;
  solanaBalance: typeof getSolanaDevnetBalance;
  now: () => number;
};

const defaultDependencies: PersonalQueryDependencies = {
  context: getAgentMcpContext,
  conversation: readAgentConversation,
  wallets: async (userId) => {
    if (!hasDatabase()) throw new Error("database_not_configured");
    return listPersistedUserWallets(userId);
  },
  nativeBalance: readChatNativeBalance,
  watchlist: listMarketWatchlist,
  quotes: getMarketQuotes,
  connections: listUserConnections,
  connectedApps: readOwnConnectedApps,
  memory: readAgentVault,
  activity: readAgentActivity,
  autopilot: readAgentAutopilot,
  stellarAccount: getStellarTestnetAccount,
  evmDiagnostics: diagnoseEvmWallet,
  erc20Balance: getErc20Balance,
  solanaBalance: async (address, fetcher = fetch) => getSolanaDevnetBalance(address, (input, init) => fetcher(input, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(10_000),
  })),
  now: Date.now,
};

/** Internal registry read also supports legacy panel DTOs; provider IDs never enter MCP projections. */
export async function readOwnWalletRegistry(userId: string, listWallets: typeof listPersistedUserWallets = defaultDependencies.wallets) {
  const rows = (await listWallets(userId)).filter((wallet) => wallet.userId === userId && isWalletNetworkEnabled(wallet.network));
  return { rows, context: buildMcpWalletContext(rows) };
}

function conversationSummary(conversation: Awaited<ReturnType<typeof readAgentConversation>>) {
  const messagePreviews = conversation.messages.slice(-5).map(message => {
    const characters = Array.from(message.content);
    return { role: message.role, createdAt: message.createdAt,
      preview: characters.slice(0, 200).join(""), contentTruncated: characters.length > 200 };
  });
  return { view: "summary" as const, messagePreviews, coverage: {
    readLimit: 80, messagesRead: conversation.messages.length, messagesReturned: messagePreviews.length,
    messagesOmittedFromReadWindow: conversation.messages.length - messagePreviews.length,
    previewMaxCodePoints: 200, previewContentTruncated: messagePreviews.some(message => message.contentTruncated),
    olderMessagesOutsideReadWindow: "not_counted" as const,
  } };
}

export function createPersonalQueries(dependencies: PersonalQueryDependencies = defaultDependencies) {
  const queriedAt = () => new Date(dependencies.now()).toISOString();
  const ownWallets = async (userId: string) => (await readOwnWalletRegistry(userId, dependencies.wallets)).context;
  return [
    defineQuery({
      id: "personal.context", toolName: "get_agent_context", title: "Get personal agent context",
      description: "Read the authenticated user's profile, registered wallets, connections and authority boundary. Present Network | Address | Registration state | Explorer using returned explorerUrl for each enabled Testnet/Devnet registration. Raw wallet status='active' means registered in Carmelita's internal registry; status='pending' means pending registration. Use registrationState to present registered/pending registration (registrada/pendiente de registro in Spanish). Neither state proves on-chain activity, account activation or balance. The same EVM address may have separate Avalanche Fuji, BNB Testnet and Base Sepolia registrations. Never create a wallet.",
      inputSchema: z.object({}).strict(), scope: "agent:context", dataScope: "personal_testnet_context",
      execute: (_, { userId }) => dependencies.context(userId),
    }),
    defineQuery({
      id: "personal.conversation", toolName: "get_agent_conversation", title: "Get agent conversation",
      description: "Read the authenticated user's existing durable conversation. Prefer view='summary' in ChatGPT: at most five chronological previews of up to 200 Unicode code points, with explicit read-window coverage and content truncation. The default view='full' (including {}) preserves the complete latest-80-message DTO. An absent conversation is empty; this read never creates a conversation or an account.",
      inputSchema: z.object({ view: z.enum(["full", "summary"]).default("full") }).strict(), scope: "agent:conversation", dataScope: "personal_conversation",
      execute: async ({ view }, { userId }) => {
        const conversation = await dependencies.conversation(userId);
        return view === "summary" ? conversationSummary(conversation) : conversation;
      },
    }),
    defineQuery({
      id: "personal.wallets", toolName: "read_personal_wallets", title: "Read registered wallets",
      description: "Read only the authenticated owner's persisted wallet metadata and Testnet/Devnet network associations, including pending registrations and exact explorer links. Raw wallet status='active' means registered in the internal registry; status='pending' means pending registration. Present registrationState as registered/pending registration (registrada/pendiente de registro in Spanish), with Network | Address | Registration state | Explorer. Separate EVM networks may share an address. No on-chain activity, balances, onboarding, funding or activation is inferred. Legacy pendingActivation is an alias for pendingRegistration.",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "personal_testnet_wallet_registry",
      execute: async (_, { userId }) => ({ ...await ownWallets(userId), source: "Carmelita wallet registry", queriedAt: queriedAt() }),
    }),
    defineQuery({
      id: "personal.wallets.balances", toolName: "read_personal_wallets_balances", title: "Read Testnet native wallet balances",
      description: "Read native balances from enabled Testnet/Devnet RPCs for the authenticated owner's registered wallets. Optional networks only filter existing registrations, never select another owner's address. registrationStatus='active' means registered in the internal registry; 'pending' means pending registration, neither proves on-chain activity or balance. Null or unavailable is not zero; registration status and on-chain activation are separate. Never value Testnet funds using Mainnet prices.",
      inputSchema: z.object({ networks: z.array(walletNetworkIdSchema).min(1).max(5).optional() }).strict(),
      scope: "agent:read", dataScope: "personal_testnet_balances",
      execute: async ({ networks }, { userId }) => {
        const context = await ownWallets(userId);
        const wallets = context.wallets.filter((wallet) => !networks || networks.some((network) => network === wallet.network));
        const balances = await Promise.all(wallets.map(async (wallet) => {
          const network = getWalletNetwork(wallet.network);
          const details = { network: wallet.network, address: wallet.address, registrationStatus: wallet.status,
            registrationState: wallet.registrationState, registrationStatusScope: wallet.registrationStatusScope,
            nativeAsset: network.nativeAsset, explorerUrl: wallet.explorerUrl,
            source: network.family === "stellar" ? "Stellar Horizon" : network.family === "solana" ? "Solana RPC" : "EVM RPC",
            sourceUrl: network.rpcUrl, fetchedAt: queriedAt() };
          try {
            const balance = await dependencies.nativeBalance(wallet.network, wallet.address);
            if (balance === null && network.family !== "stellar") throw new Error("native_balance_unavailable");
            return { ...details, fetchedAt: queriedAt(), balance,
              status: balance === null ? "not_activated" as const : "ok" as const,
              onChainAccountExists: network.family === "stellar" ? balance !== null : null };
          } catch {
            return { ...details, fetchedAt: queriedAt(), balance: null, status: "unavailable" as const,
              onChainAccountExists: null, error: "native_balance_unavailable" };
          }
        }));
        return { balances, queriedAt: queriedAt(), status: balances.some((row) => row.status === "unavailable") ? "partial" : "ok",
          dataScope: "personal_testnet_balances", testnet: true, walletReadiness: context.walletReadiness };
      },
    }),
    defineQuery({
      id: "personal.wallets.status", toolName: "read_personal_wallets_status", title: "Read registered Testnet wallet status and assets",
      description: "Read only the authenticated owner's registered Testnet/Devnet wallets, native balances and existing Stellar assets with exact issuers. registrationStatus='active' means registered in the internal registry; 'pending' means pending registration, neither proves on-chain activity or balance. Avalanche Fuji also reads the configured Circle USDC contract. Other EVM and Solana networks expose native balances only; no token discovery is inferred. Registration, on-chain account existence and balances are separate. Missing or failed readings are null, never a fabricated zero. No activation, funding, signatures, transaction preparation or distributor access.",
      inputSchema: z.object({ networks: z.array(walletNetworkIdSchema).min(1).max(5).optional() }).strict(),
      scope: "agent:read", dataScope: "personal_testnet_wallet_status",
      execute: async ({ networks }, { userId, signal }) => {
        const registry = await ownWallets(userId);
        const selected = registry.wallets.filter((wallet) => !networks || networks.some((network) => network === wallet.network));
        const amount = (value: unknown): value is string => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value);
        const rows = await Promise.all(selected.map(async (wallet) => {
          const network = getWalletNetwork(wallet.network);
          const source = network.family === "stellar" ? "Stellar Horizon" : network.family === "solana" ? "Solana RPC" : "EVM RPC";
          const sourceUrl = network.family === "stellar" ? `${network.rpcUrl}/accounts/${encodeURIComponent(wallet.address)}` : network.rpcUrl;
          const details = { network: wallet.network, address: wallet.address, chainType: wallet.chainType,
            registrationStatus: wallet.status, registrationState: wallet.registrationState,
            registrationStatusScope: wallet.registrationStatusScope, explorerUrl: wallet.explorerUrl, source, sourceUrl, testnet: true };
          const unavailableNative = () => ({ asset: network.nativeAsset, balance: null, status: "unavailable" as const,
            source, sourceUrl, fetchedAt: queriedAt(), error: "native_balance_unavailable" });
          if (network.family === "stellar") {
            try {
              const deadline = AbortSignal.timeout(10_000);
              const account = await dependencies.stellarAccount(wallet.address, signal ? AbortSignal.any([signal, deadline]) : deadline);
              if (!account.exists) return { ...details, status: "not_activated", onChainAccountExists: false,
                native: { asset: "XLM", balance: null, status: "not_activated", source, sourceUrl, fetchedAt: queriedAt() },
                tokens: [], tokensStatus: "not_activated", omittedBalances: 0, fetchedAt: queriedAt() };
              const native = account.balances.find((balance) => balance.asset === "XLM" && balance.issuer === null);
              const nativeReading = native && amount(native.balance)
                ? { asset: "XLM", balance: native.balance, status: "ok" as const, source, sourceUrl, fetchedAt: queriedAt() }
                : unavailableNative();
              const credits = account.balances.filter((balance) => !(balance.asset === "XLM" && balance.issuer === null));
              const validCredits = credits.filter((balance) => /^[A-Za-z0-9]{1,12}$/.test(balance.asset)
                && typeof balance.issuer === "string" && /^G[A-Z2-7]{55}$/.test(balance.issuer));
              const tokens = validCredits.slice(0, 100).map((balance) => ({
                asset: balance.asset, issuer: balance.issuer, contract: null,
                balance: amount(balance.balance) ? balance.balance : null,
                status: amount(balance.balance) ? "ok" as const : "unavailable" as const,
                source, sourceUrl, fetchedAt: queriedAt(),
                ...(amount(balance.balance) ? {} : { error: "stellar_asset_balance_unavailable" }),
              }));
              const omittedBalances = credits.length - tokens.length;
              const tokenFailure = tokens.some((token) => token.status === "unavailable") || omittedBalances > 0;
              return { ...details, status: nativeReading.status === "ok" && !tokenFailure ? "ok" : "partial",
                onChainAccountExists: true, native: nativeReading, tokens,
                tokensStatus: tokenFailure ? "partial" : "ok", omittedBalances, fetchedAt: queriedAt() };
            } catch {
              return { ...details, status: "unavailable", onChainAccountExists: null, native: unavailableNative(),
                tokens: [], tokensStatus: "unavailable", omittedBalances: null, fetchedAt: queriedAt(), error: "stellar_account_unavailable" };
            }
          }
          if (network.family === "evm") {
            let networkMismatch = false;
            let diagnostics: Awaited<ReturnType<typeof diagnoseEvmWallet>> | null = null;
            const [native, usdc] = await Promise.all([
              dependencies.evmDiagnostics(network, wallet.address).then((reading) => {
                if (reading.chainId !== network.chainId) throw new Error("evm_chain_id_mismatch");
                if (reading.address.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("evm_wallet_reading_mismatch");
                if (!amount(reading.balance)) throw new Error("native_balance_unavailable");
                // Select only public RPC diagnostics, never provider-internal fields.
                diagnostics = { network: network.id, chainId: reading.chainId, address: wallet.address,
                  balanceWei: reading.balanceWei, balance: reading.balance, nativeAsset: network.nativeAsset,
                  gasPriceWei: reading.gasPriceWei, nonce: reading.nonce, funded: reading.funded,
                  explorerUrl: wallet.explorerUrl ?? reading.explorerUrl, faucetUrl: network.faucetUrl };
                return { asset: network.nativeAsset, balance: reading.balance, status: "ok" as const,
                  source, sourceUrl, fetchedAt: queriedAt() };
              }).catch((error: unknown) => {
                networkMismatch = error instanceof Error && error.message === "evm_chain_id_mismatch";
                const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
                return { ...unavailableNative(), error: /^evm_[a-z0-9_]{1,70}$/.test(code) ? code : "native_balance_unavailable" };
              }),
              network.id === "avalanche:fuji"
                ? dependencies.erc20Balance(network, AVALANCHE_X402.asset.address, wallet.address, AVALANCHE_X402.asset.decimals)
                  .then((reading) => {
                    if (!amount(reading.balance)) throw new Error("token_balance_unavailable");
                    return { asset: AVALANCHE_X402.asset.symbol, contract: AVALANCHE_X402.asset.address, issuer: null,
                      balance: reading.balance, status: "ok" as const, source, sourceUrl, fetchedAt: queriedAt() };
                  }).catch((error: unknown) => {
                    const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
                    return { asset: AVALANCHE_X402.asset.symbol, contract: AVALANCHE_X402.asset.address, issuer: null,
                      balance: null, status: "unavailable" as const, source, sourceUrl, fetchedAt: queriedAt(),
                      error: /^evm_[a-z0-9_]{1,70}$/.test(code) ? code : "token_balance_unavailable" };
                  })
                : null,
            ]);
            const verifiedUsdc = usdc && networkMismatch ? { ...usdc, balance: null, status: "unavailable" as const, error: "token_network_unverified" } : usdc;
            const tokens = verifiedUsdc ? [verifiedUsdc] : [];
            const tokensStatus = verifiedUsdc ? verifiedUsdc.status : "not_requested";
            const status = native.status === "ok" && (!verifiedUsdc || verifiedUsdc.status === "ok") ? "ok"
              : native.status === "unavailable" && (!verifiedUsdc || verifiedUsdc.status === "unavailable") ? "unavailable" : "partial";
            return { ...details, status, onChainAccountExists: null, native, tokens, tokensStatus, diagnostics,
              omittedBalances: 0, fetchedAt: queriedAt(), tokenCoverage: usdc ? "configured_circle_usdc_only" : "native_only" };
          }
          try {
            const reading = await dependencies.solanaBalance(wallet.address);
            if (reading.address !== wallet.address || !Number.isSafeInteger(reading.lamports) || reading.lamports < 0) throw new Error("solana_balance_unavailable");
            const atomic = BigInt(reading.lamports);
            const whole = atomic / BigInt(1_000_000_000);
            const fractional = (atomic % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
            const balance = `${whole}${fractional ? `.${fractional}` : ""}`;
            return { ...details, status: "ok", onChainAccountExists: null,
              native: { asset: network.nativeAsset, balance, status: "ok", source, sourceUrl, fetchedAt: queriedAt() },
              tokens: [], tokensStatus: "not_requested", tokenCoverage: "native_only", omittedBalances: 0, fetchedAt: queriedAt(),
              solana: { sol: reading.sol, lamports: reading.lamports, formatted: reading.formatted } };
          } catch {
            return { ...details, status: "unavailable", onChainAccountExists: null, native: unavailableNative(),
              tokens: [], tokensStatus: "not_requested", tokenCoverage: "native_only", omittedBalances: 0, fetchedAt: queriedAt() };
          }
        }));
        return { wallets: rows, queriedAt: queriedAt(), status: rows.some((row) => row.status === "partial" || row.status === "unavailable") ? "partial" : "ok",
          dataScope: "personal_testnet_wallet_status", testnet: true,
          authority: { signingAuthorityGranted: false, transactionPrepared: false, fundsMoved: false }, walletReadiness: registry.walletReadiness };
      },
    }),
    defineQuery({
      id: "personal.watchlist", toolName: "read_personal_watchlist", title: "Read personal market watchlist",
      description: "Read the authenticated owner's existing watchlist without adding or changing symbols. Optionally quote up to ten stored symbols using the shared Mainnet market service; preserve ambiguity, inactive identities (unavailable with reason='inactive'), verified absence (not_found) and provider failures (unavailable). Never value Testnet funds.",
      inputSchema: z.object({ includeQuotes: z.boolean().default(true), limit: z.number().int().min(1).max(10).default(10) }).strict(),
      scope: "agent:read", dataScope: "personal_watchlist_and_mainnet_market_data",
      execute: async ({ includeQuotes, limit }, { userId }) => {
        const items = (await dependencies.watchlist(userId)).map(({ symbol, source, createdAt }) => ({
          symbol, storedSource: source, createdAt: createdAt.toISOString(),
        }));
        return { items, source: "Carmelita watchlist registry", queriedAt: queriedAt(),
          quotes: includeQuotes && items.length ? await dependencies.quotes(items.slice(0, limit).map(({ symbol }) => ({ query: symbol }))) : null,
          quotedItems: includeQuotes ? Math.min(items.length, limit) : 0,
          unquotedItems: includeQuotes ? Math.max(0, items.length - limit) : items.length };
      },
    }),
    defineQuery({
      id: "personal.connections", toolName: "read_personal_connections", title: "Read personal connection status",
      description: "Read the authenticated owner's existing connection providers, status, granted scopes and expiry. Only public metadata is returned. Missing connections require the visible Carmelita flow; this read never opens OAuth or exposes credentials.",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "personal_connection_metadata",
      execute: async (_, { userId }) => {
        const connections = (await dependencies.connections(userId)).map(({ provider, status, scopes, tokenExpiresAt, updatedAt }) => ({
          provider, status, scopes, tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null, updatedAt: updatedAt.toISOString(),
          connectionUrl: agentContinuationUrl(),
        }));
        return { connections, source: "Carmelita connection registry", queriedAt: queriedAt(), connectionUrl: agentContinuationUrl() };
      },
    }),
    defineQuery({
      id: "personal.connected_apps", toolName: "read_personal_connected_apps", title: "Read connected assistant permissions",
      description: "Read the authenticated owner's existing assistant authorizations and their effective granted scopes. Uses only an existing identity link. Does not create identities, reconnect, revoke, broaden consent or disclose tokens.",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "personal_oauth_authorization_metadata",
      execute: async (_, { userId }) => ({ ...await dependencies.connectedApps(userId), queriedAt: queriedAt() }),
    }),
    defineQuery({
      id: "personal.memory", toolName: "read_personal_memory", title: "Read personal memory and policies",
      description: "Read the authenticated owner's existing personal memory, policies and recent decision summaries. Uses bounded read-only queries; never provisions tables, changes policy or executes an action.",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "personal_memory",
      execute: async (_, { userId }) => ({ ...await dependencies.memory(userId), source: "Carmelita personal vault", queriedAt: queriedAt() }),
    }),
    defineQuery({
      id: "personal.activity", toolName: "read_personal_activity", title: "Read personal activity",
      description: "Read bounded summaries of the authenticated owner's recent activity. Does not expose raw execution metadata, signatures or credentials and never executes or prepares an operation.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
      scope: "agent:read", dataScope: "personal_activity",
      execute: async ({ limit }, { userId }) => ({ activity: await dependencies.activity(userId, limit), source: "Carmelita activity registry", queriedAt: queriedAt() }),
    }),
    defineQuery({
      id: "personal.autopilot", toolName: "read_personal_autopilot", title: "Read recorded autopilot policy status",
      description: "Read only the authenticated owner's recorded Testnet autopilot policy, limits and expiration. A recorded signer setting is not a live signer check and does not grant signing authority. Never activate, pause, modify policy, prepare a transaction or move funds.",
      inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "personal_testnet_policy_status",
      execute: async (_, { userId }) => ({ ...await dependencies.autopilot(userId), source: "Carmelita personal policy registry", queriedAt: queriedAt(),
        authority: { policyChanged: false, signingAuthorityGranted: false, transactionPrepared: false, fundsMoved: false, executionEnabled: false } }),
    }),
  ];
}

export const personalQueries = createPersonalQueries();
