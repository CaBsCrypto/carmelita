import { readAgentConversation } from "@/app/queries/personal-store";
import { buildRelevantMemoryContext } from "@/app/agent-memory-retrieval";
import { parseChatReadRequest, executeChatRead } from "@/app/queries/chat";
import type { QueryLocale } from "@/app/queries/types";
import { requestsRegisteredWallets, requestsWalletBalances } from "./agent-chat-wallets";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import {
  agentActivities,
  agentConnectionInterests,
  agentConversations,
  agentExternalConnections,
  agentMessages,
} from "@/db/schema";
import { listPersistedUserWallets, setPersistedWalletNetworkStatus } from "@/app/multichain-account";
import {
  buildAgentReply,
  detectAgentLanguage,
  findRequestedConnection,
  parseDefindexIntent,
  parseTestnetSetupIntent,
  type AgentChatReply,
  type AgentDefindexIntent,
  type AgentX402Intent,
  type AgentSoroswapIntent,
} from "@/app/agent-chat-logic";
import {
  fundStellarTestnetWallet,
  getStellarTestnetAccount,
} from "@/app/privy-stellar";
import { DEFINDEX_TESTNET } from "@/app/connectors/defindex";
import { parseVaultCommand } from "@/app/agent-memory";
import {
  evaluateUserAction,
  retrieveRelevantAgentMemory,
  saveAgentVaultCommand,
} from "@/app/agent-memory-store";
import {
  addToMarketWatchlist,
  extractMarketSymbol,
  formatMarketQuote,
} from "@/app/connectors/coinmarketcap";
import { getMarketQuote } from "@/app/connectors/coingecko";
import {
  getAgentPlannerReadiness,
  planAgentRequest,
  shouldUseAgentPlanner,
  type AgentPlan,
} from "@/app/agent-planner";
import { executeWebReadQuery } from "@/app/queries/adapters";
import { parseUnblckChatIntent } from "@/app/unblck-chat";
import { handleUnblckChatIntent } from "@/app/unblck-chat-runtime";
import { parseAvalancheChatIntent } from "@/app/wallets/avalanche-intents";
import {
  parseAvalancheCapabilitiesIntent,
  parseAvaxSkillsIntent,
  parseAvalancheEcosystemReadIntent,
  parseAvalancheKnowledgeIntent,
  parseDexalotReadIntent,
} from "@/app/connectors/avalanche-read-intents";
import { parseCctpBridgeIntent } from "@/app/connectors/circle-cctp-intents";
import { handleCctpBridgeIntent } from "@/app/connectors/circle-cctp-chat";
import { groupAvalancheCapabilities, listAvalancheCapabilities } from "@/app/avalanche/capability-registry";

export type StoredAgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  actions?: {
    label: string;
    message?: string;
    href?: string;
    connect?: string;
    walletAction?: {
      type: "avalanche.activate" | "avalanche.status" | "avalanche.fund" | "avalanche.send" | "avalanche.x402" | "avalanche.swap";
      network: "avalanche:fuji";
      amount?: "0.001";
      destination?: `0x${string}`;
      amountInAtomic?: string;
      requestId?: string;
    } | {
      type: "cctp.bridge";
      network: "avalanche:fuji";
      destinationNetwork: "stellar:testnet";
      amount: string;
      requestId?: string;
    };
    popup?: {
      provider: string;
      url: string;
      completionMessage: string;
      permissions: string[];
    };
    bazaarAction?: { query: string };
  }[];
  connection?: { name: string; stage: string; priority: string };
  defindexIntent?: AgentDefindexIntent & { requestId: string };
  x402Intent?: AgentX402Intent & { requestId: string };
  soroswapIntent?: AgentSoroswapIntent & { requestId: string };
  workflow?: AgentChatReply["workflow"];
  memoryUpdated?: boolean;
  memoryContext?: AgentChatReply["memoryContext"];
  decision?: {
    outcome: "allowed" | "blocked";
    summary: string;
    reasonCodes: string[];
    appliedRules: string[];
    requiresApproval: boolean;
    actionType: string;
  };

};

function conversationId(userId: string) {
  return "conv_" + createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

export async function walletContext(userId: string, listWallets = listPersistedUserWallets, getAccount = getStellarTestnetAccount, timeoutMs = 10_000) {
  const wallet = (await listWallets(userId)).find((candidate) =>
    candidate.userId === userId && candidate.network === "stellar:testnet" && candidate.chainType === "stellar"
    && (candidate.status === "active" || candidate.status === "pending"),
  );
  if (!wallet) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
  });
  let account: Awaited<ReturnType<typeof getStellarTestnetAccount>> | null;
  try {
    account = await Promise.race([getAccount(wallet.address, controller.signal).catch(() => null), deadline]);
  } finally {
    clearTimeout(timer);
  }
  const xlm = account?.balances.find((balance) => balance.asset === "XLM");
  const usdc = account?.balances.find(
    (balance) =>
      balance.asset === "USDC" &&
      balance.issuer === DEFINDEX_TESTNET.usdc.issuer,
  );

  return {
    address: wallet.address,
    network: "Stellar Testnet",
    accountExists: account?.exists ?? null,
    balance: xlm?.balance ?? null,
    usdcTrustlineActive: Boolean(usdc),
    usdcBalance: usdc?.balance ?? "0",
    usdcIssuer: DEFINDEX_TESTNET.usdc.issuer,
  };
}

async function ensureConversation(userId: string) {
  if (!hasDatabase()) throw new Error("database_not_configured");
  const db = getDb();
  const id = conversationId(userId);
  const now = new Date();

  await db
    .insert(agentConversations)
    .values({ id, userId, title: "My agent", updatedAt: now })
    .onConflictDoUpdate({
      target: agentConversations.id,
      set: { updatedAt: now },
    });

  const current = await db
    .select({ id: agentMessages.id })
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, id))
    .limit(1);

  if (!current.length) {
    await db.insert(agentMessages).values({
      id: randomUUID(),
      conversationId: id,
      userId,
      role: "assistant",
      content:
        "Welcome to Carmelita. Check your registered Stellar, EVM and Solana wallets and their test network balances here. Registration does not mean on-chain activation. Financial actions require separate approval.",
      metadata: {
        actions: [
          { label: "Show my wallet", message: "Show my wallet" },
          { label: "Check Testnet setup", message: "What is the next Testnet setup step?" },
          { label: "New user guide", href: "/guide" },
          { label: "Explore Travala", message: "Connect me to Travala" },
        ],
      },
    });
  }

  return id;
}

function publicMessage(row: {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}): StoredAgentMessage {
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    actions: Array.isArray(metadata.actions)
      ? (metadata.actions as StoredAgentMessage["actions"])
      : undefined,
    connection:
      metadata.connection && typeof metadata.connection === "object"
        ? (metadata.connection as StoredAgentMessage["connection"])
        : undefined,
    defindexIntent:
      metadata.defindexIntent && typeof metadata.defindexIntent === "object"
        ? (metadata.defindexIntent as StoredAgentMessage["defindexIntent"])
        : undefined,
    x402Intent:
      metadata.x402Intent && typeof metadata.x402Intent === "object"
        ? (metadata.x402Intent as StoredAgentMessage["x402Intent"])
        : undefined,
    soroswapIntent:
      metadata.soroswapIntent && typeof metadata.soroswapIntent === "object"
        ? (metadata.soroswapIntent as StoredAgentMessage["soroswapIntent"])
        : undefined,
    memoryUpdated: metadata.memoryUpdated === true,
    memoryContext:
      metadata.memoryContext && typeof metadata.memoryContext === "object"
        ? (metadata.memoryContext as StoredAgentMessage["memoryContext"])
        : undefined,
    decision:
      metadata.decision && typeof metadata.decision === "object"
        ? (metadata.decision as StoredAgentMessage["decision"])
        : undefined,
    workflow:
      metadata.workflow && typeof metadata.workflow === "object"
        ? (metadata.workflow as StoredAgentMessage["workflow"])
        : undefined,

  };
}

export async function getAgentConversation(userId: string) {
  return readAgentConversation(userId);
}

type WalletSetupContext = Awaited<ReturnType<typeof walletContext>>;

async function buildTestnetSetupReply(
  userId: string,
  intent: NonNullable<ReturnType<typeof parseTestnetSetupIntent>>,
  wallet: WalletSetupContext,
  language: "en" | "es" | "pt",
): Promise<AgentChatReply> {
  const copy = {
    en: {
      title: "**Your Stellar Testnet onboarding**", wallet: "Wallet", xlm: "XLM account activation", trustline: "Exact DeFindex USDC trustline", usdc: "Compatible Testnet USDC balance", ready: "ready", pending: "pending", unavailable: "temporarily unavailable", noWallet: "Your Privy identity is active, but the Stellar wallet record is not ready. Reopen the workspace so the automatic wallet bootstrap can finish.", lookupFailed: "I could not verify the wallet on Stellar Testnet, so I did not request funds. Retry when Horizon is available.", alreadyFunded: (balance: string) => `Your wallet is already active on Stellar Testnet with **${balance} XLM**. XLM is the native asset, so there is no separate XLM trustline to activate.`, funded: (balance: string) => `Friendbot activated your Stellar Testnet account and the wallet now has **${balance} XLM**. This is fake Testnet value only.`, fundFailed: "Friendbot could not activate the account right now. Nothing was changed and you can retry safely.", xlmReady: (balance: string) => `XLM is already active because the Stellar Testnet account exists with **${balance} XLM**. The next optional setup step is the exact DeFindex USDC trustline.`, xlmMissing: "XLM is native on Stellar. First activate the account with Friendbot; that creates the account and adds fake Testnet XLM in one step.", usdcReady: (balance: string) => `The exact DeFindex USDC trustline is already active. Compatible Testnet USDC balance: **${balance} USDC**.`, prepareUsdc: "I will prepare the exact DeFindex USDC trustline now. This is an on-chain Testnet transaction, so text can prepare it but the transaction-specific Privy button must authorize the signature.", prepareBeforeFunding: "Before the wallet can receive the DeFindex-compatible USDC, I must prepare its exact trustline. After you confirm that transaction, a compatible USDC distributor is still required.", usdcFunded: (balance: string) => `The wallet already has **${balance} compatible Testnet USDC** and can prepare a DeFindex USDC deposit.`, usdcBlocked: "The wallet can receive the exact USDC, but Carmelita does not yet control a distributor for that issuer. I will not label another Testnet USDC as compatible. Use the XLM vault proof now, or later configure a funded distributor/custom vault.", fund: "Fund Testnet XLM", activateUsdc: "Activate USDC", status: "Check setup", depositXlm: "Prepare 1 XLM deposit", depositUsdc: "Prepare 1 USDC deposit", explorer: "Open Friendbot receipt",
    },
    es: {
      title: "**Onboarding de Stellar Testnet**", wallet: "Wallet", xlm: "Activación de cuenta con XLM", trustline: "Trustline USDC exacta de DeFindex", usdc: "Saldo USDC Testnet compatible", ready: "lista", pending: "pendiente", unavailable: "temporalmente no disponible", noWallet: "Tu identidad Privy está activa, pero el registro de la wallet Stellar todavía no está listo. Reabre el workspace para completar el bootstrap automático.", lookupFailed: "No pude verificar la wallet en Stellar Testnet, por lo que no solicité fondos. Puedes reintentar cuando Horizon esté disponible.", alreadyFunded: (balance: string) => `Tu wallet ya está activa en Stellar Testnet con **${balance} XLM**. XLM es el activo nativo, por lo que no existe una trustline XLM separada que debamos activar.`, funded: (balance: string) => `Friendbot activó tu cuenta de Stellar Testnet y la wallet ahora tiene **${balance} XLM**. Es valor ficticio exclusivo de Testnet.`, fundFailed: "Friendbot no pudo activar la cuenta ahora. No se modificó nada y puedes reintentar de forma segura.", xlmReady: (balance: string) => `XLM ya está activo porque la cuenta Stellar Testnet existe con **${balance} XLM**. El siguiente paso opcional es la trustline USDC exacta de DeFindex.`, xlmMissing: "XLM es nativo de Stellar. Primero activa la cuenta con Friendbot; eso crea la cuenta y agrega XLM ficticio de Testnet en un solo paso.", usdcReady: (balance: string) => `La trustline USDC exacta de DeFindex ya está activa. Saldo USDC Testnet compatible: **${balance} USDC**.`, prepareUsdc: "Prepararé ahora la trustline USDC exacta de DeFindex. Es una transacción on-chain en Testnet: el texto puede prepararla, pero el botón específico de Privy debe autorizar la firma.", prepareBeforeFunding: "Antes de recibir el USDC compatible con DeFindex debo preparar su trustline exacta. Después de confirmarla aún necesitaremos un distribuidor de ese USDC.", usdcFunded: (balance: string) => `La wallet ya tiene **${balance} USDC Testnet compatible** y puede preparar un depósito USDC en DeFindex.`, usdcBlocked: "La wallet puede recibir el USDC exacto, pero Carmelita todavía no controla un distribuidor para ese issuer. No marcaré otro USDC Testnet como compatible. Podemos demostrar el vault XLM ahora o configurar más adelante un distribuidor/vault propio.", fund: "Recargar XLM Testnet", activateUsdc: "Activar USDC", status: "Revisar configuración", depositXlm: "Preparar depósito de 1 XLM", depositUsdc: "Preparar depósito de 1 USDC", explorer: "Abrir recibo Friendbot",
    },
    pt: {
      title: "**Onboarding da Stellar Testnet**", wallet: "Wallet", xlm: "Ativação da conta com XLM", trustline: "Trustline USDC exata da DeFindex", usdc: "Saldo USDC Testnet compatível", ready: "pronta", pending: "pendente", unavailable: "temporariamente indisponível", noWallet: "Sua identidade Privy está ativa, mas o registro da wallet Stellar ainda não está pronto. Reabra o workspace para concluir o bootstrap automático.", lookupFailed: "Não consegui verificar a wallet na Stellar Testnet, então não solicitei fundos. Tente novamente quando a Horizon estiver disponível.", alreadyFunded: (balance: string) => `Sua wallet já está ativa na Stellar Testnet com **${balance} XLM**. XLM é o ativo nativo, portanto não existe uma trustline XLM separada para ativar.`, funded: (balance: string) => `A Friendbot ativou sua conta Stellar Testnet e a wallet agora tem **${balance} XLM**. É valor fictício exclusivo da Testnet.`, fundFailed: "A Friendbot não conseguiu ativar a conta agora. Nada foi alterado e você pode tentar novamente com segurança.", xlmReady: (balance: string) => `O XLM já está ativo porque a conta Stellar Testnet existe com **${balance} XLM**. O próximo passo opcional é a trustline USDC exata da DeFindex.`, xlmMissing: "XLM é nativo da Stellar. Primeiro ative a conta com a Friendbot; isso cria a conta e adiciona XLM fictício da Testnet em uma etapa.", usdcReady: (balance: string) => `A trustline USDC exata da DeFindex já está ativa. Saldo USDC Testnet compatível: **${balance} USDC**.`, prepareUsdc: "Vou preparar agora a trustline USDC exata da DeFindex. É uma transação on-chain na Testnet: o texto pode prepará-la, mas o botão específico da Privy deve autorizar a assinatura.", prepareBeforeFunding: "Antes de receber o USDC compatível com a DeFindex, preciso preparar a trustline exata. Depois da confirmação, ainda precisaremos de um distribuidor desse USDC.", usdcFunded: (balance: string) => `A wallet já tem **${balance} USDC Testnet compatível** e pode preparar um depósito USDC na DeFindex.`, usdcBlocked: "A wallet pode receber o USDC exato, mas Carmelita ainda não controla um distribuidor desse issuer. Não vou marcar outro USDC Testnet como compatível. Podemos demonstrar o vault XLM agora ou configurar depois um distribuidor/vault próprio.", fund: "Recarregar XLM Testnet", activateUsdc: "Ativar USDC", status: "Verificar configuração", depositXlm: "Preparar depósito de 1 XLM", depositUsdc: "Preparar depósito de 1 USDC", explorer: "Abrir recibo Friendbot",
    },
  }[language];
  const prompts = {
    en: { fund: "Fund my wallet with Testnet XLM", activateUsdc: "Activate the DeFindex USDC trustline", status: "What is the next Testnet setup step?", depositXlm: "Deposit 1 XLM into DeFindex on Testnet", depositUsdc: "Deposit 1 USDC into DeFindex on Testnet" },
    es: { fund: "Recarga mi wallet con XLM de Testnet", activateUsdc: "Activa la trustline USDC de DeFindex", status: "¿Cuál es el siguiente paso de configuración Testnet?", depositXlm: "Deposita 1 XLM en DeFindex Testnet", depositUsdc: "Deposita 1 USDC en DeFindex Testnet" },
    pt: { fund: "Recarregue minha wallet com XLM da Testnet", activateUsdc: "Ative a trustline USDC da DeFindex", status: "Qual é o próximo passo da configuração Testnet?", depositXlm: "Deposite 1 XLM na DeFindex Testnet", depositUsdc: "Deposite 1 USDC na DeFindex Testnet" },
  }[language];

  if (!wallet) {
    return { content: copy.noWallet, actions: [] };
  }

  const xlmBalance = wallet.balance ?? "0";
  const setupStatus = () => [
    copy.title,
    `1. ✅ ${copy.wallet}: ${wallet.address}`,
    `2. ${wallet.accountExists ? "✅" : wallet.accountExists === false ? "○" : "?"} ${copy.xlm}: ${wallet.accountExists ? `${copy.ready} (${xlmBalance} XLM)` : wallet.accountExists === false ? copy.pending : copy.unavailable}`,
    `3. ${wallet.usdcTrustlineActive ? "✅" : "○"} ${copy.trustline}: ${wallet.usdcTrustlineActive ? copy.ready : copy.pending}`,
    `4. ${Number(wallet.usdcBalance) > 0 ? "✅" : "○"} ${copy.usdc}: ${wallet.usdcBalance} USDC`,
  ].join("\n");

  if (intent === "wallet_status" || intent === "readiness") {
    const actions = wallet.accountExists === false
      ? [{ label: copy.fund, message: prompts.fund }]
      : !wallet.usdcTrustlineActive
        ? [{ label: copy.activateUsdc, message: prompts.activateUsdc }, { label: copy.depositXlm, message: prompts.depositXlm }]
        : Number(wallet.usdcBalance) > 0
          ? [{ label: copy.depositUsdc, message: prompts.depositUsdc }, { label: copy.depositXlm, message: prompts.depositXlm }]
          : [{ label: copy.depositXlm, message: prompts.depositXlm }];
    return { content: setupStatus(), actions };
  }

  if (intent === "fund_xlm") {
    if (wallet.accountExists === null) {
      return { content: copy.lookupFailed, actions: [{ label: copy.status, message: prompts.status }] };
    }
    if (wallet.accountExists) {
      return { content: copy.alreadyFunded(xlmBalance), actions: [{ label: copy.activateUsdc, message: prompts.activateUsdc }, { label: copy.depositXlm, message: prompts.depositXlm }] };
    }
    try {
      const funding = await fundStellarTestnetWallet(wallet.address);
      const refreshed = await getStellarTestnetAccount(wallet.address);
      const refreshedXlm = refreshed.balances.find((balance) => balance.asset === "XLM")?.balance ?? "0";
      if (refreshed.exists) {
        const persisted = (await listPersistedUserWallets(userId)).find((candidate) =>
          candidate.userId === userId && candidate.network === "stellar:testnet" && candidate.chainType === "stellar" && candidate.address === wallet.address,
        );
        if (!persisted) throw new Error("stellar_wallet_not_ready");
        await setPersistedWalletNetworkStatus({ userId, walletId: persisted.id, network: "stellar:testnet", status: "active" });
        await getDb().insert(agentActivities).values({
          id: randomUUID(),
          userId,
          eventType: "wallet.testnet_funded",
          summary: "Stellar Testnet wallet funded through agent chat",
          metadata: {
            address: wallet.address,
            balance: refreshedXlm,
            transactionHash: funding.transactionHash,
          },
        });
      }
      return {
        content: copy.funded(refreshedXlm),
        actions: [
          ...(funding.transactionHash ? [{ label: copy.explorer, href: `https://stellar.expert/explorer/testnet/tx/${funding.transactionHash}` }] : []),
          { label: copy.activateUsdc, message: prompts.activateUsdc },
          { label: copy.status, message: prompts.status },
        ],
      };
    } catch {
      return { content: copy.fundFailed, actions: [{ label: copy.fund, message: prompts.fund }] };
    }
  }

  if (intent === "activate_xlm") {
    return wallet.accountExists
      ? { content: copy.xlmReady(xlmBalance), actions: [{ label: copy.activateUsdc, message: prompts.activateUsdc }, { label: copy.depositXlm, message: prompts.depositXlm }] }
      : { content: copy.xlmMissing, actions: [{ label: copy.fund, message: prompts.fund }] };
  }

  if (intent === "activate_usdc") {
    if (!wallet.accountExists) {
      return { content: copy.xlmMissing, actions: [{ label: copy.fund, message: prompts.fund }] };
    }
    if (wallet.usdcTrustlineActive) {
      return { content: copy.usdcReady(wallet.usdcBalance), actions: Number(wallet.usdcBalance) > 0 ? [{ label: copy.depositUsdc, message: prompts.depositUsdc }] : [{ label: copy.depositXlm, message: prompts.depositXlm }] };
    }
    return {
      content: copy.prepareUsdc,
      actions: [],
      defindexIntent: { operation: "usdc_trustline", asset: "USDC" },
    };
  }

  if (!wallet.accountExists) {
    return { content: copy.xlmMissing, actions: [{ label: copy.fund, message: prompts.fund }] };
  }
  if (!wallet.usdcTrustlineActive) {
    return {
      content: copy.prepareBeforeFunding,
      actions: [],
      defindexIntent: { operation: "usdc_trustline", asset: "USDC" },
    };
  }
  return Number(wallet.usdcBalance) > 0
    ? { content: copy.usdcFunded(wallet.usdcBalance), actions: [{ label: copy.depositUsdc, message: prompts.depositUsdc }] }
    : { content: copy.usdcBlocked, actions: [{ label: copy.depositXlm, message: prompts.depositXlm }, { label: copy.status, message: prompts.status }] };
}
export async function chatWalletContext(userId: string, content: string, readContext = walletContext) {
  // Persisted-wallet listing and per-network balance reads have their own data sources.
  if (requestsRegisteredWallets(content) || requestsWalletBalances(content)) return null;
  return readContext(userId);
}

export async function sendAgentMessage(userId: string, content: string, locale?: QueryLocale) {
  const sharedRead = parseChatReadRequest(content);
  const db = getDb();
  const id = await ensureConversation(userId);
  const now = new Date();
  const userMessage = {
    id: randomUUID(),
    conversationId: id,
    userId,
    role: "user",
    content,
    metadata: {},
    createdAt: now,
  };

  await db.insert(agentMessages).values(userMessage);
  const [wallet, activeConnections, relevantMemory] = await Promise.all([
    sharedRead ? Promise.resolve(null) : chatWalletContext(userId, content),
    db
      .select({ provider: agentExternalConnections.provider })
      .from(agentExternalConnections)
      .where(
        and(
          eq(agentExternalConnections.userId, userId),
          eq(agentExternalConnections.status, "active"),
        ),
      ),
    sharedRead ? Promise.resolve(buildRelevantMemoryContext([], content)) : retrieveRelevantAgentMemory(userId, content),
  ]);
  const connectedProviders = activeConnections.map((item) => item.provider);
  const normalizedContent = content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const language = locale ?? detectAgentLanguage(content);
  const local = (english: string, portuguese: string) =>
    language === "pt" ? portuguese : english;
  const balanceRead = requestsWalletBalances(content);
  const walletRead = requestsRegisteredWallets(content);
  const setupIntent = parseTestnetSetupIntent(content);
  const avalancheIntent = parseAvalancheChatIntent(content);
  const avalancheCapabilitiesIntent = parseAvalancheCapabilitiesIntent(content);
  const avaxSkillsIntent = parseAvaxSkillsIntent(content);
  const avalancheKnowledgeIntent = parseAvalancheKnowledgeIntent(content);
  const dexalotReadIntent = parseDexalotReadIntent(content);
  const ecosystemReadIntent = parseAvalancheEcosystemReadIntent(content);
  const cctpBridgeIntent = parseCctpBridgeIntent(content);
  const vaultCommand = parseVaultCommand(content);
  const unblckIntent = parseUnblckChatIntent(content);

  const marketSymbol = extractMarketSymbol(content);
  const requestsWatchlistAdd =
    Boolean(marketSymbol) &&
    ["add", "agrega", "agregar", "suma", "follow", "seguir", "adicione", "adicionar", "coloque", "acompanhar"].some((term) =>
      normalizedContent.includes(term),
    ) &&
    (normalizedContent.includes("watchlist") ||
      normalizedContent.includes("lista"));
  const requestsWatchlist =
    (normalizedContent.includes("watchlist") ||
      normalizedContent.includes("lista de seguimiento")) &&
    ["show", "list", "muestra", "mostrar", "ver", "mostre", "listar"].some((term) =>
      normalizedContent.includes(term),
    );
  const requestsMarketQuote =
    Boolean(marketSymbol) &&
    [
      "price",
      "precio",
      "preco",
      "cotacao",
      "quote",
      "cotiza",
      "market cap",
      "coinmarketcap",
      "coin market cap",
      "cmc",
    ].some((term) => normalizedContent.includes(term));

  const requestsNotionSearch =
    connectedProviders.includes("notion") &&
    (normalizedContent.includes("notion") ||
      normalizedContent.includes("workspace")) &&
    [
      "search",
      "find",
      "look for",
      "busca",
      "buscar",
      "encuentra",
      "pesquise",
      "procure",
      "encontre",
      "tarea",
      "tarefas",
      "task",
      "pendiente",
      "document",
      "pagina",
      "page",
    ].some((term) => normalizedContent.includes(term));

  const deterministicDefindex = parseDefindexIntent(content);
  const deterministicConnection = findRequestedConnection(content);
  const hasDeterministicIntent = Boolean(
    sharedRead || balanceRead || walletRead || vaultCommand ||
      unblckIntent ||
      setupIntent ||
      avalancheIntent ||
      avalancheCapabilitiesIntent ||
      avaxSkillsIntent ||
      avalancheKnowledgeIntent ||
      dexalotReadIntent ||
      ecosystemReadIntent ||
      requestsNotionSearch ||
      requestsWatchlistAdd ||
      requestsWatchlist ||
      requestsMarketQuote ||
      deterministicDefindex ||
      deterministicConnection ||
      normalizedContent.includes("x402"),
  );
  let plannerPlan: AgentPlan | null = null;
  if (shouldUseAgentPlanner({ hasDeterministicIntent, message: content })) {
    plannerPlan = await planAgentRequest({
      message: content,
      walletReady: Boolean(wallet?.address),
      connectedProviders,
      memoryDomains: relevantMemory.domains,
    }).catch(() => null);
  }

  let reply: AgentChatReply;
  if (sharedRead) {
    reply = await executeChatRead(sharedRead, userId, language);
  } else if (vaultCommand?.action === "save") {
    const saved = await saveAgentVaultCommand(userId, vaultCommand);
    const isDraft = saved.status === "draft";
    const copy = {
      en: isDraft
        ? "I saved **" + saved.label + "** as a draft authority rule. It cannot authorize an action until you activate it in My Agent, and financial execution will still require transaction-specific confirmation."
        : "I saved **" + saved.label + "** in your Personal Knowledge Vault. It is available across sessions and every use remains visible.",
      es: isDraft
        ? "Guard\u00e9 **" + saved.label + "** como borrador de autoridad. No puede autorizar acciones hasta que lo actives en My Agent, y una ejecuci\u00f3n financiera seguir\u00e1 exigiendo confirmaci\u00f3n espec\u00edfica."
        : "Guard\u00e9 **" + saved.label + "** en tu Personal Knowledge Vault. Estar\u00e1 disponible entre sesiones y cada uso seguir\u00e1 siendo visible.",
      pt: isDraft
        ? "Salvei **" + saved.label + "** como rascunho de autoridade. Ele n\u00e3o pode autorizar a\u00e7\u00f5es at\u00e9 ser ativado em My Agent, e uma execu\u00e7\u00e3o financeira continuar\u00e1 exigindo confirma\u00e7\u00e3o espec\u00edfica."
        : "Salvei **" + saved.label + "** no seu Personal Knowledge Vault. Ele ficar\u00e1 dispon\u00edvel entre sess\u00f5es e cada uso continuar\u00e1 vis\u00edvel.",
    }[language];
    reply = {
      content: copy,
      actions: [
        {
          label: language === "es" ? "Ver mi memoria" : language === "pt" ? "Ver minha mem\u00f3ria" : "Show my memory",
          message: language === "es" ? "\u00bfQu\u00e9 sabes de m\u00ed?" : language === "pt" ? "O que voc\u00ea sabe sobre mim?" : "What do you know about me?",
        },
        { label: "My Agent", href: "#my-agent" },
      ],
      memoryUpdated: true,
    };
  } else
  if (cctpBridgeIntent) {
    reply = await handleCctpBridgeIntent({ userId, intent: cctpBridgeIntent, language });
  } else if (unblckIntent) {
    reply = await handleUnblckChatIntent({
      intent: unblckIntent,
      userId,
      conversationId: id,
      userMessageId: userMessage.id,
      language,
    });
  } else if (setupIntent) {
    reply = await buildTestnetSetupReply(userId, setupIntent, wallet, language);
  } else if (avalancheCapabilitiesIntent) {
    const capabilities = listAvalancheCapabilities();
    const groups = groupAvalancheCapabilities();
    const live = capabilities.filter((item) => item.status === "live");
    const pending = capabilities.filter((item) => item.status === "ready_to_test");
    const labels = {
      en: { heading: "**Carmelita's Avalanche ecosystem**", live: "usable", pending: "pending acceptance", boundary: "Discovery and planning never sign or move funds. Financial actions open a separate Privy approval.", details: "Plan x402", quote: "Prepare Pangolin swap" },
      es: { heading: "**Ecosistema Avalanche de Carmelita**", live: "utilizable", pending: "pendiente de validacion", boundary: "Descubrir y planificar nunca firma ni mueve fondos. Las acciones financieras abren una aprobacion Privy separada.", details: "Planificar x402", quote: "Preparar swap en Pangolin" },
      pt: { heading: "**Ecossistema Avalanche da Carmelita**", live: "utilizavel", pending: "aguardando validacao", boundary: "Descoberta e planejamento nunca assinam nem movem fundos. Acoes financeiras abrem uma aprovacao Privy separada.", details: "Planejar x402", quote: "Preparar swap na Pangolin" },
    }[language];
    reply = {
      content: [
        labels.heading,
        ...groups.map((group) => `**${group.category.replace("_", " ")}**\n${group.capabilities.map((item) => `- ${item.title} - ${item.status === "live" ? labels.live : item.status === "ready_to_test" ? labels.pending : "planned"} - ${item.provider}`).join("\n")}`),
        `**Summary** - ${live.length} live - ${pending.length} pending acceptance`,
        labels.boundary,
      ].join("\n\n"),
      connection: { name: "Avalanche Capability Registry", stage: "Connected", priority: "P0" },
      actions: [
        { label: labels.quote, message: language === "es" ? "Prepara un swap de 0.1 AVAX a USDC en Pangolin" : language === "pt" ? "Prepare um swap de 0.1 AVAX para USDC na Pangolin" : "Prepare a 0.1 AVAX to USDC swap on Pangolin" },
        { label: labels.details, message: language === "es" ? "Prepara mi pago x402 en Avalanche" : language === "pt" ? "Prepare meu pagamento x402 na Avalanche" : "Prepare my Avalanche x402 payment" },
      ],
    };
  } else if (requestsWatchlistAdd && marketSymbol) {
    try {
      const quote = await getMarketQuote(marketSymbol);
      await addToMarketWatchlist(userId, quote.symbol);
      reply = {
        content: [
          quote.symbol + local(" is now on your persistent CoinMarketCap watchlist.", " agora está na sua watchlist persistente do CoinMarketCap."),
          formatMarketQuote(quote, language),
        ].join("\n\n"),
        connection: {
          name: "CoinGecko",
          stage: "Read-only connected" as const,
          priority: "P0" as const,
        },
        actions: [
          { label: local("Show watchlist", "Mostrar watchlist"), message: language === "pt" ? "Mostre minha watchlist de criptomoedas" : "Show my crypto watchlist" },
          {
            label: local("Check another asset", "Ver outro ativo"),
            message: language === "pt" ? "Qual é o preço atual do BTC no CoinMarketCap?" : "What is the current BTC price on CoinMarketCap?",
          },
        ],
      };
    } catch {
      reply = {
        content:
          local("CoinMarketCap could not validate that asset, so I did not add anything to your watchlist.", "O CoinMarketCap não conseguiu validar esse ativo, então nada foi adicionado à sua watchlist."),
        connection: {
          name: "CoinGecko",
          stage: "Read-only connected" as const,
          priority: "P0" as const,
        },
        actions: [
          {
            label: local("Try XLM", "Tentar XLM"),
            message: language === "pt" ? "Adicione XLM à minha watchlist do CoinMarketCap" : "Add XLM to my CoinMarketCap watchlist",
          },
        ],
      };
    }
  } else {
    let routedContent = content;
    if (plannerPlan?.intent === "defindex_deposit") {
      const { amount, asset } = plannerPlan.parameters;
      if (amount && asset) {
        routedContent = "Deposit " + amount + " " + asset + " into DeFindex on Testnet";
      }
    } else if (plannerPlan?.intent === "defindex_trustline") {
      routedContent = "Prepare the USDC trustline for DeFindex";
    } else if (
      plannerPlan?.intent === "connection" &&
      plannerPlan.parameters.provider
    ) {
      routedContent = "Connect me to " + plannerPlan.parameters.provider;
    }
    reply = buildAgentReply(routedContent, { wallet, connectedProviders });

    if (
      plannerPlan &&
      (plannerPlan.intent === "soroswap_quote" ||
        plannerPlan.intent === "soroswap_swap")
    ) {
      const amount = plannerPlan.parameters.amount;
      const assetIn = plannerPlan.parameters.assetIn ?? "XLM";
      const assetOut = plannerPlan.parameters.assetOut ?? "USDC";
      if (!amount) {
        reply = {
          content: {
            en: "Tell me the exact Testnet amount, for example: **Quote 1 XLM to USDC on Soroswap**.",
            es: "Dime el monto exacto de Testnet, por ejemplo: **Cotiza 1 XLM a USDC en Soroswap**.",
            pt: "Informe o valor exato da Testnet, por exemplo: **Cote 1 XLM para USDC na Soroswap**.",
          }[language],
          actions: [],
        };
      } else {
        try {
          const result = await executeWebReadQuery("stellar.soroswap.quote", {
            assetIn,
            assetOut,
            amount,
            slippageBps: plannerPlan.parameters.maxSlippageBps ?? 50,
          }, userId, language);
          if (!result || typeof result !== "object" || !("status" in result) || result.status !== "ok" || !("amountOut" in result)) {
            throw new Error("soroswap_quote_unavailable");
          }
          const quote = result as unknown as { amountIn: string; amountOut: string; minimumAmountOut: string; platform: string; priceImpactPct: string; slippageBps: number };
          const route = `**${quote.amountIn} ${assetIn} -> ${quote.amountOut} ${assetOut}**`;
          const minimum = `**${quote.minimumAmountOut} ${assetOut}**`;
          const copy = {
            en: `Live Soroswap Testnet quote: ${route}. Minimum after slippage: ${minimum}. Route: **${quote.platform}**; estimated price impact: **${quote.priceImpactPct}%**. A quote is read-only.`,
            es: `Cotizacion real de Soroswap Testnet: ${route}. Minimo despues del slippage: ${minimum}. Ruta: **${quote.platform}**; impacto estimado: **${quote.priceImpactPct}%**. Cotizar es de solo lectura.`,
            pt: `Cotacao real da Soroswap Testnet: ${route}. Minimo apos slippage: ${minimum}. Rota: **${quote.platform}**; impacto estimado: **${quote.priceImpactPct}%**. A cotacao e somente leitura.`,
          }[language];
          reply = {
            content: copy,
            actions:
              plannerPlan.intent === "soroswap_quote"
                ? [{
                    label: "Review swap",
                    message: `Swap ${amount} ${assetIn} to ${assetOut} on Soroswap Testnet`,
                  }]
                : [],
            connection: {
              name: "Soroswap",
              stage: "Ready to test",
              priority: "P0",
            },
            soroswapIntent:
              plannerPlan.intent === "soroswap_swap"
                ? {
                    operation: "swap",
                    assetIn,
                    assetOut,
                    amount,
                    slippageBps: quote.slippageBps,
                  }
                : undefined,
          };
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "soroswap_quote_failed";
          reply = {
            content: `Soroswap Testnet could not return a verified quote (**${code}**). No transaction was prepared and no funds moved.`,
            actions: [{
              label: "Retry quote",
              message: `Quote ${amount} ${assetIn} to ${assetOut} on Soroswap Testnet`,
            }],
          };
        }
      }
    }
  }
  if (reply.defindexIntent) {
    const intent = reply.defindexIntent;
    const actionType = intent.operation === "deposit"
      ? "defindex.deposit." + intent.asset.toLowerCase() + ".request"
      : "stellar.trustline.usdc.request";
    const decision = await evaluateUserAction(userId, {
      actionType,
      network: "stellar:testnet",
      asset: intent.asset,
      amount: intent.operation === "deposit" ? Number(intent.amount) : 0,
      financial: true,
      irreversible: true,
    });
    reply.decision = { ...decision, actionType };
    if (!decision.allowed) {
      reply.defindexIntent = undefined;
      reply.content = {
        en: "I did not prepare this action. Your active rules blocked it: **" + decision.reasonCodes.join(", ") + "**. No signature was requested and no funds moved.",
        es: "No prepar\u00e9 esta acci\u00f3n. Tus reglas activas la bloquearon: **" + decision.reasonCodes.join(", ") + "**. No se solicit\u00f3 firma ni se movieron fondos.",
        pt: "N\u00e3o preparei esta a\u00e7\u00e3o. Suas regras ativas a bloquearam: **" + decision.reasonCodes.join(", ") + "**. Nenhuma assinatura foi solicitada e nenhum saldo foi movimentado.",
      }[language];
      reply.actions = [{ label: "Review My Agent", href: "#my-agent" }];
    }
  }

  if (!vaultCommand && relevantMemory.items.length > 0) {
    reply.memoryContext = relevantMemory;
  }

  const assistantMessage = {
    id: randomUUID(),
    conversationId: id,
    userId,
    role: "assistant",
    content: reply.content,
    metadata: {
      actions: reply.actions.map((action) => action.walletAction
        ? { ...action, walletAction: { ...action.walletAction, requestId: userMessage.id } }
        : action),
      connection: reply.connection,
      defindexIntent: reply.defindexIntent
        ? { ...reply.defindexIntent, requestId: userMessage.id }
        : undefined,
      x402Intent: reply.x402Intent
        ? { ...reply.x402Intent, requestId: userMessage.id }
        : undefined,
      memoryUpdated: reply.memoryUpdated,
      soroswapIntent: reply.soroswapIntent
        ? { ...reply.soroswapIntent, requestId: userMessage.id }
        : undefined,
      memoryContext: reply.memoryContext,
      decision: reply.decision,
      workflow: reply.workflow,
      planner: plannerPlan
        ? {
            provider: `langchain-${getAgentPlannerReadiness().provider}`,
            mode: "plan-only",
            intent: plannerPlan.intent,
            confidence: plannerPlan.confidence,
            financial: plannerPlan.financial,
            requiresApproval: plannerPlan.requiresApproval,
          }
        : undefined,
    },
    createdAt: new Date(),
  };

  await db.insert(agentMessages).values(assistantMessage);
  await db
    .update(agentConversations)
    .set({ updatedAt: new Date() })
    .where(eq(agentConversations.id, id));

  const connection = findRequestedConnection(content);
  if (connection && !sharedRead) {
    await db
      .insert(agentConnectionInterests)
      .values({
        id: randomUUID(),
        userId,
        connectionName: connection.name,
        status: "exploring",
        lastMessage: content,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          agentConnectionInterests.userId,
          agentConnectionInterests.connectionName,
        ],
        set: {
          status: "exploring",
          lastMessage: content,
          updatedAt: new Date(),
        },
      });
  }

  return {
    conversationId: id,
    userMessage: publicMessage(userMessage),
    assistantMessage: publicMessage(assistantMessage),
    wallet: sharedRead ? null : await chatWalletContext(userId, content),
    sharedRead: Boolean(sharedRead),
  };
}

export async function recentConversationSummary(userId: string) {
  const db = getDb();
  return db
    .select({
      id: agentConversations.id,
      title: agentConversations.title,
      updatedAt: agentConversations.updatedAt,
    })
    .from(agentConversations)
    .where(eq(agentConversations.userId, userId))
    .orderBy(desc(agentConversations.updatedAt))
    .limit(10);
}
