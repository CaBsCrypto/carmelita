import { getWalletNetwork, isWalletNetworkEnabled } from "./wallets/networks";
import type { AgentChatReply, AgentLanguage } from "./agent-chat-logic";
import { walletExplorerUrl } from "./wallets/explorer";

export function requestsRegisteredWallets(message: string) {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ownedWallets = /^[¿¡\s]*(?:mis|mi|my|minhas|minha)\s+(?:registered\s+)?(?:wallets?|billeteras?|carteiras?)(?:\s+(?:registradas?|registered))?[?!.\s]*$/.test(text);
  const personalQuestion = /^[¿¡\s]*(?:cuales son mis (?:billeteras|wallets)|que (?:billeteras|wallets) tengo|what wallets do i have|which are my wallets|que carteiras (?:eu )?tenho)[?!.\s]*$/.test(text);
  return /\b(wallets?|billeteras?|carteiras?)\b/.test(text)
    && (ownedWallets || personalQuestion || /\b(show|list|give|see|view|muestra|muestrame|mostrar|dame|ver|consulta|mostre|listar|quais)\b/.test(text))
    && !/\b(saldos?|balances?)\b/.test(text)
    && !/\b(send|transfer|swap|bridge|deposit|envia|enviar|envie|transfiere|transferir|transfira|depositar|comprar|pagar|pague|pay|fund|activate|activa|activar|ative|ativar|prepare|prepara)\b/.test(text);
}

type Row = { id: string; userId: string; address: string; network: string; status: string; registrationState?: string };
export function registeredWalletsReply(userId: string, rows: Row[], language: AgentLanguage): AgentChatReply {
  const copy = {
    es: { title: "Tus billeteras registradas", registered: "registrada", empty: "No hay billeteras registradas para esta cuenta. Completa el ingreso normal en Carmelita.", note: "El estado corresponde al registro interno de Carmelita; no acredita actividad en cadena, activación de la cuenta ni saldo. Las redes EVM comparten dirección y tienen registros independientes. Esta consulta no obtiene saldos ni prepara operaciones." },
    en: { title: "Your registered wallets", registered: "registered", empty: "No wallets are registered for this account. Complete normal onboarding in Carmelita.", note: "The state refers to Carmelita's internal registry; it does not establish on-chain activity, account activation or balance. EVM networks share an address and have separate registrations. This query does not fetch balances or prepare operations." },
    pt: { title: "Suas carteiras registradas", registered: "registrada", empty: "Não há carteiras registradas para esta conta. Complete o acesso normal na Carmelita.", note: "O estado corresponde ao registro interno da Carmelita; não comprova atividade on-chain, ativação da conta nem saldo. As redes EVM compartilham endereço e têm registros independentes. Esta consulta não obtém saldos nem prepara operações." },
  }[language];
  const own = rows.filter(row => row.userId === userId && isWalletNetworkEnabled(row.network));
  const headers = { es: "Red | Dirección | Estado de registro | Explorador", en: "Network | Address | Registration state | Explorer", pt: "Rede | Endereço | Estado de registro | Explorador" }[language];
  const linkLabel = { es: "Ver en explorador", en: "View on explorer", pt: "Ver no explorador" }[language];
  const unavailable = { es: "Consulta no disponible", en: "Information unavailable", pt: "Consulta indisponível" }[language];
  const safeCell = (value: string) => value.replace(/[|\r\n]/g, " ");
  return { content: own.length ? [
    `**${copy.title}**`,
    [`| ${headers} |`, "| --- | --- | --- | --- |", ...own.map(row => {
      const url = walletExplorerUrl(row.network, row.address);
      // Prefer the server projection; legacy persisted pending rows are already registered.
      const registered = row.registrationState === undefined
        ? ["active", "pending", "registered"].includes(row.status)
        : row.registrationState === "registered";
      const state = registered ? copy.registered : unavailable;
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
    try { balance = (await read(row.network, row.address)) ?? unavailable; } catch { balance = unavailable; }
    return `${getWalletNetwork(row.network).name}: ${balance}`;
  }));
  return { content: own.length ? [`**${title}**`, new Date().toISOString(), ...lines].join("\n\n") : registeredWalletsReply(userId, rows, language).content, actions: [] };
}
