import { getWalletNetwork, isWalletNetworkEnabled } from "./wallets/networks";
import type { AgentChatReply, AgentLanguage } from "./agent-chat-logic";

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
  const groups = new Map<string, Row[]>();
  for (const row of own) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);
  return { content: own.length ? [
    `**${copy.title}**`,
    ...[...groups.values()].map(group => {
      const first = group[0];
      const family = getWalletNetwork(first.network).family.toUpperCase();
      return `**${family}**\n${first.address}\n${group.map(row => `${getWalletNetwork(row.network).name}: ${row.status === "pending" ? copy.pending : copy.registered}`).join("\n")}`;
    }), copy.note,
  ].join("\n\n") : copy.empty, actions: [] };
}
