import { getWalletNetwork, isWalletNetworkEnabled } from "./wallets/networks";
import type { AgentChatReply, AgentLanguage } from "./agent-chat-logic";
import { walletExplorerUrl } from "./wallets/explorer";

export function requestsRegisteredWallets(message: string) {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(wallets?|billeteras?|carteiras?)\b/.test(text)
    && /\b(show|list|give|see|view|muestra|muestrame|mostrar|dame|ver|consulta|mostre|listar|quais)\b/.test(text)
    && !/\b(send|transfer|swap|bridge|deposit|envia|enviar|transfiere|depositar|comprar|pagar|fund|activate|activa)\b/.test(text);
}

type Row = { id: string; userId: string; address: string; network: string; status: string };
export function registeredWalletsReply(userId: string, rows: Row[], language: AgentLanguage): AgentChatReply {
  const copy = {
    es: { title: "Tus billeteras registradas", registered: "registrada", pending: "registrada, pendiente de activación", empty: "No hay billeteras registradas para esta cuenta. Completa el ingreso normal en Carmelita.", note: "Las redes EVM comparten dirección; sus saldos son independientes. Esta consulta no actualiza saldos ni prepara operaciones." },
    en: { title: "Your registered wallets", registered: "registered", pending: "registered, activation pending", empty: "No wallets are registered for this account. Complete normal onboarding in Carmelita.", note: "EVM networks share an address; balances are separate. This query does not refresh balances or prepare operations." },
    pt: { title: "Suas carteiras registradas", registered: "registrada", pending: "registrada, ativação pendente", empty: "Não há carteiras registradas para esta conta. Complete o acesso normal na Carmelita.", note: "As redes EVM compartilham endereço; os saldos são separados. Esta consulta não atualiza saldos nem prepara operações." },
  }[language];
  const own = rows.filter(row => row.userId === userId && isWalletNetworkEnabled(row.network));
  const headers = { es: "Red | Dirección | Estado | Explorador", en: "Network | Address | State | Explorer", pt: "Rede | Endereço | Estado | Explorador" }[language];
  const linkLabel = { es: "Ver en explorador", en: "View on explorer", pt: "Ver no explorador" }[language];
  const unavailable = { es: "Consulta no disponible", en: "Information unavailable", pt: "Consulta indisponível" }[language];
  const safeCell = (value: string) => value.replace(/[|\r\n]/g, " ");
  return { content: own.length ? [
    `**${copy.title}**`,
    [`| ${headers} |`, "| --- | --- | --- | --- |", ...own.map(row => {
      const url = walletExplorerUrl(row.network, row.address);
      const state = row.status === "pending" ? copy.pending : ["active", "registered"].includes(row.status) ? copy.registered : unavailable;
      return `| ${getWalletNetwork(row.network).name} | ${safeCell(row.address)} | ${state} | ${url ? `[${linkLabel}](${url})` : "—"} |`;
    })].join("\n"), copy.note,
  ].join("\n\n") : copy.empty, actions: [] };
}

export function requestsWalletBalances(message: string) {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(saldos?|balances?)\b/.test(text)
    && !/\b(send|transfer|swap|bridge|deposit|envia|enviar|transfiere|depositar|comprar|pagar|fund|activate|activa)\b/.test(text);
}

export async function walletBalancesReply(userId: string, rows: Row[], language: AgentLanguage,
  read: (network: string, address: string) => Promise<string | null>): Promise<AgentChatReply> {
  const own = rows.filter(row => row.userId === userId && isWalletNetworkEnabled(row.network));
  const title = { es: "Saldos nativos consultados", en: "Native balances checked", pt: "Saldos nativos consultados" }[language];
  const unavailable = { es: "Saldo no disponible", en: "Balance unavailable", pt: "Saldo indisponível" }[language];
  const lines = await Promise.all(own.map(async row => {
    let balance: string;
    try { balance = (await read(row.network, row.address)) ?? { es: "Registrada, pendiente de activación", en: "Registered, activation pending", pt: "Registrada, ativação pendente" }[language]; } catch { balance = unavailable; }
    return `${getWalletNetwork(row.network).name}: ${balance}`;
  }));
  return { content: own.length ? [`**${title}**`, new Date().toISOString(), ...lines].join("\n\n") : registeredWalletsReply(userId, rows, language).content, actions: [] };
}
