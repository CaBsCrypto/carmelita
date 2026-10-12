"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useLocale } from "../language-toggle";
import { useConnectionEnvironment } from "../connect-chatgpt/connection-environment";
import PublicPageShell from "../public-page-shell";
import ServiceProposalForm from "../service-proposal-form";
import styles from "../public-pages.module.css";

const docsBase = "https://github.com/CaBsCrypto/carmelita/blob/main/docs/";
const queryExamples = [
  { command: "/consulta personal.wallets {}", tool: "read_personal_wallets" },
  { command: '/consulta offchain.market.quote {"assets":[{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}', tool: "get_market_quotes" },
  { command: '/consulta offchain.defillama.chains {"chains":["Solana","Base","Avalanche"]}', tool: "compare_chains" },
  { command: "/consulta avalanche.aave.market.read {}", tool: "read_avalanche_aave_market_read" },
  { command: "/consulta offchain.capabilities.list {}", tool: "list_capabilities" },
];

const copy = {
  es: {
    kicker: "Para empresas y desarrolladores",
    title: "Propón tu servicio para Carmelita.",
    lede: "Cuéntanos qué ofrece tu servicio y qué podría consultar una persona desde Carmelita. El equipo revisará la propuesta para preparar una integración piloto.",
    development: "Integraciones en desarrollo", prepare: "Proponer mi servicio", try: "Probar Carmelita en ChatGPT",
    routeTitle: "La visión de integración", service: "Tu servicio", serviceText: "API o MCP del proveedor",
    carmelitaText: "Identidad y permisos del usuario", chatgptText: "Una conversación con su agente",
    routeNote: "Puedes enviar una propuesta para revisión. Publicar o activar la integración requiere validación; la ejecución general de servicios sigue en desarrollo.",
    proposalTitle: "Envía tu propuesta.", proposalText: "Tres datos para una primera revisión. No necesitas tener la integración terminada para presentar tu servicio.",
    reviewTitle: "Qué sucede después", reviewSteps: ["Guardamos tu propuesta en la bandeja privada del equipo.", "Revisamos el caso de uso y los requisitos de la integración.", "Si avanzamos, usaremos el correo que indicas para definir contigo el piloto."],
    reviewNote: "Enviar no implica aprobación ni publicación automática. El piloto empieza con una consulta de lectura.",
    pilotTitle: "Un piloto pequeño, un resultado comprobable.",
    pilotText: "Define el contrato antes de ampliar el alcance. La documentación sirve como punto de partida para preparar y revisar la integración.",
    pilotSteps: [
      { title: "Elige una consulta", text: "Define qué dato devuelve tu servicio, qué entrada necesita y cuál es su fuente. Empieza con una API o un MCP oficial y una lectura concreta.", link: "Preparar el análisis de integración", file: "NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md" },
      { title: "Vincula identidad y permisos", text: "Especifica cómo autoriza el usuario y a qué datos puede acceder. Las credenciales se conservan en el servidor y la información privada se vincula al propietario verificado.", link: "Revisar el contrato técnico", file: "developer-guide.md" },
      { title: "Valida el recorrido real", text: "Comprueba resultados, aislamiento, errores y recuperación. Un registro en el catálogo no demuestra que un proveedor esté disponible ni que el servicio pueda ejecutarse.", link: "Consultar la matriz de aceptación", file: "channel-parity-acceptance.md" },
    ],
    inspectTitle: "Qué puedes inspeccionar hoy",
    inspectText: "El MCP personal expone consultas con autorización del usuario. La guía de conexión te permite probar el recorrido demostrado de ChatGPT y wallets propias.",
    endpointTitle: "Agente personal",
    endpointLabel: { production: "Endpoint de producción", qa: "Endpoint de QA", unavailable: "Endpoint no disponible" },
    unavailable: "Este entorno aún no tiene un endpoint MCP configurado. No lo uses para conectar un cliente hasta completar su configuración.",
    endpointText: "La identidad se prepara durante el flujo visible de autorización. Cada consulta toma el propietario del acceso autenticado, sin un selector de otra cuenta.",
    guide: "Abrir la guía de conexión", discovery: "Ver catálogo y contratos MCP",
    readTitle: "Lectura con permisos específicos",
    readText: "agent:read permite consultas de lectura. No autoriza pagos, firmas ni ejecución de servicios. El contexto y las conversaciones requieren sus permisos específicos y el consentimiento correspondiente.",
    sourceText: "Precios y TVL son datos Mainnet. Las wallets del recorrido de conexión son Testnet/Devnet; sus fondos de prueba no se valoran como dinero real.",
    examplesTitle: "Explorar ejemplos de consulta",
    examplesText: "Estos enlaces sólo rellenan un borrador en Carmelita. Revisa el comando y envíalo con tu sesión; abrirlo no crea una autorización ni ejecuta una transacción.",
    exampleTitles: ["Mis wallets", "Precios de SOL, AVAX y BNB", "TVL de redes y capitalización de tokens", "Reservas Aave en Avalanche Fuji", "Catálogo de funciones"],
    tool: "Herramienta MCP", draft: "Abrir borrador", command: "Comando de consulta",
    docsTitle: "Contratos y evidencia, a mano.",
    docsText: "Consulta los parámetros y los límites de cada superficie. El estado de una implementación, la conexión de un usuario y la aceptación real del proveedor son comprobaciones distintas.",
    docs: [
      ["Paridad de canales", "Consultas, fuentes y permisos compartidos.", "channel-parity.md"],
      ["Matriz de aceptación", "Evidencia por canal y pendientes de validación.", "channel-parity-acceptance.md"],
      ["Guía de desarrollo", "Rutas, conectores y manejo de errores.", "developer-guide.md"],
      ["Gateway MCP", "Agente personal, catálogo público y administración.", "mcp-gateway.md"],
    ],
    advanced: "Catálogo público y otras superficies técnicas",
    advancedText: "Estas superficies tienen contratos propios. Consulta su documentación antes de diseñar una integración; la página no ofrece un alta automática de proveedores.",
    publicTitle: "Catálogo público de comercio",
    publicText: "El MCP genérico es distinto del agente personal. search_offers y get_offer leen metadatos públicos; una oferta o una demo no acredita disponibilidad, compra ni ejecución.",
    providerTitle: "Proveedores y productos",
    providerText: "La administración de proveedores utiliza una identidad y permisos separados. Prepara el alcance del piloto y revisa sus requisitos con la documentación.",
    providerDocs: "Documentación de proveedores", integrationDocs: "Análisis de integración de un producto",
    financeTitle: "Documentación financiera Testnet",
    financeText: "Financiación, trustlines y depósitos tienen recorridos propios de revisión y autorización. Quedan fuera del piloto de lectura descrito aquí.",
    financeDocs: "Documentación de DeFindex Testnet",
    errors: "Las respuestas parciales conservan sus errores. Un dato que no se pudo consultar se informa como no disponible, no como cero.",
  },
  en: {
    kicker: "For businesses and developers",
    title: "Propose your service for Carmelita.",
    lede: "Tell us what your service offers and what someone could query through Carmelita. The team will review your proposal to prepare a pilot integration.",
    development: "Integrations in development", prepare: "Propose my service", try: "Try Carmelita in ChatGPT",
    routeTitle: "The integration vision", service: "Your service", serviceText: "The provider's API or MCP",
    carmelitaText: "User identity and permissions", chatgptText: "A conversation with their agent",
    routeNote: "You can submit a proposal for review. Publishing or activating the integration requires validation; general service execution is still in development.",
    proposalTitle: "Submit your proposal.", proposalText: "Three details for an initial review. Your integration does not need to be finished to propose your service.",
    reviewTitle: "What happens next", reviewSteps: ["We save your proposal in the team’s private inbox.", "We review the use case and integration requirements.", "If we move forward, we will use the email you provide to define the pilot with you."],
    reviewNote: "Submitting does not imply approval or automatic publication. The pilot starts with one read query.",
    pilotTitle: "A focused pilot. A verifiable result.",
    pilotText: "Define the contract before expanding the scope. Use the documentation to prepare and review the integration.",
    pilotSteps: [
      { title: "Choose one query", text: "Define the data your service returns, its input and its source. Start with an official API or MCP and one specific read operation.", link: "Prepare the integration analysis", file: "NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md" },
      { title: "Bind identity and permissions", text: "Specify how the user authorizes access and which data they can read. Keep credentials on the server and bind private information to the verified owner.", link: "Review the technical contract", file: "developer-guide.md" },
      { title: "Validate the real flow", text: "Check results, account isolation, errors and recovery. A catalog entry does not prove that a provider is available or that a service can execute.", link: "Read the acceptance matrix", file: "channel-parity-acceptance.md" },
    ],
    inspectTitle: "What you can inspect today",
    inspectText: "The personal MCP exposes queries with user authorization. The connection guide lets you try the demonstrated ChatGPT and personal-wallet flow.",
    endpointTitle: "Personal agent",
    endpointLabel: { production: "Production endpoint", qa: "QA endpoint", unavailable: "Endpoint unavailable" },
    unavailable: "This environment does not have a configured MCP endpoint yet. Complete its configuration before using it to connect a client.",
    endpointText: "Identity is prepared during the visible authorization flow. Each query obtains its owner from authenticated access, without a selector for another account.",
    guide: "Open the connection guide", discovery: "View the MCP catalog and contracts",
    readTitle: "Reads with specific permissions",
    readText: "agent:read allows read queries. It does not authorize payments, signing or service execution. Context and conversations require their own scopes and the corresponding consent.",
    sourceText: "Prices and TVL are Mainnet data. Wallets in the connection flow are Testnet/Devnet; their test funds are not valued as real money.",
    examplesTitle: "Explore query examples",
    examplesText: "These links only fill a draft in Carmelita. Review the command and send it with your session; opening it does not create an authorization or execute a transaction.",
    exampleTitles: ["My wallets", "SOL, AVAX and BNB prices", "Network TVL and token market cap", "Aave reserves on Avalanche Fuji", "Feature catalog"],
    tool: "MCP tool", draft: "Open draft", command: "Query command",
    docsTitle: "Contracts and evidence within reach.",
    docsText: "Check each surface's parameters and boundaries. Implementation status, a user's connection and real provider acceptance are separate checks.",
    docs: [
      ["Channel parity", "Shared queries, sources and permissions.", "channel-parity.md"],
      ["Acceptance matrix", "Evidence by channel and pending validation.", "channel-parity-acceptance.md"],
      ["Developer guide", "Routes, connectors and error handling.", "developer-guide.md"],
      ["MCP gateway", "Personal agent, public catalog and administration.", "mcp-gateway.md"],
    ],
    advanced: "Public catalog and other technical surfaces",
    advancedText: "These surfaces have their own contracts. Read their documentation before designing an integration; this page does not offer automatic provider enrollment.",
    publicTitle: "Public commerce catalog",
    publicText: "The generic MCP differs from the personal agent. search_offers and get_offer read public metadata; an offer or demo does not establish availability, purchase or execution.",
    providerTitle: "Providers and products",
    providerText: "Provider administration uses a separate identity and permissions. Prepare your pilot's scope and review its requirements in the documentation.",
    providerDocs: "Provider documentation", integrationDocs: "Product integration analysis",
    financeTitle: "Testnet financial documentation",
    financeText: "Funding, trustlines and deposits have their own review and authorization flows. They are outside the read pilot described here.",
    financeDocs: "DeFindex Testnet documentation",
    errors: "Partial responses preserve their errors. Data that could not be queried is reported as unavailable, not as zero.",
  },
  pt: {
    kicker: "Para empresas e desenvolvedores",
    title: "Proponha seu serviço para a Carmelita.",
    lede: "Conte o que seu serviço oferece e o que alguém poderia consultar pela Carmelita. A equipe revisará a proposta para preparar uma integração piloto.",
    development: "Integrações em desenvolvimento", prepare: "Propor meu serviço", try: "Experimentar Carmelita no ChatGPT",
    routeTitle: "A visão de integração", service: "Seu serviço", serviceText: "API ou MCP do provedor",
    carmelitaText: "Identidade e permissões do usuário", chatgptText: "Uma conversa com seu agente",
    routeNote: "Pode enviar uma proposta para revisão. Publicar ou ativar a integração exige validação; a execução geral de serviços segue em desenvolvimento.",
    proposalTitle: "Envie sua proposta.", proposalText: "Três informações para uma primeira revisão. Sua integração não precisa estar pronta para apresentar o serviço.",
    reviewTitle: "O que acontece depois", reviewSteps: ["Salvamos sua proposta na caixa de entrada privada da equipe.", "Revisamos o caso de uso e os requisitos da integração.", "Se avançarmos, usaremos o e-mail informado para definir o piloto com você."],
    reviewNote: "O envio não implica aprovação nem publicação automática. O piloto começa com uma consulta de leitura.",
    pilotTitle: "Um piloto pequeno, um resultado verificável.",
    pilotText: "Defina o contrato antes de ampliar o escopo. A documentação serve como ponto de partida para preparar e revisar a integração.",
    pilotSteps: [
      { title: "Escolha uma consulta", text: "Defina o dado que seu serviço retorna, a entrada necessária e sua fonte. Comece com uma API ou um MCP oficial e uma leitura específica.", link: "Preparar a análise de integração", file: "NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md" },
      { title: "Vincule identidade e permissões", text: "Especifique como o usuário autoriza o acesso e quais dados pode consultar. Mantenha as credenciais no servidor e vincule as informações privadas ao proprietário verificado.", link: "Revisar o contrato técnico", file: "developer-guide.md" },
      { title: "Valide o fluxo real", text: "Confira resultados, isolamento de contas, erros e recuperação. Um registro no catálogo não comprova a disponibilidade do provedor nem a execução do serviço.", link: "Consultar a matriz de aceitação", file: "channel-parity-acceptance.md" },
    ],
    inspectTitle: "O que você pode inspecionar hoje",
    inspectText: "O MCP pessoal expõe consultas com autorização do usuário. O guia de conexão permite testar o fluxo demonstrado de ChatGPT e carteiras próprias.",
    endpointTitle: "Agente pessoal",
    endpointLabel: { production: "Endpoint de produção", qa: "Endpoint de QA", unavailable: "Endpoint indisponível" },
    unavailable: "Este ambiente ainda não tem um endpoint MCP configurado. Conclua sua configuração antes de usá-lo para conectar um cliente.",
    endpointText: "A identidade é preparada durante o fluxo visível de autorização. Cada consulta obtém o proprietário pelo acesso autenticado, sem um seletor de outra conta.",
    guide: "Abrir o guia de conexão", discovery: "Ver catálogo e contratos MCP",
    readTitle: "Leituras com permissões específicas",
    readText: "agent:read permite consultas de leitura. Não autoriza pagamentos, assinaturas nem execução de serviços. Contexto e conversas exigem seus próprios escopos e o consentimento correspondente.",
    sourceText: "Preços e TVL são dados Mainnet. As carteiras do fluxo de conexão são Testnet/Devnet; seus fundos de teste não são avaliados como dinheiro real.",
    examplesTitle: "Explorar exemplos de consulta",
    examplesText: "Estes links apenas preenchem um rascunho na Carmelita. Revise o comando e envie com sua sessão; abri-lo não cria uma autorização nem executa uma transação.",
    exampleTitles: ["Minhas carteiras", "Preços de SOL, AVAX e BNB", "TVL de redes e capitalização de tokens", "Reservas Aave na Avalanche Fuji", "Catálogo de funções"],
    tool: "Ferramenta MCP", draft: "Abrir rascunho", command: "Comando de consulta",
    docsTitle: "Contratos e evidências ao alcance.",
    docsText: "Confira os parâmetros e limites de cada superfície. O estado da implementação, a conexão de um usuário e a aceitação real do provedor são verificações distintas.",
    docs: [
      ["Paridade de canais", "Consultas, fontes e permissões compartilhadas.", "channel-parity.md"],
      ["Matriz de aceitação", "Evidências por canal e validações pendentes.", "channel-parity-acceptance.md"],
      ["Guia de desenvolvimento", "Rotas, conectores e tratamento de erros.", "developer-guide.md"],
      ["Gateway MCP", "Agente pessoal, catálogo público e administração.", "mcp-gateway.md"],
    ],
    advanced: "Catálogo público e outras superfícies técnicas",
    advancedText: "Estas superfícies têm contratos próprios. Consulte a documentação antes de projetar uma integração; esta página não oferece cadastro automático de provedores.",
    publicTitle: "Catálogo público de comércio",
    publicText: "O MCP genérico é diferente do agente pessoal. search_offers e get_offer leem metadados públicos; uma oferta ou demo não comprova disponibilidade, compra nem execução.",
    providerTitle: "Provedores e produtos",
    providerText: "A administração de provedores usa identidade e permissões separadas. Prepare o escopo do piloto e confira seus requisitos na documentação.",
    providerDocs: "Documentação de provedores", integrationDocs: "Análise de integração de um produto",
    financeTitle: "Documentação financeira Testnet",
    financeText: "Financiamento, trustlines e depósitos têm fluxos próprios de revisão e autorização. Ficam fora do piloto de leitura descrito aqui.",
    financeDocs: "Documentação de DeFindex Testnet",
    errors: "Respostas parciais mantêm seus erros. Um dado que não pôde ser consultado é informado como indisponível, não como zero.",
  },
};

export default function DeveloperPortal() {
  const { locale, setLocale } = useLocale();
  const { mcpUrl, environment } = useConnectionEnvironment();
  const examplesRef = useRef<HTMLDetailsElement>(null);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const providerRef = useRef<HTMLElement>(null);
  const productRef = useRef<HTMLAnchorElement>(null);
  const pilotRef = useRef<HTMLElement>(null);
  const proposalRef = useRef<HTMLElement>(null);
  const publicEndpoint = mcpUrl ? new URL("/api/mcp", mcpUrl).href : null;
  const t = copy[locale];

  useEffect(() => {
    let frame: number | null = null;
    const revealAnchor = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      let disclosure: HTMLDetailsElement | null = null;
      let target: HTMLElement | null = null;
      if (window.location.hash === "#quickstart") {
        disclosure = examplesRef.current;
        target = examplesRef.current;
      } else if (window.location.hash === "#provider") {
        disclosure = advancedRef.current;
        target = providerRef.current;
      } else if (window.location.hash === "#connect-product") {
        disclosure = advancedRef.current;
        target = productRef.current;
      }
      if (!disclosure || !target) return;
      disclosure.open = true;
      const anchorTarget = target;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (anchorTarget.isConnected) anchorTarget.scrollIntoView({ block: "start" });
      });
    };
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    return () => {
      window.removeEventListener("hashchange", revealAnchor);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <PublicPageShell locale={locale} onLocaleChange={setLocale} active="developers">
      <header className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.kicker}>{t.kicker}</p>
          <h1 className={styles.heroTitle}>{t.title}</h1>
          <p className={styles.lede}>{t.lede}</p>
          <span className={styles.badge}>{t.development}</span>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/developers#proposal" prefetch={false} onClick={() => proposalRef.current?.focus()}>{t.prepare}</Link>
            <Link className={styles.secondary} href="/connect-chatgpt">{t.try}</Link>
          </div>
        </div>
        <aside className={styles.heroAside} aria-labelledby="integration-vision">
          <div className={styles.visualCard}>
            <h2 id="integration-vision">{t.routeTitle}</h2>
            <ol className={styles.integrationRoute} role="list" aria-labelledby="integration-vision">
              <li className={styles.routeNode}><h3>{t.service}</h3><p>{t.serviceText}</p></li>
              <li className={styles.routeConnector} aria-hidden="true">↓</li>
              <li className={`${styles.routeNode} ${styles.routeCore}`}><h3>Carmelita</h3><p>{t.carmelitaText}</p></li>
              <li className={styles.routeConnector} aria-hidden="true">↓</li>
              <li className={styles.routeNode}><h3>ChatGPT</h3><p>{t.chatgptText}</p></li>
            </ol>
            <p className={styles.muted}>{t.routeNote}</p>
          </div>
        </aside>
      </header>

      <section className={styles.section} id="proposal" ref={proposalRef} tabIndex={-1} aria-labelledby="proposal-title">
        <header className={styles.sectionHead}><h2 id="proposal-title">{t.proposalTitle}</h2><p>{t.proposalText}</p></header>
        <div className={styles.proposalLayout}>
          <aside className={styles.proposalReview} aria-labelledby="proposal-review-title">
            <h3 id="proposal-review-title">{t.reviewTitle}</h3>
            <ol role="list">{t.reviewSteps.map(step => <li key={step}>{step}</li>)}</ol>
            <p>{t.reviewNote}</p>
          </aside>
          <ServiceProposalForm locale={locale} />
        </div>
      </section>

      <section className={styles.section} id="pilot" ref={pilotRef} tabIndex={-1} aria-labelledby="pilot-title">
        <header className={styles.sectionHead}><h2 id="pilot-title">{t.pilotTitle}</h2><p>{t.pilotText}</p></header>
        <ol className={styles.steps} role="list">
          {t.pilotSteps.map((step, index) => (
            <li key={step.file}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div className={styles.stepBody}>
                <h3>{step.title}</h3><p>{step.text}</p>
                <a className={styles.textLink} href={docsBase + step.file} target="_blank" rel="noreferrer">{step.link}</a>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} id="personal-mcp" aria-labelledby="inspect-title">
        <header className={styles.sectionHead}><h2 id="inspect-title">{t.inspectTitle}</h2><p>{t.inspectText}</p></header>
        <div className={styles.columns}>
          <article className={styles.panel}>
            <h3 className={styles.panelTitle}>{t.endpointTitle}</h3><p>{t.endpointText}</p>
            <p className={styles.muted}>{t.endpointLabel[environment]}</p>
            {mcpUrl ? <pre className={styles.codeBlock}><code>{mcpUrl}</code></pre> : <p className={styles.notice}>{t.unavailable}</p>}
            <div className={styles.inlineLinks}>
              <Link className={styles.textLink} href="/connect-chatgpt">{t.guide}</Link>
              <a className={styles.textLink} href="/.well-known/mcp" target="_blank" rel="noreferrer">{t.discovery}</a>
            </div>
          </article>
          <article className={styles.panel}>
            <h3 className={styles.panelTitle}>{t.readTitle}</h3><p>{t.readText}</p><p className={styles.muted}>{t.sourceText}</p>
          </article>
        </div>
        <details ref={examplesRef} className={styles.disclosure} id="quickstart">
          <summary>{t.examplesTitle}</summary><p>{t.examplesText}</p>
          <div className={styles.columns}>
            {queryExamples.map(({ command, tool }, index) => (
              <article className={styles.panel} key={command}>
                <h3 className={styles.panelTitle}>{t.exampleTitles[index]}</h3>
                <p className={styles.muted}>{t.tool}: <code className={styles.codeInline}>{tool}</code></p>
                <p className={styles.muted}>{t.command}</p>
                <pre className={styles.codeBlock}><code>{command}</code></pre>
                <Link className={styles.textLink} href={"/agent?draft=" + encodeURIComponent(command)}>{t.draft}</Link>
              </article>
            ))}
          </div>
        </details>
      </section>

      <section className={styles.section} aria-labelledby="contracts-title">
        <header className={styles.sectionHead}><h2 id="contracts-title">{t.docsTitle}</h2><p>{t.docsText}</p></header>
        <div className={styles.columns}>
          {t.docs.map(([title, description, file]) => (
            <article className={styles.panel} key={file}>
              <h3 className={styles.panelTitle}><a className={styles.textLink} href={docsBase + file} target="_blank" rel="noreferrer">{title}</a></h3><p>{description}</p>
            </article>
          ))}
        </div>
        <p className={styles.notice}>{t.errors}</p>
        <details ref={advancedRef} className={styles.disclosure}>
          <summary>{t.advanced}</summary><p>{t.advancedText}</p>
          <div className={styles.columns}>
            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>{t.publicTitle}</h3><p>{t.publicText}</p>
              {publicEndpoint ? <pre className={styles.codeBlock}><code>{publicEndpoint}</code></pre> : <p className={styles.notice}>{t.unavailable}</p>}
            </section>
            <section ref={providerRef} className={styles.panel} id="provider">
              <h3 className={styles.panelTitle}>{t.providerTitle}</h3><p>{t.providerText}</p>
              <div className={styles.inlineLinks}>
                <a className={styles.textLink} href={docsBase + "business-onboarding.md"} target="_blank" rel="noreferrer">{t.providerDocs}</a>
                <a ref={productRef} className={styles.textLink} id="connect-product" href={docsBase + "NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md"} target="_blank" rel="noreferrer">{t.integrationDocs}</a>
              </div>
            </section>
            <section className={styles.panel}>
              <h3 className={styles.panelTitle}>{t.financeTitle}</h3><p>{t.financeText}</p>
              <a className={styles.textLink} href={docsBase + "defindex-testnet.md"} target="_blank" rel="noreferrer">{t.financeDocs}</a>
            </section>
          </div>
        </details>
      </section>
    </PublicPageShell>
  );
}
