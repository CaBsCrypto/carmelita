import { parseMarketIntent } from "@/app/market-data/intents";
import { formatMarketQuotes, formatChainComparison } from "@/app/market-data/format";
import type { MarketQuotes, ChainComparison } from "@/app/market-data/types";
import { requestsRegisteredWallets, requestsWalletBalances, registeredWalletsReply } from "@/app/agent-chat-wallets";
import { parseVaultCommand } from "@/app/agent-memory";
import { parseCctpBridgeIntent } from "@/app/connectors/circle-cctp-intents";
import { parseAvalancheKnowledgeIntent, parseAvaxSkillsIntent, parseDexalotReadIntent, parseAvalancheEcosystemReadIntent, parseAvalancheCapabilitiesIntent } from "@/app/connectors/avalanche-read-intents";
import { parseUnblckChatIntent } from "@/app/unblck-chat";
import { executeWebReadQuery } from "./adapters";
import { getReadQuery } from "./registry";
import type { QueryLocale } from "./types";
import type { AgentChatReply } from "@/app/agent-chat-logic";
import { presentCommonRead } from "./presentation";

export type ChatReadRequest = { id: string; input: Record<string, unknown> } | { invalid: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Explicit commands make every typed query available without guessing parameters. */
export function parseChatReadRequest(message: string): ChatReadRequest | null {
  const command = message.trim().match(/^\/(?:consulta|query|consultar)\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (command) {
    try {
      const input: unknown = command[2] ? JSON.parse(command[2]) : {};
      if (!input || typeof input !== "object" || Array.isArray(input)) return { invalid: "invalid_read_query" };
      return { id: command[1], input: input as Record<string, unknown> };
    } catch { return { invalid: "invalid_read_query" }; }
  }
  const text = normalize(message).replace(/^[¿¡\s]+/, "");
  if (/^(?:que (?:puedo|podemos) hacer|what can (?:i|we) do|o que posso fazer|funciones disponibles|available (?:features|queries)|consultas disponibles)[?!.\s]*$/.test(text)) return { id: "offchain.capabilities.list", input: {} };
  if (parseAvalancheCapabilitiesIntent(message)) return { id: "avalanche.capabilities.list", input: {} };
  if (parseVaultCommand(message)?.action === "list") return { id: "personal.memory", input: {} };
  const unblck = parseUnblckChatIntent(message);
  if (unblck?.operation === "state") return { id: "offchain.unblck.hub_state", input: {} };
  if (unblck) return null;
  // A quote stays on the deterministic read path, before chat planning or wallet preparation.
  if (/\bsoroswap\b/.test(text) && /\b(quote|cotiza|cotizacion|cote|cotacao)\b/.test(text) && !/\b(swap|intercambia|troca|prepare|prepara)\b/.test(text)) {
    const pair = text.match(/(\d+(?:\.\d+)?)\s*(xlm|usdc)\s+(?:to|a|por|para|em)\s+(xlm|usdc)\b/);
    if (!pair) return { invalid: "soroswap_amount_required" };
    return { id: "stellar.soroswap.quote", input: { amount: pair[1], assetIn: pair[2].toUpperCase(), assetOut: pair[3].toUpperCase() } };
  }
  const bridge = parseCctpBridgeIntent(message);
  if (bridge?.operation === "readiness") {
    if (/\b(fees?|comisiones?|tarifas?|taxas?|costos?)\b/.test(text)) return { id: "circle.cctp.fees.read", input: {} };
    return { id: "circle.cctp.readiness.read", input: {} };
  }
  if (bridge) return null;
  const skills = parseAvaxSkillsIntent(message);
  if (skills) return { id: "avalanche.skills.search", input: { query: skills.query } };
  if (/\baave\b/.test(text) && /\b(position|posicion|posicao)\b/.test(text) && !/\b(deposit|depositar|supply|borrow|retira|withdraw)\b/.test(text)) {
    const requestedAddress = message.match(/0x[a-fA-F0-9]{40}/)?.[0];
    return { id: "avalanche.aave.position.read", input: requestedAddress ? { requestedAddress } : {} };
  }
  if (/\b(watchlist|lista de seguimiento|lista de acompanhamento)\b/.test(text) && !/\b(add|agrega|agregar|suma|follow|seguir|adicione|adicionar|coloque|acompanhar|remove|elimina|quita|remover)\b/.test(text)) return { id: "personal.watchlist", input: {} };
  const ecosystem = parseAvalancheEcosystemReadIntent(message);
  if (ecosystem) {
    const ids = {
      "predictions.sector": "predictions.sector.read", "predictions.markets": "predictions.markets.read",
      "aave.market": "avalanche.aave.market.read", "aave.position": "avalanche.aave.position.read",
      "nft.collection": "avalanche.nft.collection_read", "nft.holders": "avalanche.nft.holder_distribution",
      "nft.provenance": "avalanche.nft.provenance_read", "nft.venue_status": "avalanche.nft.venue_status",
      "nft.floor": "avalanche.nft.floor_read", "defillama.yields": "defillama.yields.read", "lfj.liveness": "lfj.swap.quote.read",
    };
    const { operation, ...input } = ecosystem;
    // A personal position is always selected by the authenticated owner, never by a supplied wallet.
    if (operation === "aave.position" && "wallet" in input) return { id: ids[operation], input: { requestedAddress: input.wallet } };
    return { id: ids[operation], input };
  }
  const dexalot = parseDexalotReadIntent(message);
  if (dexalot) {
    const { operation, ...input } = dexalot;
    return { id: operation === "pairs" ? "dexalot.markets.list" : "dexalot.quote.read", input };
  }
  const market = parseMarketIntent(message);
  if (market?.kind === "quotes") return { id: "offchain.market.quote", input: { assets: market.assets } };
  if (market?.kind === "chains") return { id: "offchain.defillama.chains", input: market.input };
  if (market) return { invalid: market.reason };
  const search = text.match(/^(?:busca|buscar|search|find|pesquise|procure)\s+(?:tokens?|activos?|assets?|ativos?)\s+(.+)$/);
  if (search) {
    const intent = parseMarketIntent(`Precio ${search[1]}`);
    if (intent?.kind === "quotes" && intent.assets.length === 1) return { id: "offchain.market.search", input: { asset: intent.assets[0] } };
    return { invalid: "asset_required" };
  }
  if (requestsWalletBalances(message)) return { id: "personal.wallets.balances", input: {} };
  if (requestsRegisteredWallets(message)) return { id: "personal.wallets", input: {} };
  const docs = parseAvalancheKnowledgeIntent(message);
  if (docs) return { id: "avalanche.docs.search", input: { query: docs.query } };
  if ((text.includes("notion") || text.includes("workspace")) && /\b(search|find|busca|buscar|pesquise|procure|tareas|tasks|tarefas)\b/.test(text)) return { id: "offchain.notion.search", input: { query: message.slice(0, 200) } };
  if (/\b(conexiones|connections|conexoes)\b/.test(text) && /\b(mis|my|minhas|mostrar|show|mostre|ver|list)\b/.test(text)) return { id: "personal.connections", input: {} };
  if (/\b(memoria|memory)\b/.test(text) && /\b(muestra|mostrar|show|mostre|listar|consulta|ver|read)\b/.test(text)) return { id: "personal.memory", input: {} };
  if (/\b(autopilot|autopiloto)\b/.test(text) && /\b(estado|status|show|muestra|mostre|ver|read)\b/.test(text) && !/\b(activate|activar|activa|pause|pausa|desactiva)\b/.test(text)) return { id: "personal.autopilot", input: {} };
  if (/\bdefindex\b/.test(text) && /\b(position|posicion|posiciones|posicao|status|estado)\b/.test(text) && !/\b(deposit|deposito|deposita|withdraw|retira|prepare|prepara)\b/.test(text)) return { id: "stellar.defindex.position.read", input: {} };
  return null;
}

function unavailable(locale: QueryLocale, reason: string): AgentChatReply {
  const text = {
    es: "La consulta no está disponible o necesita parámetros adicionales. No se modificó ninguna billetera ni conexión.",
    en: "This query is unavailable or needs additional parameters. No wallet or connection was changed.",
    pt: "A consulta está indisponível ou precisa de parâmetros adicionais. Nenhuma carteira ou conexão foi alterada.",
  }[locale];
  const explanations: Record<string, Record<QueryLocale, string>> = {
    network_required: { es: "Indica la red Mainnet y la dirección del contrato o mint.", en: "Specify the Mainnet network and contract or mint address.", pt: "Indique a rede Mainnet e o endereço do contrato ou mint." },
    too_many_assets: { es: "Consulta hasta 10 activos por mensaje.", en: "Query up to 10 assets per message.", pt: "Consulte até 10 ativos por mensagem." },
    testnet_market: { es: "Los datos de mercado son Mainnet; los fondos Testnet no se valoran.", en: "Market data are Mainnet; Testnet funds are not valued.", pt: "Os dados de mercado são Mainnet; fundos Testnet não são avaliados." },
    network_not_token: { es: "¿Quieres comparar TVL o consultar un token? Base no tiene token propio.", en: "Compare TVL or query a token? Base has no own token.", pt: "Comparar TVL ou consultar um token? Base não tem token próprio." },
    soroswap_amount_required: { es: "Indica el monto y los dos activos: Cotiza 1 XLM a USDC en Soroswap.", en: "Specify the amount and both assets: Quote 1 XLM to USDC on Soroswap.", pt: "Indique o valor e os dois ativos: Cote 1 XLM para USDC na Soroswap." },
  };
  return { content: explanations[reason]?.[locale] ?? text, actions: [] };
}

export async function executeChatRead(request: ChatReadRequest, userId: string, locale: QueryLocale): Promise<AgentChatReply> {
  if ("invalid" in request) return unavailable(locale, request.invalid);
  try {
    const definition = getReadQuery(request.id);
    const result = await executeWebReadQuery(request.id, request.input, userId, locale);
    if (definition.id === "offchain.market.quote") return { content: formatMarketQuotes(result as MarketQuotes, locale), actions: [] };
    if (definition.id === "offchain.defillama.chains") return { content: formatChainComparison(result as ChainComparison, locale), actions: [] };
    const commonPresentation = presentCommonRead(definition.id, result, locale);
    if (commonPresentation) return { content: commonPresentation, actions: [] };
    if (definition.id === "personal.wallets" && result && typeof result === "object" && "wallets" in result && Array.isArray(result.wallets)) {
      return registeredWalletsReply(userId, result.wallets.map(wallet => ({ ...wallet, userId })), locale);
    }
    if (definition.id === "personal.wallets.balances" && result && typeof result === "object" && "balances" in result && Array.isArray(result.balances)) {
      const title = { es: "Saldos nativos consultados", en: "Native balances checked", pt: "Saldos nativos consultados" }[locale];
      const unavailable = { es: "Saldo no disponible", en: "Balance unavailable", pt: "Saldo indisponível" }[locale];
      const pending = { es: "Registrada, pendiente de activación", en: "Registered, activation pending", pt: "Registrada, ativação pendente" }[locale];
      return { content: [`**${title}**`, ...result.balances.map(row => `${row.network}: ${row.balance ?? (row.status === "not_activated" ? pending : unavailable)}`)].join("\n\n"), actions: [] };
    }
    const label = { es: "Consulta de sólo lectura", en: "Read-only query", pt: "Consulta somente de leitura" }[locale];
    // Structured data preserve the exact contract that ChatGPT receives; presentation is independent.
    return { content: `**${label}${locale === "en" ? ` · ${definition.title}` : ""}**\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``, actions: [] };
  } catch (error) {
    return unavailable(locale, error instanceof Error ? error.message : "read_query_failed");
  }
}
