import { connections, type Connection } from "@/app/connections/data";
import { parseAvalancheChatIntent } from "@/app/wallets/avalanche-intents";
import { parseAvalancheEcosystemReadIntent } from "@/app/connectors/avalanche-read-intents";

export type AgentLanguage = "en" | "es" | "pt";

export type AgentChatAction = {
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

};
export type AgentTestnetSetupIntent =
  | "wallet_status"
  | "fund_xlm"
  | "activate_xlm"
  | "activate_usdc"
  | "fund_usdc"
  | "readiness";

export function parseTestnetSetupIntent(
  message: string,
): AgentTestnetSetupIntent | null {
  const query = normalized(message);
  const mentionsUsdc = /\busdc\b/.test(query);
  const mentionsXlm = /\bxlm\b/.test(query) || query.includes("lumen");
  const mentionsWallet = ["wallet", "billetera", "carteira"].some((term) =>
    query.includes(term),
  );
  const wantsFunding = [
    "recarga",
    "recargar",
    "carga saldo",
    "fondea",
    "fondear",
    "fund",
    "top up",
    "recarregue",
    "recarregar",
    "carregue",
    "adicionar saldo",
  ].some((term) => query.includes(term));
  const wantsActivation = [
    "activa",
    "activar",
    "activate",
    "active",
    "ative",
    "ativar",
  ].some((term) => query.includes(term));

  if (wantsFunding && mentionsUsdc) return "fund_usdc";
  if (wantsActivation && mentionsUsdc) return "activate_usdc";
  if (wantsFunding && (mentionsWallet || mentionsXlm || query.includes("testnet"))) {
    return "fund_xlm";
  }
  if (wantsActivation && mentionsXlm) return "activate_xlm";

  const asksForWallet = [
    "dame mi wallet",
    "muestra mi wallet",
    "mostrar mi wallet",
    "show my wallet",
    "give me my wallet",
    "mostre minha wallet",
    "qual e minha wallet",
  ].some((term) => query.includes(term));
  if (asksForWallet) return "wallet_status";

  const asksForReadiness = [
    "que sigue",
    "siguiente paso",
    "estado testnet",
    "status testnet",
    "configura mi wallet",
    "prepara mi wallet",
    "testnet onboarding",
    "what is next",
    "next step",
    "configure my wallet",
    "qual e o proximo",
    "proximo passo",
    "configure minha wallet",
  ].some((term) => query.includes(term));
  return asksForReadiness ? "readiness" : null;
}
export type AgentX402Intent = { operation: "demo_payment" };

export type AgentDefindexIntent =
  | { operation: "deposit"; asset: "XLM" | "USDC"; amount: string }
  | { operation: "usdc_trustline"; asset: "USDC" };

export type AgentSoroswapIntent = {
  operation: "swap";
  assetIn: "XLM" | "USDC";
  assetOut: "XLM" | "USDC";
  amount: string;
  slippageBps: number;
};

export type AgentChatReply = {
  content: string;
  actions: AgentChatAction[];
  connection?: {
    name: string;
    stage: Connection["stage"];
    priority: Connection["priority"];
  };
  defindexIntent?: AgentDefindexIntent;
  x402Intent?: AgentX402Intent;
  soroswapIntent?: AgentSoroswapIntent;
  workflow?: {
    id: string;
    status: string;
    engine: "langgraph";
    version: number;
  };
  memoryUpdated?: boolean;
  memoryContext?: {
    provider: "neon-topic-router";
    domains: string[];
    items: Array<{
      id: string;
      kind: string;
      label: string;
      source: string;
      score: number;
    }>;
  };
  decision?: {
    outcome: "allowed" | "blocked";
    summary: string;
    reasonCodes: string[];
    appliedRules: string[];
    requiresApproval: boolean;
    actionType: string;
  };
};

export type AgentChatContext = {
  wallet?: { address: string; balance: string | null; network: string } | null;
  connectedProviders?: string[];
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function parseDefindexIntent(message: string): AgentDefindexIntent | null {
  const query = normalized(message);
  const mentionsDefindex = ["defindex", "de findex", "findex"].some((term) =>
    query.includes(term),
  );
  if (!mentionsDefindex) return null;

  const mentionsUsdc = /\busdc\b/.test(query);
  const asksForTrustline = [
    "trustline",
    "trust line",
    "linea de confianza",
    "linha de confianca",
  ].some((term) => query.includes(term));
  if (mentionsUsdc && asksForTrustline) {
    return { operation: "usdc_trustline", asset: "USDC" };
  }

  const asksForDeposit = [
    "deposit",
    "deposita",
    "depositar",
    "deposite",
    "invest",
    "invierte",
    "invertir",
    "invista",
    "investir",
  ].some((term) => query.includes(term));
  if (!asksForDeposit) return null;

  const asset = mentionsUsdc
    ? "USDC"
    : /\bxlm\b/.test(query) || query.includes("stellar lumen")
      ? "XLM"
      : null;
  if (!asset) return null;

  const escapedAsset = asset === "XLM" ? "xlm" : "usdc";
  const amountMatch = query.match(
    new RegExp("(?:^|\\s)(\\d+(?:[.,]\\d{1,7})?)(?=\\s*" + escapedAsset + "\\b)"),
  );
  if (!amountMatch) return null;

  return {
    operation: "deposit",
    asset,
    amount: amountMatch[1].replace(",", "."),
  };
}

const languageSignals: Record<"es" | "pt", string[]> = {
  es: ["quiero", "recarga", "activa", "siguiente", "deposita", "invierte", "conectame", "conecta", "muestrame", "billetera", "prueba", "puedes", "busquemos", "archivo", "correo", "viaje", "mi cuenta", "inicie sesion", "ya entre", "sesion", "estado", "reserva", "reservar", "codigo", "credito", "creditos", "cancela", "cancelar", "disponibles"],
  pt: ["quero", "recarregue", "ative", "proximo", "deposite", "invista", "investir", "conecte", "conectar ao", "mostre", "minha", "meu", "carteira", "teste", "voce", "nao", "pesquise", "arquivo", "viagem", "cotacao", "preco", "ja entrei", "sessao"],
};

export function detectAgentLanguage(message: string): AgentLanguage {
  const query = ` ${normalized(message)} `;
  const score = (language: "es" | "pt") =>
    languageSignals[language].reduce((total, signal) => total + (query.includes(normalized(signal)) ? 1 : 0), 0);
  const pt = score("pt");
  const es = score("es");
  if (pt > es && pt > 0) return "pt";
  if (es > 0) return "es";
  return "en";
}

const aliases: Record<string, string[]> = {
  DeFindex: ["defindex", "de findex", "findex"],
  "UNBLCK / Tellus Hub": ["unblck", "unblock", "tellus", "innovation hub", "hub de inovacao"],
  ArcusX: ["arcusx", "arcus", "arkusx", "arkus"],
  "Travala Travel MCP": ["travala", "travel", "hotel", "viaje", "viagem", "hospedagem"],
  "Apify MCP": ["apify"],
  "Shopify Storefront MCP": ["shopify"],
  "Cal.com MCP": ["cal.com", "cal booking", "reserva cal", "agendamento cal"],
  "Notion MCP": ["notion", "wiki", "notas", "notes", "anotacoes"],
  Trello: ["trello", "tablero", "board", "cards", "tarjetas", "quadro", "cartoes"],
  "Google Calendar": ["google calendar", "google calendario", "agenda", "calendario"],
  "Google Drive": ["google drive", "drive", "archivos", "files", "documentos", "arquivos"],
  Gmail: ["gmail", "correo", "email", "mail", "e-mail"],
  "Privy wallet orchestration": ["privy", "wallet", "billetera", "carteira"],
  "x402 Bazaar": ["x402", "bazaar"],
  "CoinGecko Market Data": ["coingecko", "coin gecko"],
  "CoinMarketCap Agent Hub": ["coinmarketcap", "coin market cap", "cmc"],
  TradingView: ["tradingview", "trading view"],
};

const stageLabels: Record<AgentLanguage, Partial<Record<Connection["stage"], string>>> = {
  en: {},
  es: { Connected: "Conectado", "Read-only connected": "Conectado en lectura", "Ready to test": "Listo para probar", "Credentials needed": "Requiere credenciales", "Partner outreach": "Contacto con partner", Research: "Investigación" },
  pt: { Connected: "Conectado", "Read-only connected": "Conectado somente para leitura", "Ready to test": "Pronto para testar", "Credentials needed": "Requer credenciais", "Partner outreach": "Contato com parceiro", Research: "Pesquisa" },
};

const text = {
  en: {
    current: "is currently", connectedAuth: "Your authorization is stored encrypted on the server and can be used only through this agent.", planning: "I can prepare its reversible first test and document the credentials, permissions and evidence still required.", safeConnected: "I can use the available capability, but any financial or irreversible action still requires explicit review.", safePending: "I will not claim the external connection is active until access and evidence are complete.",
    connectNotion: "Connect Notion", searchNotion: "Search Notion", checkXlm: "Check XLM price", showWatchlist: "Show watchlist", preparePlan: "Prepare plan", missing: "What is missing?", source: "Open official source",
    walletPending: "Your Privy session is active, but the Stellar Testnet wallet setup has not finished yet. Reopen the workspace or retry setup before preparing an on-chain action.", retryWallet: "Retry wallet setup",
    testnet: (balance: string) => `You are already in **Stellar Testnet**. Your personal Privy wallet is active with ${balance} XLM balance.\n\nThe safest proof is: inspect this wallet, activate the exact USDC trustline, review a 1 XLM DeFindex deposit, explicitly authorize the signature and verify the receipt on Stellar Expert. No Mainnet funds are enabled.`, startProof: "Start Testnet proof", showWallet: "Show my wallet",
    noWallet: "Your Privy identity is connected, but I do not have a persisted Stellar wallet record yet. Reopen the workspace so the safe wallet bootstrap can complete.",
    wallet: (network: string, address: string, balance: string) => `Your active wallet is on **${network}**.\n\nAddress: ${address}\n\nCurrent XLM balance: **${balance}**.\n\nI can use this address to prepare Testnet intents, but I cannot sign or submit a payment without your explicit authorization.`, explore: "Explore DeFindex", preparePayment: "Prepare a test payment",
    connectIntro: "I can connect a service through a safe sequence: discover its real interface, identify credentials, prepare a reversible test, request authorization and preserve evidence. Choose one active pilot track.",
    help: "I can inspect your Stellar Testnet context, explain and prepare integrations, search connected read-only services, create controlled commerce intents and guide approvals. Wallet creation and on-chain validation are real; partner execution and payments remain gated until each connector is proven.", exploreConnections: "Explore connections", connectNotionShort: "Connect Notion", searchTravel: "Search travel",
    fallback: "I understand the goal, but I need one concrete target to prepare a safe action. Tell me what you want to connect, discover, reserve or pay—or choose one starting point below.", connectDefindex: "Connect DeFindex", connectUnblck: "Connect UNBLCK", exploreTravel: "Explore travel",
  },
  es: {
    current: "está actualmente", connectedAuth: "Tu autorización está cifrada en el servidor y solo puede utilizarse mediante este agente.", planning: "Puedo preparar su primera prueba reversible y documentar las credenciales, permisos y evidencias pendientes.", safeConnected: "Puedo usar la capacidad disponible, pero toda acción financiera o irreversible requiere una revisión explícita.", safePending: "No afirmaré que la conexión está activa hasta completar el acceso y la evidencia.",
    connectNotion: "Conectar Notion", searchNotion: "Buscar en Notion", checkXlm: "Ver precio de XLM", showWatchlist: "Mostrar watchlist", preparePlan: "Preparar plan", missing: "¿Qué falta?", source: "Abrir fuente oficial",
    walletPending: "Tu sesión Privy está activa, pero la configuración de la wallet Stellar Testnet aún no termina. Reabre el workspace o reintenta antes de preparar una acción on-chain.", retryWallet: "Reintentar wallet",
    testnet: (balance: string) => `Ya estás en **Stellar Testnet**. Tu wallet personal de Privy está activa con ${balance} XLM.\n\nLa prueba más segura es revisar esta wallet, activar la trustline USDC exacta, revisar un depósito de 1 XLM en DeFindex, autorizar la firma y verificar el recibo en Stellar Expert. Mainnet está desactivada.`, startProof: "Iniciar prueba Testnet", showWallet: "Mostrar mi wallet",
    noWallet: "Tu identidad Privy está conectada, pero aún no existe un registro persistente de la wallet Stellar. Reabre el workspace para completar el onboarding seguro.",
    wallet: (network: string, address: string, balance: string) => `Tu wallet activa está en **${network}**.\n\nDirección: ${address}\n\nSaldo XLM actual: **${balance}**.\n\nPuedo preparar intents en Testnet con esta dirección, pero no firmar ni enviar un pago sin tu autorización explícita.`, explore: "Explorar DeFindex", preparePayment: "Preparar pago de prueba",
    connectIntro: "Puedo conectar un servicio mediante una secuencia segura: descubrir su interfaz real, identificar credenciales, preparar una prueba reversible, solicitar autorización y conservar evidencia. Elige un piloto activo.",
    help: "Puedo revisar tu contexto de Stellar Testnet, preparar integraciones, buscar en servicios conectados de solo lectura, crear intents controlados y guiar aprobaciones. La wallet y la validación on-chain son reales; la ejecución de partners y pagos permanece bloqueada hasta validar cada conector.", exploreConnections: "Explorar conexiones", connectNotionShort: "Conectar Notion", searchTravel: "Buscar viajes",
    fallback: "Entiendo el objetivo, pero necesito un destino concreto para preparar una acción segura. Dime qué quieres conectar, descubrir, reservar o pagar, o elige un punto de inicio.", connectDefindex: "Conectar DeFindex", connectUnblck: "Conectar UNBLCK", exploreTravel: "Explorar viajes",
  },
  pt: {
    current: "está atualmente", connectedAuth: "Sua autorização está criptografada no servidor e só pode ser usada por este agente.", planning: "Posso preparar o primeiro teste reversível e documentar as credenciais, permissões e evidências ainda necessárias.", safeConnected: "Posso usar a capacidade disponível, mas qualquer ação financeira ou irreversível ainda exige revisão explícita.", safePending: "Não afirmarei que a conexão está ativa até que o acesso e a evidência estejam completos.",
    connectNotion: "Conectar Notion", searchNotion: "Pesquisar no Notion", checkXlm: "Ver preço do XLM", showWatchlist: "Mostrar watchlist", preparePlan: "Preparar plano", missing: "O que falta?", source: "Abrir fonte oficial",
    walletPending: "Sua sessão Privy está ativa, mas a configuração da wallet Stellar Testnet ainda não terminou. Reabra o workspace ou tente novamente antes de preparar uma ação on-chain.", retryWallet: "Tentar wallet novamente",
    testnet: (balance: string) => `Você já está na **Stellar Testnet**. Sua wallet pessoal da Privy está ativa com ${balance} XLM.\n\nA prova mais segura é revisar esta wallet, ativar a trustline USDC exata, revisar um depósito de 1 XLM na DeFindex, autorizar a assinatura e verificar o recibo no Stellar Expert. A Mainnet está desativada.`, startProof: "Iniciar prova Testnet", showWallet: "Mostrar minha wallet",
    noWallet: "Sua identidade Privy está conectada, mas ainda não existe um registro persistente da wallet Stellar. Reabra o workspace para concluir o onboarding seguro.",
    wallet: (network: string, address: string, balance: string) => `Sua wallet ativa está na **${network}**.\n\nEndereço: ${address}\n\nSaldo XLM atual: **${balance}**.\n\nPosso preparar intents na Testnet com este endereço, mas não posso assinar ou enviar um pagamento sem sua autorização explícita.`, explore: "Explorar DeFindex", preparePayment: "Preparar pagamento de teste",
    connectIntro: "Posso conectar um serviço por uma sequência segura: descobrir sua interface real, identificar credenciais, preparar um teste reversível, solicitar autorização e preservar evidências. Escolha um piloto ativo.",
    help: "Posso revisar seu contexto Stellar Testnet, preparar integrações, pesquisar serviços conectados somente para leitura, criar intents controlados e orientar aprovações. A wallet e a validação on-chain são reais; execução de parceiros e pagamentos permanecem bloqueados até cada conector ser validado.", exploreConnections: "Explorar conexões", connectNotionShort: "Conectar Notion", searchTravel: "Pesquisar viagens",
    fallback: "Entendo o objetivo, mas preciso de um destino concreto para preparar uma ação segura. Diga o que você quer conectar, descobrir, reservar ou pagar, ou escolha um ponto de partida.", connectDefindex: "Conectar DeFindex", connectUnblck: "Conectar UNBLCK", exploreTravel: "Explorar viagens",
  },
};

export function findRequestedConnection(message: string) {
  const query = normalized(message);
  for (const connection of connections) {
    const terms = aliases[connection.name] ?? [connection.name];
    if (terms.some((term) => query.includes(normalized(term)))) return connection;
  }
  return null;
}

function connectionReply(connection: Connection, context: AgentChatContext, language: AgentLanguage): AgentChatReply {
  const t = text[language];
  const isConnected = connection.name === "Notion MCP" && context.connectedProviders?.includes("notion");
  const effectiveStage: Connection["stage"] = isConnected ? "Connected" : connection.stage;
  const visibleStage = stageLabels[language][effectiveStage] ?? effectiveStage;
  const details = isConnected ? t.connectedAuth : language === "en" ? `${connection.proof}\n\nNext step: ${connection.nextAction}` : t.planning;
  const safeBoundary = effectiveStage === "Connected" || effectiveStage === "Read-only connected" ? t.safeConnected : t.safePending;
  const messages = {
    en: { notionSearch: "Search my Notion workspace for pending project tasks", xlm: "What is the current XLM price on CoinMarketCap?", watchlist: "Show my crypto watchlist", plan: `Prepare the safest first test for ${connection.name}`, missing: `What credentials, permissions and proof are missing for ${connection.name}?` },
    es: { notionSearch: "Busca en mi Notion las tareas pendientes", xlm: "¿Cuál es el precio actual de XLM en CoinMarketCap?", watchlist: "Muéstrame mi watchlist de criptomonedas", plan: `Prepara la primera prueba segura para ${connection.name}`, missing: `¿Qué credenciales, permisos y evidencias faltan para ${connection.name}?` },
    pt: { notionSearch: "Pesquise no meu Notion as tarefas pendentes", xlm: "Qual é o preço atual do XLM no CoinMarketCap?", watchlist: "Mostre minha watchlist de criptomoedas", plan: `Prepare o primeiro teste seguro para ${connection.name}`, missing: `Quais credenciais, permissões e evidências faltam para ${connection.name}?` },
  }[language];

  if (connection.name === "UNBLCK / Tellus Hub") {
    const copy = {
      en: {
        start: "UNBLCK now has an official Agent API. Generate a Connect code in the member hub, then send: `Connect UNBLCK code ABC123XY telegram 123456789`. The API currently accepts Telegram or WhatsApp identities.",
        open: "Generate Connect code",
      },
      es: {
        start: "UNBLCK ya tiene una Agent API oficial. Genera un Connect code en el hub y luego env\u00eda: `Conecta UNBLCK c\u00f3digo ABC123XY telegram 123456789`. La API actualmente acepta identidades de Telegram o WhatsApp.",
        open: "Generar Connect code",
      },
      pt: {
        start: "A UNBLCK agora possui uma Agent API oficial. Gere um Connect code no hub e envie: `Conecta UNBLCK c\u00f3digo ABC123XY telegram 123456789`. A API aceita identidades Telegram ou WhatsApp.",
        open: "Gerar Connect code",
      },
    }[language];

    return {
      content: copy.start,
      connection: { name: connection.name, stage: "Ready to test", priority: connection.priority },
      actions: [{ label: copy.open, href: "https://www.unblck.cl/member/hub/connect" }],
    };
  }

  return {
    content: `${connection.name} ${t.current} **${visibleStage}** (${connection.priority}).\n\n${details}\n\n${safeBoundary}`,
    connection: { name: connection.name, stage: effectiveStage, priority: connection.priority },
    actions: [
      ...(connection.name === "Notion MCP" && !isConnected ? [{ label: t.connectNotion, connect: "notion" }] : []),
      ...(connection.name === "Notion MCP" && isConnected ? [{ label: t.searchNotion, message: messages.notionSearch }] : connection.name === "CoinMarketCap Agent Hub" ? [{ label: t.checkXlm, message: messages.xlm }, { label: t.showWatchlist, message: messages.watchlist }] : [{ label: `${t.preparePlan}: ${connection.name}`, message: messages.plan }]),
      { label: t.missing, message: messages.missing },
      { label: t.source, href: connection.href },
    ],
  };
}

export function buildAgentReply(message: string, context: AgentChatContext = {}): AgentChatReply {
  const query = normalized(message);
  const language = detectAgentLanguage(message);
  const t = text[language];
  const connection = findRequestedConnection(message);
  const defindexIntent = parseDefindexIntent(message);
  const avalancheIntent = parseAvalancheChatIntent(message);

  if (avalancheIntent) {
    const labels = {
      en: { activate: "Activate Fuji", status: "Check Fuji wallet", fund: "Receive 0.005 Test AVAX", send: "Review and approve 0.001 AVAX", x402: "Review the 0.01 USDC x402 payment", swap: "Swap AVAX for USDC" },
      es: { activate: "Activar Fuji", status: "Revisar wallet Fuji", fund: "Recibir 0.005 AVAX de prueba", send: "Revisar y aprobar 0.001 AVAX", x402: "Revisar el pago x402 de 0.01 USDC", swap: "Cambiar AVAX por USDC" },
      pt: { activate: "Ativar Fuji", status: "Verificar wallet Fuji", fund: "Receber 0.005 AVAX de teste", send: "Revisar e aprovar 0.001 AVAX", x402: "Revisar o pagamento x402 de 0.01 USDC", swap: "Trocar AVAX por USDC" },
    }[language];
    const content = {
      activate: {
        en: "Avalanche Fuji is the EVM test network (chain 43113). Activation creates or recovers your user-owned Privy EVM wallet; it moves no funds and signs no transaction.",
        es: "Avalanche Fuji es la red EVM de prueba (chain 43113). La activación crea o recupera tu wallet EVM de Privy bajo tu propiedad; no mueve fondos ni firma transacciones.",
        pt: "Avalanche Fuji é a rede EVM de teste (chain 43113). A ativação cria ou recupera sua wallet EVM da Privy sob sua propriedade; não move fundos nem assina transações.",
      },
      status: {
        en: "I can verify your Fuji wallet, live AVAX balance, nonce and explorer evidence without requesting a signature.",
        es: "Puedo verificar tu wallet Fuji, saldo AVAX, nonce y evidencia del explorador sin solicitar una firma.",
        pt: "Posso verificar sua wallet Fuji, saldo AVAX, nonce e evidência do explorer sem solicitar assinatura.",
      },
      fund: {
        en: "Test funding is limited to 0.005 AVAX once per user. Automatic distribution remains disabled unless the server-side distributor, rate limit and secret are configured; the official faucet remains available.",
        es: "El fondeo de prueba está limitado a 0.005 AVAX una vez por usuario. La distribución automática permanece deshabilitada hasta configurar el distribuidor, límite y secreto del servidor; el faucet oficial sigue disponible.",
        pt: "O funding de teste é limitado a 0.005 AVAX uma vez por usuário. A distribuição automática permanece desativada até configurar distribuidor, limite e segredo do servidor; o faucet oficial segue disponível.",
      },
      send: {
        en: `I will freeze a 0.001 AVAX Fuji transfer to ${avalancheIntent.operation === "send" ? avalancheIntent.destination : "the selected wallet"}. The in-chat card will show the exact nonce, value and maximum gas before Privy asks for transaction-specific approval.`,
        es: `Congelaré una transferencia de 0.001 AVAX en Fuji hacia ${avalancheIntent.operation === "send" ? avalancheIntent.destination : "la wallet elegida"}. La tarjeta del chat mostrará nonce, valor y gas máximo exactos antes de que Privy solicite aprobación específica.`,
        pt: `Vou congelar uma transferência de 0.001 AVAX na Fuji para ${avalancheIntent.operation === "send" ? avalancheIntent.destination : "a wallet escolhida"}. O cartão no chat mostrará nonce, valor e gas máximo exatos antes da aprovação específica da Privy.`,
      },
      x402: {
        en: "The readiness report is a paid resource: exactly 0.01 USDC on Fuji over x402 v2. I freeze the recipient, amount, nonce and expiry first; Privy then asks you to sign that exact authorization once, and the report is delivered only after the facilitator settles it.",
        es: "El reporte de readiness es un recurso pago: exactamente 0.01 USDC en Fuji vía x402 v2. Primero congelo destinatario, monto, nonce y expiración; luego Privy te pide firmar esa autorización exacta una sola vez, y el reporte se entrega solo después de que el facilitador la liquide.",
        pt: "O relatório de readiness é um recurso pago: exatamente 0.01 USDC na Fuji via x402 v2. Primeiro congelo destinatário, valor, nonce e expiração; depois a Privy pede que você assine essa autorização exata uma única vez, e o relatório é entregue apenas após o facilitador liquidá-la.",
      },
      swap: {
        en: "I will freeze a 0.1 AVAX → USDC swap on Pangolin Fuji using the live route and quote. The in-chat card will show the current USDC/AVAX price and the minimum USDC you receive before Privy asks for a single transaction-specific signature. Because you swap native AVAX, no token approvals are needed.",
        es: "Congelaré un swap de 0.1 AVAX → USDC en Pangolin Fuji usando la ruta y cotización en vivo. La tarjeta del chat mostrará el precio USDC/AVAX actual y el mínimo de USDC que recibirás antes de que Privy solicite una única firma específica. Como cambias AVAX nativo, no se requieren approvals de tokens.",
        pt: "Vou congelar um swap de 0.1 AVAX → USDC na Pangolin Fuji usando a rota e cotação ao vivo. O cartão no chat mostrará o preço atual de USDC/AVAX e o mínimo de USDC que você receberá antes de a Privy solicitar uma única assinatura específica. Como você troca AVAX nativo, não são necessários approvals de tokens.",
      },
    }[avalancheIntent.operation][language];
    return {
      content,
      actions: [{
        label: labels[avalancheIntent.operation],
        walletAction: {
          type: `avalanche.${avalancheIntent.operation}`,
          network: "avalanche:fuji",
          ...(avalancheIntent.operation === "send" ? {
            amount: avalancheIntent.amount,
            destination: avalancheIntent.destination,
          } : {}),
          ...(avalancheIntent.operation === "swap" ? {
            amountInAtomic: avalancheIntent.amountInAtomic,
          } : {}),
        },
      }],
    };
  }

  const ecosystemReadIntent = parseAvalancheEcosystemReadIntent(message);
  if (ecosystemReadIntent) {
    const labels = {
      en: { predictions: "Prediction-market data", aave: "Aave V3 Fuji state", nft: "Fuji NFT read", yields: "Avalanche yields", lfj: "LFJ liveness check" },
      es: { predictions: "Datos de mercados de predicción", aave: "Estado Aave V3 Fuji", nft: "Lectura NFT Fuji", yields: "Rendimientos Avalanche", lfj: "Chequeo de liveness LFJ" },
      pt: { predictions: "Dados de mercados de previsão", aave: "Estado Aave V3 Fuji", nft: "Leitura NFT Fuji", yields: "Rendimentos Avalanche", lfj: "Verificação de liveness LFJ" },
    }[language];
    const copy = {
      en: "I will run a keyless, read-only check of the live source or the Fuji chain and show you the verified result. Nothing will be signed, approved or moved.",
      es: "Ejecutaré una verificación sin API key, de solo lectura, contra la fuente viva o la cadena Fuji, y te mostraré el resultado verificado. Nada se firmará, aprobará ni moverá.",
      pt: "Vou executar uma verificação sem API key, somente leitura, contra a fonte viva ou a cadeia Fuji, e mostrar o resultado verificado. Nada será assinado, aprovado ou movimentado.",
    }[language];
    return {
      content: copy,
      actions: [{
        label: labels[ecosystemReadIntent.operation.startsWith("predictions")
          ? "predictions"
          : ecosystemReadIntent.operation.startsWith("aave")
            ? "aave"
            : ecosystemReadIntent.operation.startsWith("nft")
              ? "nft"
              : ecosystemReadIntent.operation.startsWith("defillama")
                ? "yields"
                : "lfj"],
        message,
      }],
    };
  }

  if (defindexIntent) {
    if (!context.wallet) {
      return {
        content: t.walletPending,
        actions: [{ label: t.retryWallet, message: language === "pt" ? "Tente configurar minha wallet Stellar novamente" : language === "es" ? "Reintenta configurar mi wallet Stellar" : "Retry my Stellar wallet setup" }],
      };
    }
    const content = defindexIntent.operation === "usdc_trustline"
      ? {
          en: "I will prepare and simulate the exact **DeFindex USDC trustline** on Stellar Testnet. Nothing will be signed or submitted yet. Review the transaction card, then use the Privy confirmation button if every field is correct.",
          es: "Prepararé y simularé la **trustline USDC exacta de DeFindex** en Stellar Testnet. Todavía no se firmará ni enviará nada. Revisa la tarjeta de transacción y utiliza el botón de confirmación de Privy solamente si todos los campos son correctos.",
          pt: "Vou preparar e simular a **trustline USDC exata da DeFindex** na Stellar Testnet. Nada será assinado ou enviado ainda. Revise o cartão da transação e use o botão de confirmação da Privy somente se todos os campos estiverem corretos.",
        }[language]
      : {
          en: `I will prepare and simulate a **${defindexIntent.amount} ${defindexIntent.asset} DeFindex deposit** on Stellar Testnet. Nothing will be signed or submitted yet. Review the exact destination and amount, then confirm with Privy.`,
          es: `Prepararé y simularé un **depósito de ${defindexIntent.amount} ${defindexIntent.asset} en DeFindex** sobre Stellar Testnet. Todavía no se firmará ni enviará nada. Revisa el destino y el monto exactos y luego confirma con Privy.`,
          pt: `Vou preparar e simular um **depósito de ${defindexIntent.amount} ${defindexIntent.asset} na DeFindex** pela Stellar Testnet. Nada será assinado ou enviado ainda. Revise o destino e o valor exatos e depois confirme com a Privy.`,
        }[language];
    return { content, actions: [], defindexIntent };
  }

  const requestsX402Demo = query.includes("x402") && [
    "demo", "prueba", "probar", "test", "paga", "pagar", "pay", "compra", "comprar", "buy", "teste", "testar",
  ].some((term) => query.includes(term));
  if (requestsX402Demo) {
    if (!context.wallet) return { content: t.walletPending, actions: [{ label: t.retryWallet, message: language === "pt" ? "Tente configurar minha wallet Stellar novamente" : language === "es" ? "Reintenta configurar mi wallet Stellar" : "Retry my Stellar wallet setup" }] };
    return {
      content: {
        en: "I will inspect the official Stellar x402 Testnet challenge and freeze its exact **0.01 USDC** payment requirements. Nothing will be signed or paid until you review the payment and confirm with Privy.",
        es: "Inspeccionaré el desafío oficial x402 de Stellar Testnet y congelaré los requisitos exactos del pago de **0.01 USDC**. No se firmará ni pagará nada hasta que revises el pago y confirmes con Privy.",
        pt: "Vou inspecionar o desafio oficial x402 da Stellar Testnet e congelar os requisitos exatos do pagamento de **0.01 USDC**. Nada será assinado ou pago até você revisar e confirmar com a Privy.",
      }[language],
      actions: [],
      x402Intent: { operation: "demo_payment" },
    };
  }
  if (["testnet", "prueba onchain", "probar onchain", "teste onchain", "testar onchain", "prova onchain"].some((term) => query.includes(term))) {
    if (!context.wallet) return { content: t.walletPending, actions: [{ label: t.retryWallet, message: language === "pt" ? "Tente configurar minha wallet Stellar novamente" : language === "es" ? "Reintenta configurar mi wallet Stellar" : "Retry my Stellar wallet setup" }] };
    return { content: t.testnet(context.wallet.balance ?? (language === "pt" ? "saldo indisponível" : language === "es" ? "saldo no disponible" : "an unavailable")), actions: [{ label: t.startProof, message: language === "pt" ? "Inicie minha prova DeFindex na Testnet" : language === "es" ? "Inicia mi prueba DeFindex en Testnet" : "Start my DeFindex Testnet proof" }, { label: t.showWallet, message: language === "pt" ? "Mostre o saldo da minha wallet" : language === "es" ? "Muestra el saldo de mi wallet" : "Show my wallet balance" }] };
  }

  if (["balance", "saldo", "wallet", "billetera", "carteira"].some((term) => query.includes(term))) {
    if (!context.wallet) return { content: t.noWallet, actions: [{ label: t.retryWallet, message: language === "pt" ? "Tente configurar minha wallet Stellar novamente" : language === "es" ? "Reintenta configurar mi wallet Stellar" : "Retry my Stellar wallet setup" }] };
    const balance = context.wallet.balance ?? (language === "pt" ? "indisponível" : language === "es" ? "no disponible" : "not available");
    return { content: t.wallet(context.wallet.network, context.wallet.address, balance), actions: [{ label: t.explore, message: language === "pt" ? "Conecte-me à DeFindex" : language === "es" ? "Conéctame con DeFindex" : "Connect me to DeFindex" }, { label: t.preparePayment, message: language === "pt" ? "Prepare um pagamento de teste de 1 XLM" : language === "es" ? "Prepara un pago de prueba de 1 XLM" : "Prepare a 1 XLM Testnet payment" }] };
  }

  if (connection) return connectionReply(connection, context, language);

  if (["connect", "conecta", "conecte", "conectar", "integrat", "integrar"].some((term) => query.includes(term))) {
    const languageMessages = language === "pt" ? ["Conecte-me ao Notion", "Conecte-me ao Trello", "Conecte-me ao Google Calendar", "Conecte-me à DeFindex"] : language === "es" ? ["Conéctame con Notion", "Conéctame con Trello", "Conéctame con Google Calendar", "Conéctame con DeFindex"] : ["Connect me to Notion", "Connect me to Trello", "Connect me to Google Calendar", "Connect me to DeFindex"];
    return { content: t.connectIntro, actions: ["Notion", "Trello", "Google Calendar", "DeFindex"].map((label, index) => ({ label, message: languageMessages[index] })) };
  }

  if (["que puedes", "what can", "help", "ayuda", "o que voce", "ajuda", "pode fazer"].some((term) => query.includes(term))) {
    return { content: t.help, actions: [{ label: t.showWallet, message: language === "pt" ? "Mostre o saldo da minha wallet" : language === "es" ? "Muestra el saldo de mi wallet" : "Show my wallet balance" }, { label: t.exploreConnections, message: language === "pt" ? "O que posso conectar?" : language === "es" ? "¿Qué puedo conectar?" : "What can I connect to?" }, { label: t.connectNotionShort, message: language === "pt" ? "Conecte-me ao Notion" : language === "es" ? "Conéctame con Notion" : "Connect me to Notion" }, { label: t.searchTravel, message: language === "pt" ? "Conecte-me à Travala" : language === "es" ? "Conéctame con Travala" : "Connect me to Travala" }] };
  }

  return { content: t.fallback, actions: [{ label: t.connectDefindex, message: language === "pt" ? "Conecte-me à DeFindex" : language === "es" ? "Conéctame con DeFindex" : "Connect me to DeFindex" }, { label: t.connectUnblck, message: language === "pt" ? "Conecte-me à UNBLCK" : language === "es" ? "Conéctame con UNBLCK" : "Connect me to UNBLCK" }, { label: t.exploreTravel, message: language === "pt" ? "Conecte-me à Travala" : language === "es" ? "Conéctame con Travala" : "Connect me to Travala" }, { label: t.showWallet, message: language === "pt" ? "Mostre o saldo da minha wallet" : language === "es" ? "Muestra el saldo de mi wallet" : "Show my wallet balance" }] };
}