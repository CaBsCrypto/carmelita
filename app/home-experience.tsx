"use client";

import Link from "next/link";
import { type ReactNode, useRef } from "react";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./home-experience.module.css";

const copy = {
  es: {
    home: "Inicio de Carmelita", footerNav: "Enlaces de Carmelita", skip: "Ir al contenido", guide: "Guía de conexión", developers: "Desarrolladores",
    title: "Carmelita,", titleEnd: "tu actividad en una conversación.",
    description: "Tu agente personal en ChatGPT. Consulta tus cuentas onchain, actividad reciente en Carmelita y datos de mercado, con los permisos que tú eliges.",
    connect: "Conectar Carmelita con ChatGPT", recommended: "Recomendado", signIn: "Iniciar sesión en Carmelita",
    scope: "Multichain: cinco redes Testnet / Devnet y datos de mercado.",
    example: "Ejemplo ilustrativo · Multichain", stellarExample: "Ejemplo ilustrativo · Stellar Testnet", conversationTitle: "En ChatGPT",
    question: "¿Qué redes de prueba están vinculadas a mi cuenta Carmelita?", answer: "Puedo consultar tus wallets registradas en estas cinco redes de prueba, con cada dirección y su explorador.",
    networksLabel: "Redes del ejemplo",
    explorerHint: "Una identidad, distintas redes. Tú decides qué información compartes.",
    preview: "Ejemplo ilustrativo. Tus datos aparecen después de autorizar. Las wallets de este recorrido usan redes de prueba.",
    benefitsTitle: "Una identidad para tus redes", usageGuide: "Guía de uso",
    benefits: [
      ["Una identidad, varias redes", "Tus wallets vinculadas se mantienen asociadas a la misma cuenta Carmelita."],
      ["Permisos que tú controlas", "Revisa los permisos antes de autorizar el acceso a tu cuenta."],
      ["Contexto en tu conversación", "Pregunta por tus cuentas onchain, actividad reciente y datos de mercado desde ChatGPT."],
    ],
    queriesTitle: "Tus cuentas, con contexto.", queriesIntro: "Explora tus cuentas onchain registradas, actividad reciente en Carmelita y cotizaciones de mercado en la misma conversación.",
    multichainQuestion: "¿Cómo se vinculan mis cuentas entre redes?", multichainDescription: "Una identidad Carmelita, con wallets en cinco redes de prueba. Cada dirección se mantiene vinculada a tu cuenta.",
    multichainReply: "Puedo listar las wallets registradas bajo tu identidad Carmelita:",
    multichainResults: [
      ["Stellar Testnet", "Tu dirección Stellar y su explorador. La activación y el saldo se comprueban por separado."],
      ["Solana Devnet", "Tu dirección Solana, con su propio explorador de red."],
      ["Redes EVM de prueba", "Avalanche Fuji, Base Sepolia y BNB Testnet comparten una dirección. Cada red tiene su propio saldo y explorador."],
    ],
    multichainNote: "El registro de una wallet, la activación en la red y sus saldos son comprobaciones distintas.",
    stellarDetailTitle: "Stellar Testnet, en detalle", stellarQuestion: "¿Está activa mi cuenta Stellar Testnet?",
    stellarDescription: "Pregunta por la cuenta vinculada a tu identidad. Este ejemplo utiliza Stellar Testnet y fondos de prueba.",
    stellarReply: "Puedo revisar estos datos de tu cuenta:",
    stellarResults: [
      ["Tu dirección", "La cuenta Stellar vinculada a tu identidad."],
      ["Activación en la red", "El estado que confirma Stellar Testnet."],
      ["Saldo XLM", "Los fondos de prueba de tu cuenta."],
    ],
    stellarNote: "La cuenta sólo aparece activa tras confirmación de Stellar. Si la red no responde, el estado puede quedar pendiente.",
    marketSources: "Fuentes: CoinGecko (principal) y CoinMarketCap (alternativa).", marketDescription: "Busca activos y consulta su precio sin salir de la conversación.",
    activityExample: "Ejemplo ilustrativo · Actividad en Carmelita", activityQuestion: "Muéstrame mi actividad reciente en Carmelita.", activityDescription: "Revisa eventos recientes registrados en tu cuenta Carmelita.", activityReply: "Tus eventos recientes registrados, con resúmenes y fechas.", activityNote: "La actividad refleja lo que Carmelita ha registrado para ti. Los exploradores permiten consultar más detalles en cada red.",
    marketQuestion: "¿Cuál es el precio de ETH?", marketExample: "Ejemplo ilustrativo · Cotizaciones de mercado", marketReply: "Una cotización en USD, con la fuente y la hora de consulta.", marketNote: "Los precios de activos Mainnet se consultan por separado y no valoran tus fondos Testnet.",
    serviceDescription: "Piloto de consulta de créditos, días disponibles y reservas de una cuenta UNBLCK ya vinculada.", pilot: "Integración piloto", serviceNote: "Validación de acceso pendiente. Requiere una cuenta UNBLCK vinculada.",
    stepsTitle: "Una conexión para empezar a explorar.", stepsIntro: "Añade Carmelita manualmente en ChatGPT y revisa los permisos que autorizas.",
    steps: [
      ["Abre la guía", "Copia la URL de Carmelita y abre la sección de conectores de ChatGPT."],
      ["Añade Carmelita y autoriza", "Crea tu cuenta Carmelita o inicia sesión durante la autorización. Revisa los permisos antes de aceptar."],
      ["Explora desde tu conversación", "Pregunta por tus redes registradas, actividad reciente en Carmelita o una cotización de mercado."],
    ],
    stepsLink: "Abrir la guía paso a paso",
    faqTitle: "Tu cuenta, tus redes, tus permisos.", faqIntro: "Lo que necesitas saber para empezar o proponer un servicio.",
    providerFaq: {
      question: "¿Cómo hago para que mi servicio aparezca en Carmelita?",
      intro: "Envía una propuesta para revisión y prepara una integración piloto:",
      steps: [
        "Completa el formulario con el nombre del servicio, tu correo y la consulta que quieres ofrecer. Puedes incluir documentación pública.",
        "El equipo revisa la propuesta y sus requisitos. Si avanzamos, definimos contigo el alcance del piloto.",
        "Prepara la validación de resultados, permisos, aislamiento de cuentas y errores antes de habilitar la integración.",
      ],
      note: "Enviar una propuesta no publica ni activa tu servicio. La integración debe validarse antes de presentarla como disponible.",
      link: "Proponer mi servicio",
    },
    faqs: [
      ["¿Necesito crear una cuenta Carmelita antes?", "Puedes crear tu cuenta Carmelita o iniciar sesión durante la autorización desde ChatGPT. Si ya tienes cuenta, utiliza la misma identidad para conservar tus wallets."],
      ["¿Funciona con cualquier cuenta de ChatGPT?", "Tu cuenta debe permitir conectores MCP personalizados. La disponibilidad depende de tu cuenta y de las políticas de tu espacio de trabajo. Crear una cuenta ChatGPT no garantiza ese permiso; la guía explica cómo comprobarlo."],
      ["¿Qué redes puedo consultar?", "Puedes consultar tus wallets en Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia y BNB Testnet. Las tres redes EVM comparten una dirección; cada red mantiene su propio saldo y explorador."],
      ["¿Qué aparece en mi actividad?", "Eventos recientes registrados en tu cuenta Carmelita, con resúmenes y fechas. Para consultar más detalles onchain puedes utilizar el explorador de cada red desde tus wallets."],
      ["¿Mis wallets se preparan al conectar?", "La autorización prepara tus wallets para las cinco redes de prueba. Stellar intenta activarse automáticamente con XLM Testnet y sólo aparece activa cuando la red lo confirma. Si la red no responde, la activación puede quedar pendiente. Las otras redes no se financian automáticamente."],
      ["¿Son fondos reales o de prueba?", "Las wallets de este recorrido usan Testnet o Devnet. Sus fondos sirven para pruebas y no se convierten en fondos Mainnet. Los datos de mercado se consultan por separado y no dan valor real a los fondos Testnet. XLM es el activo nativo de Stellar y no necesita una trustline."],
      ["¿Necesito cuentas en todos los proveedores?", "Las consultas de mercado no requieren una cuenta propia en CoinGecko o CoinMarketCap. UNBLCK requiere una cuenta del servicio ya vinculada y la validación del acceso sigue pendiente. Crear tu cuenta Carmelita no conecta automáticamente otros servicios."],
    ],
    development: "Integraciones de aplicaciones · En desarrollo", visionTitle: "Lleva tu servicio a la conversación.",
    vision: "Estamos ampliando la base multichain de Carmelita para conectar aplicaciones y servicios alrededor de una misma identidad.",
    visionStatus: "Cada integración comienza con una propuesta revisada, un piloto y pruebas de permisos, resultados y aislamiento de cuentas. Las compras y la ejecución de servicios necesitan validación antes de ofrecerse.",
    visionLink: "Proponer una integración piloto", footer: "Un agente personal multichain, construido en Latinoamérica.",
    visionFlow: ["Aplicaciones y servicios", "Carmelita", "Tu conversación"], visionFlowLabel: "Visión de integración en desarrollo: aplicaciones y servicios, Carmelita y tu conversación",
    closingTitle: "Tus redes. Tu contexto. Tu agente.", closingDescription: "Conecta Carmelita con ChatGPT y empieza por tus cuentas onchain, actividad reciente o datos de mercado.",
  },
  en: {
    home: "Carmelita home", footerNav: "Carmelita links", skip: "Skip to content", guide: "Connection guide", developers: "Developers",
    title: "Carmelita,", titleEnd: "your activity in one conversation.",
    description: "Your personal agent in ChatGPT. Check your onchain accounts, recent Carmelita activity and market data, with permissions you control.",
    connect: "Connect Carmelita with ChatGPT", recommended: "Recommended", signIn: "Sign in to Carmelita",
    scope: "Multichain: five Testnet / Devnet networks and market data.",
    example: "Illustrative example · Multichain", stellarExample: "Illustrative example · Stellar Testnet", conversationTitle: "In ChatGPT",
    question: "Which test networks are linked to my Carmelita account?", answer: "I can check your registered wallets on these five test networks, with each address and explorer.",
    networksLabel: "Networks in this example",
    explorerHint: "One identity, different networks. You decide what information you share.",
    preview: "Illustrative example. Your data appears after authorization. Wallets in this flow use test networks.",
    benefitsTitle: "One identity across your networks", usageGuide: "User guide",
    benefits: [
      ["One identity, several networks", "Your linked wallets stay associated with the same Carmelita account."],
      ["Permissions you control", "Review the permissions before authorizing access to your account."],
      ["Context in your conversation", "Ask about onchain accounts, recent activity and market data from ChatGPT."],
    ],
    queriesTitle: "Your accounts, with context.", queriesIntro: "Explore your registered onchain accounts, recent Carmelita activity and market quotes in the same conversation.",
    multichainQuestion: "How are my accounts linked across networks?", multichainDescription: "One Carmelita identity, with wallets across five test networks. Each address stays linked to your account.",
    multichainReply: "I can list the wallets registered to your Carmelita identity:",
    multichainResults: [
      ["Stellar Testnet", "Your Stellar address and explorer. Activation and balance are checked separately."],
      ["Solana Devnet", "Your Solana address, with its own network explorer."],
      ["EVM test networks", "Avalanche Fuji, Base Sepolia and BNB Testnet share an address. Each network has its own balance and explorer."],
    ],
    multichainNote: "Wallet registration, network activation and balances are separate checks.",
    stellarDetailTitle: "Stellar Testnet, in detail", stellarQuestion: "Is my Stellar Testnet account active?",
    stellarDescription: "Ask about the account linked to your identity. This example uses Stellar Testnet and test funds.",
    stellarReply: "I can check these details about your account:",
    stellarResults: [
      ["Your address", "The Stellar account linked to your identity."],
      ["Network activation", "The status confirmed by Stellar Testnet."],
      ["XLM balance", "The test funds in your account."],
    ],
    stellarNote: "The account is shown as active only after Stellar confirms it. If the network does not respond, its status may remain pending.",
    marketSources: "Sources: CoinGecko (primary) and CoinMarketCap (alternative).", marketDescription: "Look up assets and check their price within the conversation.",
    activityExample: "Illustrative example · Carmelita activity", activityQuestion: "Show my recent activity in Carmelita.", activityDescription: "Review recent events recorded in your Carmelita account.", activityReply: "Your recent recorded events, with summaries and dates.", activityNote: "Activity reflects what Carmelita has recorded for you. Network explorers provide further onchain details.",
    marketQuestion: "What is the price of ETH?", marketExample: "Illustrative example · Market quotes", marketReply: "A USD quote with its source and query time.", marketNote: "Mainnet asset prices are queried separately and do not value your Testnet funds.",
    serviceDescription: "A pilot for checking credits, open days and bookings for an already linked UNBLCK account.", pilot: "Pilot integration", serviceNote: "Access validation pending. A linked UNBLCK account is required.",
    stepsTitle: "One connection to start exploring.", stepsIntro: "Add Carmelita manually in ChatGPT and review the permissions you grant.",
    steps: [
      ["Open the guide", "Copy Carmelita’s URL and open the connectors section in ChatGPT."],
      ["Add Carmelita and authorize", "Create your Carmelita account or sign in during authorization. Review the permissions before accepting."],
      ["Explore from your conversation", "Ask about your registered networks, recent Carmelita activity or a market quote."],
    ],
    stepsLink: "Open the step-by-step guide",
    faqTitle: "Your account, networks and permissions.", faqIntro: "What you need to get started or propose a service.",
    providerFaq: {
      question: "How can I get my service into Carmelita?",
      intro: "Submit a proposal for review and prepare a pilot integration:",
      steps: [
        "Fill in the form with the service name, your email and the query you want to offer. You may include public documentation.",
        "The team reviews the proposal and its requirements. If we move forward, we define the pilot’s scope with you.",
        "Prepare validation of results, permissions, account isolation and errors before enabling the integration.",
      ],
      note: "Submitting a proposal does not publish or activate your service. The integration must be validated before it is presented as available.",
      link: "Propose my service",
    },
    faqs: [
      ["Do I need a Carmelita account first?", "You can create your Carmelita account or sign in during authorization from ChatGPT. If you already have an account, use the same identity to keep your wallets."],
      ["Does it work with every ChatGPT account?", "Your account must allow custom MCP connectors. Availability depends on your account and workspace policies. Creating a ChatGPT account does not guarantee this permission; the guide explains how to check."],
      ["Which networks can I ask about?", "You can check your wallets on Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia and BNB Testnet. The three EVM networks share an address; each network keeps its own balance and explorer."],
      ["What appears in my activity?", "Recent events recorded in your Carmelita account, with summaries and dates. For further onchain details, open each network’s explorer from your wallet information."],
      ["Are my wallets prepared when I connect?", "Authorization prepares your wallets for the five test networks. Stellar attempts automatic activation with Testnet XLM and is shown as active only after network confirmation. If the network does not respond, activation may remain pending. The other networks are not automatically funded."],
      ["Are these real funds or test funds?", "The wallets in this flow use Testnet or Devnet. Their funds are for testing and do not become Mainnet funds. Market data is queried separately and does not give Testnet funds real value. XLM is Stellar’s native asset and does not need a trustline."],
      ["Do I need accounts with every provider?", "Market queries do not require your own CoinGecko or CoinMarketCap account. UNBLCK requires an already linked service account and access validation is still pending. Creating your Carmelita account does not automatically connect other services."],
    ],
    development: "Application integrations · In development", visionTitle: "Bring your service into the conversation.",
    vision: "We’re expanding Carmelita’s multichain foundation to connect applications and services around one identity.",
    visionStatus: "Each integration starts with a reviewed proposal, a pilot and checks for permissions, results and account isolation. Purchases and service execution need validation before they are offered.",
    visionLink: "Propose a pilot integration", footer: "A multichain personal agent, built in Latin America.",
    visionFlow: ["Applications and services", "Carmelita", "Your conversation"], visionFlowLabel: "Integration vision in development: applications and services, Carmelita and your conversation",
    closingTitle: "Your networks. Your context. Your agent.", closingDescription: "Connect Carmelita with ChatGPT and start with your onchain accounts, recent activity or market data.",
  },
  pt: {
    home: "Início da Carmelita", footerNav: "Links da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de conexão", developers: "Desenvolvedores",
    title: "Carmelita,", titleEnd: "sua atividade em uma conversa.",
    description: "Seu agente pessoal no ChatGPT. Consulte suas contas onchain, atividade recente na Carmelita e dados de mercado, com as permissões que você escolhe.",
    connect: "Conectar a Carmelita ao ChatGPT", recommended: "Recomendado", signIn: "Entrar na Carmelita",
    scope: "Multichain: cinco redes Testnet / Devnet e dados de mercado.",
    example: "Exemplo ilustrativo · Multichain", stellarExample: "Exemplo ilustrativo · Stellar Testnet", conversationTitle: "No ChatGPT",
    question: "Quais redes de teste estão vinculadas à minha conta Carmelita?", answer: "Posso consultar suas carteiras registradas nestas cinco redes de teste, com cada endereço e explorador.",
    networksLabel: "Redes deste exemplo",
    explorerHint: "Uma identidade, diferentes redes. Você decide quais informações compartilha.",
    preview: "Exemplo ilustrativo. Seus dados aparecem após a autorização. As carteiras deste fluxo usam redes de teste.",
    benefitsTitle: "Uma identidade para suas redes", usageGuide: "Guia de uso",
    benefits: [
      ["Uma identidade, várias redes", "Suas carteiras vinculadas permanecem associadas à mesma conta Carmelita."],
      ["Permissões que você controla", "Confira as permissões antes de autorizar o acesso à sua conta."],
      ["Contexto na sua conversa", "Pergunte sobre contas onchain, atividade recente e dados de mercado no ChatGPT."],
    ],
    queriesTitle: "Suas contas, com contexto.", queriesIntro: "Explore suas contas onchain registradas, atividade recente na Carmelita e cotações de mercado na mesma conversa.",
    multichainQuestion: "Como minhas contas estão vinculadas entre redes?", multichainDescription: "Uma identidade Carmelita, com carteiras em cinco redes de teste. Cada endereço permanece vinculado à sua conta.",
    multichainReply: "Posso listar as carteiras registradas na sua identidade Carmelita:",
    multichainResults: [
      ["Stellar Testnet", "Seu endereço Stellar e explorador. A ativação e o saldo são verificados separadamente."],
      ["Solana Devnet", "Seu endereço Solana, com seu próprio explorador de rede."],
      ["Redes EVM de teste", "Avalanche Fuji, Base Sepolia e BNB Testnet compartilham um endereço. Cada rede tem seu próprio saldo e explorador."],
    ],
    multichainNote: "O registro de uma carteira, a ativação na rede e os saldos são verificações distintas.",
    stellarDetailTitle: "Stellar Testnet, em detalhe", stellarQuestion: "Minha conta Stellar Testnet está ativa?",
    stellarDescription: "Pergunte sobre a conta vinculada à sua identidade. Este exemplo usa Stellar Testnet e fundos de teste.",
    stellarReply: "Posso consultar estes dados da sua conta:",
    stellarResults: [
      ["Seu endereço", "A conta Stellar vinculada à sua identidade."],
      ["Ativação na rede", "O estado confirmado pela Stellar Testnet."],
      ["Saldo XLM", "Os fundos de teste da sua conta."],
    ],
    stellarNote: "A conta só aparece ativa após a confirmação da Stellar. Se a rede não responder, o estado pode ficar pendente.",
    marketSources: "Fontes: CoinGecko (principal) e CoinMarketCap (alternativa).", marketDescription: "Busque ativos e consulte seu preço sem sair da conversa.",
    activityExample: "Exemplo ilustrativo · Atividade na Carmelita", activityQuestion: "Mostre minha atividade recente na Carmelita.", activityDescription: "Revise eventos recentes registrados na sua conta Carmelita.", activityReply: "Seus eventos recentes registrados, com resumos e datas.", activityNote: "A atividade reflete o que a Carmelita registrou para você. Os exploradores permitem consultar mais detalhes em cada rede.",
    marketQuestion: "Qual é o preço do ETH?", marketExample: "Exemplo ilustrativo · Cotações de mercado", marketReply: "Uma cotação em USD, com a fonte e a hora da consulta.", marketNote: "Os preços de ativos Mainnet são consultados separadamente e não atribuem valor aos seus fundos Testnet.",
    serviceDescription: "Piloto de consulta de créditos, dias disponíveis e reservas de uma conta UNBLCK já vinculada.", pilot: "Integração piloto", serviceNote: "Validação de acesso pendente. É necessária uma conta UNBLCK vinculada.",
    stepsTitle: "Uma conexão para começar a explorar.", stepsIntro: "Adicione a Carmelita manualmente no ChatGPT e confira as permissões que autoriza.",
    steps: [
      ["Abra o guia", "Copie a URL da Carmelita e abra a seção de conectores do ChatGPT."],
      ["Adicione a Carmelita e autorize", "Crie sua conta Carmelita ou entre durante a autorização. Confira as permissões antes de aceitar."],
      ["Explore na sua conversa", "Pergunte sobre suas redes registradas, atividade recente na Carmelita ou uma cotação de mercado."],
    ],
    stepsLink: "Abrir o guia passo a passo",
    faqTitle: "Sua conta, redes e permissões.", faqIntro: "O que você precisa para começar ou propor um serviço.",
    providerFaq: {
      question: "Como faço para que meu serviço apareça na Carmelita?",
      intro: "Envie uma proposta para revisão e prepare uma integração piloto:",
      steps: [
        "Preencha o formulário com o nome do serviço, seu e-mail e a consulta que quer oferecer. Pode incluir documentação pública.",
        "A equipe revisa a proposta e seus requisitos. Se avançarmos, definimos o escopo do piloto com você.",
        "Prepare a validação de resultados, permissões, isolamento de contas e erros antes de ativar a integração.",
      ],
      note: "Enviar uma proposta não publica nem ativa seu serviço. A integração precisa ser validada antes de ser apresentada como disponível.",
      link: "Propor meu serviço",
    },
    faqs: [
      ["Preciso criar uma conta Carmelita antes?", "Você pode criar sua conta Carmelita ou entrar durante a autorização pelo ChatGPT. Se já tem uma conta, use a mesma identidade para manter suas carteiras."],
      ["Funciona com qualquer conta do ChatGPT?", "Sua conta precisa permitir conectores MCP personalizados. A disponibilidade depende da conta e das políticas do espaço de trabalho. Criar uma conta ChatGPT não garante essa permissão; o guia explica como verificar."],
      ["Quais redes posso consultar?", "Você pode consultar suas carteiras na Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia e BNB Testnet. As três redes EVM compartilham um endereço; cada rede mantém seu próprio saldo e explorador."],
      ["O que aparece na minha atividade?", "Eventos recentes registrados na sua conta Carmelita, com resumos e datas. Para consultar mais detalhes onchain, abra o explorador de cada rede nas informações das suas carteiras."],
      ["Minhas carteiras são preparadas ao conectar?", "A autorização prepara suas carteiras para as cinco redes de teste. A Stellar tenta ativar-se automaticamente com XLM Testnet e só aparece ativa após confirmação da rede. Se a rede não responder, a ativação pode ficar pendente. As demais redes não recebem fundos automaticamente."],
      ["São fundos reais ou de teste?", "As carteiras deste fluxo usam Testnet ou Devnet. Seus fundos servem para testes e não se tornam fundos Mainnet. Dados de mercado são consultados separadamente e não dão valor real aos fundos Testnet. XLM é o ativo nativo da Stellar e não precisa de uma trustline."],
      ["Preciso de contas em todos os provedores?", "As consultas de mercado não exigem uma conta própria na CoinGecko ou CoinMarketCap. A UNBLCK exige uma conta do serviço já vinculada e a validação do acesso segue pendente. Criar sua conta Carmelita não conecta outros serviços automaticamente."],
    ],
    development: "Integrações de aplicativos · Em desenvolvimento", visionTitle: "Leve seu serviço para a conversa.",
    vision: "Estamos ampliando a base multichain da Carmelita para conectar aplicativos e serviços em torno de uma identidade.",
    visionStatus: "Cada integração começa com uma proposta revisada, um piloto e verificações de permissões, resultados e isolamento de contas. Compras e execução de serviços precisam de validação antes de serem oferecidas.",
    visionLink: "Propor uma integração piloto", footer: "Um agente pessoal multichain, criado na América Latina.",
    visionFlow: ["Aplicativos e serviços", "Carmelita", "Sua conversa"], visionFlowLabel: "Visão de integração em desenvolvimento: aplicativos e serviços, Carmelita e sua conversa",
    closingTitle: "Suas redes. Seu contexto. Seu agente.", closingDescription: "Conecte a Carmelita ao ChatGPT e comece por suas contas onchain, atividade recente ou dados de mercado.",
  },
};

const exampleNetworks = ["Stellar Testnet", "Solana Devnet", "Avalanche Fuji", "Base Sepolia", "BNB Testnet"];

function ExplorerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3h7v7m0-7-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

function BenefitIcon({ kind }: { kind: number }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === 0 ? <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></> : kind === 1 ? <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></> : <path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8ZM7 10h10m-10 4h7" />}
    </svg>
  );
}

function QueryExample({ id, caption, question, description, guide, children }: {
  id: string; caption: string; question: string; description: string; guide?: string; children: ReactNode;
}) {
  return (
    <article className={styles.queryCase} aria-labelledby={id}>
      <div className={styles.queryPrompt}>
        <p className={styles.queryCaption}>{caption}</p>
        <h3 id={id}>{question}</h3>
        <p className={styles.queryDescription}>{description}</p>
        {guide && <Link href="/guide#chatgpt" className={styles.textLink}>{guide}</Link>}
      </div>
      <div className={styles.queryResponse}>
        <span className={styles.replyIdentity}>Carmelita</span>
        {children}
      </div>
    </article>
  );
}

export default function HomeExperience() {
  const { locale, setLocale } = useLocale();
  const contentRef = useRef<HTMLElement>(null);
  const t = copy[locale];

  return (
    <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
      <Link className={styles.skipLink} href="/#home-content" prefetch={false} onClick={() => contentRef.current?.focus()}>{t.skip}</Link>
      <nav className={styles.nav} aria-label={t.home}>
        <Link href="/" className={styles.brand} aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.navActions}>
          <Link href="/agent?connect=privy" className={styles.navSignIn}>{t.signIn}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
        </div>
      </nav>
      <section id="home-content" ref={contentRef} className={styles.hero} aria-labelledby="home-title" tabIndex={-1}>
        <div className={styles.intro}>
          <h1 id="home-title">{t.title}<br />{t.titleEnd}</h1>
          <p className={styles.description}>{t.description}</p>
          <div className={styles.actions}>
            <div className={styles.primaryAction}>
              <span id="home-connect-recommendation" className={styles.recommended}>{t.recommended}</span>
              <Link href="/connect-chatgpt" className={styles.primary} aria-describedby="home-connect-recommendation">{t.connect}</Link>
            </div>
            <div className={styles.alternative}>
              <Link href="/agent?connect=privy">{t.signIn}</Link>
            </div>
          </div>
          <p className={styles.scope}><span aria-hidden="true" />{t.scope}</p>
        </div>
        <figure className={styles.demo} aria-label={t.example}>
          <div className={styles.conversationStage}>
          <div className={styles.conversation}>
            <header><BrandLockup /><span>{t.conversationTitle}</span></header>
            <p className={styles.question}>{t.question}</p>
            <div className={styles.response}>
              <span className={styles.replyIdentity}>Carmelita</span>
              <p className={styles.answer}>{t.answer}</p>
              <ul className={styles.networks} aria-label={t.networksLabel}>
                {exampleNetworks.map(network => <li key={network}>{network}</li>)}
              </ul>
              <p className={styles.explorerHint}><ExplorerIcon /><span>{t.explorerHint}</span></p>
            </div>
            <p className={styles.exampleLabel}>{t.example}</p>
          </div>
          </div>
          <figcaption className={styles.previewNote}>
            <p>{t.preview}</p>
          </figcaption>
        </figure>
      </section>
      <section className={styles.benefits} aria-labelledby="home-benefits-title">
        <h2 id="home-benefits-title" className={styles.accessibleTitle}>{t.benefitsTitle}</h2>
        {t.benefits.map(([title, description], index) => (
          <article key={title}>
            <span className={styles.benefitIcon}><BenefitIcon kind={index} /></span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </article>
        ))}
      </section>
      <section className={styles.queries} aria-labelledby="home-queries-title">
        <div className={styles.sectionHeading}>
          <h2 id="home-queries-title">{t.queriesTitle}</h2><p>{t.queriesIntro}</p>
        </div>
        <div className={styles.queryPanel}>
          <QueryExample id="home-multichain-title" caption={t.example} question={t.multichainQuestion} description={t.multichainDescription} guide={t.usageGuide}>
            <p className={styles.queryReply}>{t.multichainReply}</p>
            <dl className={styles.queryResults}>
              {t.multichainResults.map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd></div>)}
            </dl>
            <p className={styles.queryNote}>{t.multichainNote}</p>
            <details className={styles.networkDetail}>
              <summary>{t.stellarDetailTitle}</summary>
              <div>
                <p className={styles.queryCaption}>{t.stellarExample}</p>
                <h4 id="home-stellar-title">{t.stellarQuestion}</h4>
                <p className={styles.queryDescription}>{t.stellarDescription}</p>
                <p className={styles.queryReply}>{t.stellarReply}</p>
                <dl className={styles.queryResults}>
                  {t.stellarResults.map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd></div>)}
                </dl>
                <p className={styles.queryNote}>{t.stellarNote}</p>
              </div>
            </details>
          </QueryExample>
          <QueryExample id="home-activity-title" caption={t.activityExample} question={t.activityQuestion} description={t.activityDescription}>
            <p className={styles.queryReply}>{t.activityReply}</p>
            <p className={styles.queryNote}>{t.activityNote}</p>
          </QueryExample>
          <QueryExample id="home-market-title" caption={t.marketExample} question={t.marketQuestion} description={t.marketDescription}>
            <p className={styles.queryReply}>{t.marketReply}</p>
            <p className={styles.marketSources}>{t.marketSources}</p>
            <p className={styles.queryNote}>{t.marketNote}</p>
          </QueryExample>
        </div>
      </section>
      <section className={styles.steps} aria-labelledby="home-steps-title">
        <div className={styles.sectionHeading}>
          <h2 id="home-steps-title">{t.stepsTitle}</h2><p>{t.stepsIntro}</p>
        </div>
        <ol role="list">
          {t.steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <h3>{title}</h3><p>{description}</p>
            </li>
          ))}
        </ol>
        <Link href="/connect-chatgpt" className={styles.textLink}>{t.stepsLink}</Link>
      </section>
      <section className={styles.vision} aria-labelledby="home-vision-title">
        <div>
          <p className={styles.development}><span aria-hidden="true" />{t.development}</p>
          <h2 id="home-vision-title">{t.visionTitle}</h2>
          <p className={styles.visionIntro}>{t.vision}</p>
          <Link href="/developers#proposal" className={styles.textLink}>{t.visionLink}</Link>
        </div>
        <div className={styles.visionBody}>
          <ul className={styles.visionFlow} role="list" aria-label={t.visionFlowLabel}>
            {t.visionFlow.map((label, index) => (
              <li key={label}>
                <span className={index === 1 ? styles.flowAgent : styles.flowNode}>{label}</span>
                {index < 2 && <span className={styles.flowArrow} aria-hidden="true">→</span>}
              </li>
            ))}
          </ul>
          <p>{t.visionStatus}</p>
          <article className={styles.pilot} aria-labelledby="home-unblck-title">
            <div className={styles.pilotHeading}><h3 id="home-unblck-title">UNBLCK</h3><span className={styles.pilotTag}>{t.pilot}</span></div>
            <p>{t.serviceDescription}</p>
            <p className={styles.pilotNote}>{t.serviceNote}</p>
          </article>
        </div>
      </section>
      <section className={styles.faq} aria-labelledby="home-faq-title">
        <div className={styles.sectionHeading}>
          <h2 id="home-faq-title">{t.faqTitle}</h2><p>{t.faqIntro}</p>
        </div>
        <div className={styles.faqList}>
          {t.faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
          <details id="service-integration-faq">
            <summary>{t.providerFaq.question}</summary>
            <div className={styles.faqAnswer}>
              <p>{t.providerFaq.intro}</p>
              <ol role="list">{t.providerFaq.steps.map(step => <li key={step}>{step}</li>)}</ol>
              <p>{t.providerFaq.note}</p>
              <Link href="/developers#proposal" className={styles.textLink}>{t.providerFaq.link}</Link>
            </div>
          </details>
        </div>
      </section>
      <section className={styles.closing} aria-labelledby="home-closing-title">
        <div><h2 id="home-closing-title">{t.closingTitle}</h2><p>{t.closingDescription}</p></div>
        <div className={styles.closingActions}>
          <span id="home-closing-recommendation" className={styles.recommended}>{t.recommended}</span>
          <Link href="/connect-chatgpt" className={styles.primary} aria-describedby="home-closing-recommendation">{t.connect}</Link>
          <Link href="/agent?connect=privy" className={styles.closingSignIn}>{t.signIn}</Link>
        </div>
      </section>
      <footer className={styles.footer}>
        <div><BrandLockup /><p>{t.footer}</p></div>
        <nav aria-label={t.footerNav}>
          <Link href="/connect-chatgpt">{t.guide}</Link><Link href="/guide">{t.usageGuide}</Link><Link href="/developers">{t.developers}</Link>
        </nav>
      </footer>
    </main>
  );
}
