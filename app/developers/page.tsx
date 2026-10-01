"use client";

import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";

const personalEndpoint = "https://carmelita.browns.studio/api/mcp/agent";
const publicEndpoint = "https://carmelita.browns.studio/api/mcp";

const queryExamples = [
  { command: "/consulta personal.wallets {}", tool: "read_personal_wallets" },
  { command: '/consulta offchain.market.quote {"assets":[{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}', tool: "get_market_quotes" },
  { command: '/consulta offchain.defillama.chains {"chains":["Solana","Base","Avalanche"]}', tool: "compare_chains" },
  { command: "/consulta avalanche.aave.market.read {}", tool: "read_avalanche_aave_market_read" },
  { command: "/consulta offchain.capabilities.list {}", tool: "list_capabilities" },
];

const docsBase = "https://github.com/CaBsCrypto/carmelita/blob/main/docs/";
const copy = {
  es: {
    home: "Inicio", guide: "Guía", chat: "Abrir chat", eyebrow: "DESARROLLADORES",
    title: "Las mismas consultas, en dos canales.",
    lede: "Prueba los comandos en Carmelita y consulta sus contratos MCP. Ambos adaptadores utilizan el registro compartido de lecturas.",
    badges: ["Consultas de sólo lectura", "Billeteras Testnet", "Mercado Mainnet"],
    quickEyebrow: "COMIENZA CON UNA CONSULTA",
    quickTitle: "Revisa el comando antes de enviarlo.",
    quickText: "Estos ejemplos sólo rellenan el compositor. Requieren tu sesión de Carmelita y no crean billeteras, autorizaciones ni transacciones.",
    exampleTitles: ["Mis billeteras", "Precios de SOL, AVAX y BNB", "TVL de redes y capitalización de sus tokens", "Reservas Aave en Avalanche Fuji", "Catálogo de funciones"],
    draft: "Abrir como borrador", tool: "Herramienta MCP", contract: "Ver comando",
    catalog: "Ver catálogo y contratos", acceptance: "Ver matriz de aceptación",
    mcpEyebrow: "MCP PERSONAL", mcpTitle: "Conecta la misma identidad.",
    mcpText: "El complemento de ChatGPT y los clientes compatibles utilizan este endpoint autenticado. Completa el consentimiento por el flujo visible de Carmelita; no pegues tokens en el chat.",
    mcpSteps: ["Ingresa en Carmelita con la cuenta que quieras consultar.", "En tu cliente compatible, conecta el MCP personal y revisa los permisos solicitados.", "Descubre las herramientas y ejecuta una lectura. El propietario se obtiene de la autorización; no se envía un selector de propietario."],
    permissions: "Permisos de lectura",
    permissionsText: "Las nuevas lecturas usan agent:read. El contexto y la conversación conservan agent:context y agent:conversation. Conectar un cliente no amplía estos permisos por sí solo.",
    clientLimit: "La prueba de registro y consultas puede completarse en Carmelita. El acceso desde otro ChatGPT independiente y el vencimiento real de OAuth siguen pendientes; no se acreditan por esta página.",
    statusEyebrow: "DISPONIBILIDAD", statusTitle: "Consulta el estado de cada integración.",
    statusText: "El catálogo distingue la implementación, las conexiones del usuario y la disponibilidad del proveedor. La matriz documenta la aceptación por canal, fecha y versión.",
    statusItems: ["Una herramienta instalada puede tener una conexión o una aceptación pendiente.", "Las respuestas parciales conservan los errores. Un dato ausente es «No disponible», nunca cero.", "Los precios y el TVL son Mainnet. Los saldos y registros personales siguen Testnet."],
    docsEyebrow: "DOCUMENTACIÓN", docsTitle: "Contratos y evidencia",
    docs: [
      ["Paridad de canales", "Servicios, parámetros, fuentes, permisos y límites del sprint.", "channel-parity.md"],
      ["Aceptación por consulta", "Resultados por canal y pendientes identificados.", "channel-parity-acceptance.md"],
      ["Guía de desarrollo", "Rutas, conectores y manejo de errores.", "developer-guide.md"],
      ["Gateway MCP", "Diferencias entre agente personal, catálogo público y administración.", "mcp-gateway.md"],
    ],
    open: "Abrir documentación",
    advanced: "Integraciones avanzadas y sandbox",
    advancedText: "Estas superficies tienen contratos y permisos propios. Las operaciones financieras, las reservas y la administración de proveedores quedan fuera del recorrido de registro y consultas.",
    publicTitle: "Catálogo público de comercio",
    publicText: "El MCP genérico es distinto del agente personal. search_offers y get_offer leen el catálogo público. Los ejemplos de demostración se etiquetan como demos; no acreditan ofertas publicadas ni un servicio operativo.",
    publicTools: "Lecturas del sandbox",
    providerTitle: "Proveedores e integración de productos",
    providerText: "La administración de proveedores utiliza una identidad y permisos separados. Consulta la documentación antes de preparar una integración; no es un alta automática desde el chat.",
    providerDocs: "Documentación de proveedores", integrationDocs: "Guía para integrar un producto",
    financeTitle: "Documentación financiera Testnet",
    financeText: "La financiación, las trustlines y los depósitos requieren recorridos propios de revisión y autorización. No se ejecutan al abrir los ejemplos de consultas.",
    financeDocs: "Documentación de DeFindex Testnet",
    footer: "Registro y consultas · Chat primero",
  },
  en: {
    home: "Home", guide: "Guide", chat: "Open chat", eyebrow: "DEVELOPERS",
    title: "The same queries, in two channels.",
    lede: "Try commands in Carmelita and inspect their MCP contracts. Both adapters use the shared read-query registry.",
    badges: ["Read-only queries", "Testnet wallets", "Mainnet market data"],
    quickEyebrow: "START WITH A QUERY",
    quickTitle: "Review the command before sending.",
    quickText: "These examples only fill the composer. They require your Carmelita session and do not create wallets, authorizations or transactions.",
    exampleTitles: ["My wallets", "SOL, AVAX and BNB prices", "Network TVL and associated token market cap", "Aave reserves on Avalanche Fuji", "Feature catalog"],
    draft: "Open as draft", tool: "MCP tool", contract: "View command",
    catalog: "View catalog and contracts", acceptance: "View acceptance matrix",
    mcpEyebrow: "PERSONAL MCP", mcpTitle: "Connect the same identity.",
    mcpText: "The ChatGPT connector and compatible clients use this authenticated endpoint. Complete consent through Carmelita's visible flow; do not paste tokens into chat.",
    mcpSteps: ["Sign in to Carmelita with the account you want to query.", "In your compatible client, connect the personal MCP and review the requested permissions.", "Discover tools and run a read query. The owner comes from the authorization; no owner selector is sent."],
    permissions: "Read permissions",
    permissionsText: "New reads use agent:read. Context and conversation retain agent:context and agent:conversation. Connecting a client does not expand these permissions on its own.",
    clientLimit: "Registration and queries can be tested entirely in Carmelita. Access from another independent ChatGPT account and real OAuth expiry remain pending; this page does not establish those checks.",
    statusEyebrow: "AVAILABILITY", statusTitle: "Check each integration's status.",
    statusText: "The catalog separates implementation, user connections and provider availability. The matrix documents acceptance by channel, date and version.",
    statusItems: ["An installed tool may still have a pending connection or acceptance check.", "Partial results preserve errors. Missing data is 'Not available', never zero.", "Prices and TVL are Mainnet. Personal balances and wallet records remain Testnet."],
    docsEyebrow: "DOCUMENTATION", docsTitle: "Contracts and evidence",
    docs: [
      ["Channel parity", "Services, parameters, sources, permissions and sprint boundaries.", "channel-parity.md"],
      ["Query acceptance", "Results by channel and identified pending checks.", "channel-parity-acceptance.md"],
      ["Developer guide", "Routes, connectors and error handling.", "developer-guide.md"],
      ["MCP gateway", "Differences between the personal agent, public catalog and administration.", "mcp-gateway.md"],
    ],
    open: "Open documentation",
    advanced: "Advanced integrations and sandbox",
    advancedText: "These surfaces have their own contracts and permissions. Financial operations, reservations and provider administration are outside the registration and query visit.",
    publicTitle: "Public commerce catalog",
    publicText: "The generic MCP differs from the personal agent. search_offers and get_offer read the public catalog. Demo examples are labeled as demos; they do not establish published offers or an operating service.",
    publicTools: "Sandbox reads",
    providerTitle: "Providers and product integration",
    providerText: "Provider administration uses a separate identity and permissions. Read the documentation before preparing an integration; chat does not enroll providers automatically.",
    providerDocs: "Provider documentation", integrationDocs: "Product integration guide",
    financeTitle: "Testnet financial documentation",
    financeText: "Funding, trustlines and deposits have separate review and authorization flows. Opening query examples does not execute them.",
    financeDocs: "DeFindex Testnet documentation",
    footer: "Registration and queries · Chat first",
  },
  pt: {
    home: "Início", guide: "Guia", chat: "Abrir chat", eyebrow: "DESENVOLVEDORES",
    title: "As mesmas consultas, em dois canais.",
    lede: "Experimente comandos na Carmelita e consulte seus contratos MCP. Os dois adaptadores usam o registro compartilhado de leituras.",
    badges: ["Consultas somente de leitura", "Carteiras Testnet", "Mercado Mainnet"],
    quickEyebrow: "COMECE COM UMA CONSULTA",
    quickTitle: "Revise o comando antes de enviar.",
    quickText: "Estes exemplos apenas preenchem o compositor. Exigem sua sessão da Carmelita e não criam carteiras, autorizações nem transações.",
    exampleTitles: ["Minhas carteiras", "Preços de SOL, AVAX e BNB", "TVL das redes e capitalização dos tokens", "Reservas Aave na Avalanche Fuji", "Catálogo de funções"],
    draft: "Abrir como rascunho", tool: "Ferramenta MCP", contract: "Ver comando",
    catalog: "Ver catálogo e contratos", acceptance: "Ver matriz de aceitação",
    mcpEyebrow: "MCP PESSOAL", mcpTitle: "Conecte a mesma identidade.",
    mcpText: "O complemento do ChatGPT e clientes compatíveis usam este endpoint autenticado. Conclua o consentimento pelo fluxo visível da Carmelita; não cole tokens no chat.",
    mcpSteps: ["Entre na Carmelita com a conta que deseja consultar.", "No seu cliente compatível, conecte o MCP pessoal e confira as permissões solicitadas.", "Descubra as ferramentas e execute uma leitura. O proprietário vem da autorização; nenhum seletor de proprietário é enviado."],
    permissions: "Permissões de leitura",
    permissionsText: "As novas leituras usam agent:read. Contexto e conversa mantêm agent:context e agent:conversation. Conectar um cliente não amplia essas permissões por si só.",
    clientLimit: "O teste de registro e consultas pode ser concluído na Carmelita. O acesso por outro ChatGPT independente e o vencimento real de OAuth continuam pendentes; esta página não comprova esses controles.",
    statusEyebrow: "DISPONIBILIDADE", statusTitle: "Confira o estado de cada integração.",
    statusText: "O catálogo separa implementação, conexões do usuário e disponibilidade do provedor. A matriz documenta a aceitação por canal, data e versão.",
    statusItems: ["Uma ferramenta instalada pode ter conexão ou aceitação pendente.", "Resultados parciais mantêm os erros. Um dado ausente é 'Não disponível', nunca zero.", "Preços e TVL são Mainnet. Saldos e registros pessoais continuam Testnet."],
    docsEyebrow: "DOCUMENTAÇÃO", docsTitle: "Contratos e evidências",
    docs: [
      ["Paridade de canais", "Serviços, parâmetros, fontes, permissões e limites do sprint.", "channel-parity.md"],
      ["Aceitação por consulta", "Resultados por canal e pendências identificadas.", "channel-parity-acceptance.md"],
      ["Guia de desenvolvimento", "Rotas, conectores e tratamento de erros.", "developer-guide.md"],
      ["Gateway MCP", "Diferenças entre agente pessoal, catálogo público e administração.", "mcp-gateway.md"],
    ],
    open: "Abrir documentação",
    advanced: "Integrações avançadas e sandbox",
    advancedText: "Estas superfícies têm contratos e permissões próprios. Operações financeiras, reservas e administração de provedores ficam fora do percurso de registro e consultas.",
    publicTitle: "Catálogo público de comércio",
    publicText: "O MCP genérico é diferente do agente pessoal. search_offers e get_offer leem o catálogo público. Exemplos de demonstração são identificados como demos; não comprovam ofertas publicadas nem um serviço operacional.",
    publicTools: "Leituras do sandbox",
    providerTitle: "Provedores e integração de produtos",
    providerText: "A administração de provedores usa identidade e permissões separadas. Consulte a documentação antes de preparar uma integração; o chat não cadastra provedores automaticamente.",
    providerDocs: "Documentação de provedores", integrationDocs: "Guia de integração de produtos",
    financeTitle: "Documentação financeira Testnet",
    financeText: "Financiamento, trustlines e depósitos têm fluxos próprios de revisão e autorização. Abrir os exemplos de consultas não os executa.",
    financeDocs: "Documentação de DeFindex Testnet",
    footer: "Registro e consultas · Chat primeiro",
  },
};

export default function DeveloperPortal() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <main className="developer-portal">
      <nav className="developer-nav shell">
        <Link className="brand" href="/"><BrandLockup /></Link>
        <div>
          <Link href="/">{t.home}</Link><Link href="/guide">{t.guide}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
          <Link href="/agent">{t.chat}</Link>
        </div>
      </nav>
      <header className="developer-hero shell">
        <div>
          <p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="lede">{t.lede}</p>
          <div className="developer-badges">{t.badges.map(badge => <span key={badge}>{badge}</span>)}</div>
        </div>
      </header>
      <section className="developer-section shell query-examples" id="quickstart">
        <header className="section-heading">
          <p className="eyebrow">{t.quickEyebrow}</p><h2>{t.quickTitle}</h2><p>{t.quickText}</p>
        </header>
        <div className="developer-tools">
          {queryExamples.map(({ command, tool }, index) => (
            <article key={command}>
              <h3>{t.exampleTitles[index]}</h3>
              <p>{t.tool}: <code>{tool}</code></p>
              <p><Link href={"/agent?draft=" + encodeURIComponent(command)}>{t.draft}</Link></p>
              <details><summary>{t.contract}</summary><code>{command}</code></details>
            </article>
          ))}
        </div>
      </section>
      <section className="developer-section shell" id="personal-mcp">
        <header className="section-heading">
          <p className="eyebrow">{t.mcpEyebrow}</p><h2>{t.mcpTitle}</h2><p>{t.mcpText}</p>
        </header>
        <div className="code-window"><pre><code>{personalEndpoint}</code></pre></div>
        <ol>{t.mcpSteps.map(step => <li key={step}>{step}</li>)}</ol>
        <h3>{t.permissions}</h3><p>{t.permissionsText}</p>
        <p>{t.clientLimit}</p>
        <a href="/.well-known/mcp" target="_blank" rel="noreferrer">{t.catalog} ↗</a>
      </section>
      <section className="developer-section shell">
        <header className="section-heading">
          <p className="eyebrow">{t.statusEyebrow}</p><h2>{t.statusTitle}</h2><p>{t.statusText}</p>
        </header>
        <ul>{t.statusItems.map(item => <li key={item}>{item}</li>)}</ul>
        <a href={docsBase + "channel-parity-acceptance.md"} target="_blank" rel="noreferrer">{t.acceptance} ↗</a>
      </section>
      <section className="developer-section shell">
        <header className="section-heading"><p className="eyebrow">{t.docsEyebrow}</p><h2>{t.docsTitle}</h2></header>
        <div className="docs-grid">
          {t.docs.map(([title, description, file]) => (
            <a key={file} href={docsBase + file} target="_blank" rel="noreferrer">
              <h3>{title}</h3><p>{description}</p><b>{t.open} ↗</b>
            </a>
          ))}
        </div>
      </section>
      <section className="developer-section shell">
        <details className="developer-disclosure">
          <summary>{t.advanced}</summary><p>{t.advancedText}</p>
          <section>
            <h3>{t.publicTitle}</h3><p>{t.publicText}</p>
            <div className="code-window"><pre><code>{publicEndpoint}</code></pre></div>
            <p>{t.publicTools}: <code>search_offers</code>, <code>get_offer</code></p>
          </section>
          <section id="provider">
            <h3>{t.providerTitle}</h3><p>{t.providerText}</p>
            <p><a href={docsBase + "business-onboarding.md"} target="_blank" rel="noreferrer">{t.providerDocs} ↗</a></p>
          </section>
          <section id="connect-product">
            <p><a href={docsBase + "NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md"} target="_blank" rel="noreferrer">{t.integrationDocs} ↗</a></p>
          </section>
          <section>
            <h3>{t.financeTitle}</h3><p>{t.financeText}</p>
            <a href={docsBase + "defindex-testnet.md"} target="_blank" rel="noreferrer">{t.financeDocs} ↗</a>
          </section>
        </details>
      </section>
      <footer className="developer-footer shell">
        <Link className="brand" href="/"><BrandLockup /></Link><span>{t.footer}</span><Link href="/agent">{t.chat}</Link>
      </footer>
    </main>
  );
}
