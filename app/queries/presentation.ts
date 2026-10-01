import { formatMarketQuotes } from "@/app/market-data/format";
import type { MarketQuotes } from "@/app/market-data/types";
import type { QueryLocale } from "./types";

const copy = {
  es: { queries: "Consultas de Carmelita", pending: "El catálogo muestra la disponibilidad y la aceptación de cada consulta en ambos canales.", command: "Puedes consultar desde el chat o usar los comandos en", developers: "Desarrolladores", watchlist: "Tu lista de seguimiento", empty: "No hay activos guardados.", connections: "Tus conexiones", noConnections: "No hay conexiones registradas. Puedes conectarlas desde", provider: "Proveedor", status: "Estado", scopes: "Permisos", quote: "Cotización Soroswap · Stellar Testnet", unavailable: "No disponible", minimum: "Mínimo tras deslizamiento", route: "Ruta", at: "Consultado", noTrade: "Esta consulta no prepara ni ejecuta una transacción.", source: "Fuente" },
  en: { queries: "Carmelita queries", pending: "The catalog shows availability and acceptance for each query in both channels.", command: "Ask in the chat or use commands from", developers: "Developers", watchlist: "Your watchlist", empty: "No saved assets.", connections: "Your connections", noConnections: "No registered connections. Connect them from", provider: "Provider", status: "Status", scopes: "Scopes", quote: "Soroswap quote · Stellar Testnet", unavailable: "Unavailable", minimum: "Minimum after slippage", route: "Route", at: "Queried", noTrade: "This query does not prepare or execute a transaction.", source: "Source" },
  pt: { queries: "Consultas da Carmelita", pending: "O catálogo mostra a disponibilidade e a aceitação de cada consulta nos dois canais.", command: "Pergunte no chat ou use comandos em", developers: "Desenvolvedores", watchlist: "Sua lista de acompanhamento", empty: "Nenhum ativo salvo.", connections: "Suas conexões", noConnections: "Nenhuma conexão registrada. Conecte-as na", provider: "Provedor", status: "Estado", scopes: "Permissões", quote: "Cotação Soroswap · Stellar Testnet", unavailable: "Indisponível", minimum: "Mínimo após deslizamento", route: "Rota", at: "Consultado", noTrade: "Esta consulta não prepara nem executa uma transação.", source: "Fonte" },
};
const groups = {
  es: ["Billeteras y saldos Testnet", "Precios de tokens y comparación de redes Mainnet", "Lista de seguimiento, memoria y actividad", "Conexiones y permisos existentes", "Viajes, documentación y catálogos", "Lecturas de Avalanche, DeFi y NFT"],
  en: ["Testnet wallets and balances", "Mainnet token prices and chain comparisons", "Watchlist, memory and activity", "Existing connections and permissions", "Travel, documentation and catalogs", "Avalanche, DeFi and NFT reads"],
  pt: ["Carteiras e saldos Testnet", "Preços de tokens e comparação de redes Mainnet", "Lista de acompanhamento, memória e atividade", "Conexões e permissões existentes", "Viagens, documentação e catálogos", "Consultas de Avalanche, DeFi e NFT"],
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function cell(value: unknown, missing: string) {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/[|\r\n]/g, " ") : missing;
}

/** Web presentation can differ; it never changes the service result or selects an asset. */
export function presentCommonRead(id: string, value: unknown, locale: QueryLocale): string | null {
  const data = record(value);
  if (!data) return null;
  const t = copy[locale];
  if (id === "offchain.capabilities.list") {
    return [`**${t.queries}**`, groups[locale].map(label => `- ${label}`).join("\n"), t.pending,
      `${t.command} [${t.developers}](/developers).`].join("\n\n");
  }
  if (id === "personal.conversation" && Array.isArray(data.messages)) {
    // The chat already contains the history. Do not persist another full copy of it
    // inside its own reply, especially earlier history replies with nested content.
    const recent = data.messages.slice(-5).map(record).filter(row => row !== null);
    const history = {
      es: { title: "Historial de conversación", empty: "No hay mensajes anteriores.", recent: "Vista breve de los últimos", returned: "mensajes devueltos", user: "Usuario", assistant: "Carmelita" },
      en: { title: "Conversation history", empty: "No earlier messages.", recent: "Brief view of the latest", returned: "returned messages", user: "User", assistant: "Carmelita" },
      pt: { title: "Histórico da conversa", empty: "Nenhuma mensagem anterior.", recent: "Resumo dos últimos", returned: "mensagens retornadas", user: "Usuário", assistant: "Carmelita" },
    }[locale];
    return [`**${history.title}**`, recent.length ? `${history.recent} ${recent.length} / ${data.messages.length} ${history.returned}.` : history.empty,
      ...recent.map(row => {
        const content = cell(row.content, t.unavailable).replace(/[`*_<>{}\[\]\\]/g, "");
        const preview = content.length > 200 ? `${content.slice(0, 200)}…` : content;
        return `${row.role === "user" ? history.user : history.assistant} · ${cell(row.createdAt, t.unavailable)}: ${preview}`;
      }),
    ].join("\n\n");
  }
  if (id === "personal.watchlist" && Array.isArray(data.items)) {
    const symbols = data.items.map(item => cell(record(item)?.symbol, t.unavailable));
    const quotes = record(data.quotes);
    return [`**${t.watchlist}**`, symbols.length ? symbols.join(", ") : t.empty,
      quotes ? formatMarketQuotes(quotes as MarketQuotes, locale) : ""].filter(Boolean).join("\n\n");
  }
  if (id === "personal.connections" && Array.isArray(data.connections)) {
    const rows = data.connections.map(record).filter(row => row !== null);
    return [`**${t.connections}**`, rows.length ? [
      `| ${t.provider} | ${t.status} | ${t.scopes} |`, "| --- | --- | --- |",
      ...rows.map(row => `| ${cell(row.provider, t.unavailable)} | ${cell(row.status, t.unavailable)} | ${Array.isArray(row.scopes) ? row.scopes.map(scope => cell(scope, t.unavailable)).join(", ") : t.unavailable} |`),
    ].join("\n") : `${t.noConnections} [Carmelita](${cell(data.connectionUrl, "/agent")}).`,
    `${t.source}: ${cell(data.source, t.unavailable)} · ${t.at}: ${cell(data.queriedAt, t.unavailable)}`].join("\n\n");
  }
  if (id === "stellar.soroswap.quote") {
    if (data.status !== "ok") return `**${t.quote}**\n\n${t.unavailable}. ${t.noTrade}`;
    return [`**${t.quote}**`, `${cell(data.amountIn, t.unavailable)} ${cell(data.assetIn, t.unavailable)} → ${cell(data.amountOut, t.unavailable)} ${cell(data.assetOut, t.unavailable)}`,
      `${t.minimum}: ${cell(data.minimumAmountOut, t.unavailable)} ${cell(data.assetOut, t.unavailable)} · ${t.route}: ${cell(data.platform, t.unavailable)}`,
      `${t.source}: ${cell(data.source, t.unavailable)} · ${t.at}: ${cell(data.fetchedAt, t.unavailable)}`, t.noTrade].join("\n\n");
  }
  return null;
}
