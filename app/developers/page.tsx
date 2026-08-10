"use client";

import { useState } from "react";
import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";

const endpoint = "https://agente-asistente.vercel.app/api/mcp";
const clientConfig = `{
  "mcpServers": {
    "Carmelita": {
      "url": "${endpoint}"
    }
  }
}`;

const tools = [
  ["search_offers", "READ", "Find public agent-ready services."],
  ["get_offer", "READ", "Inspect one structured offer."],
  ["create_intent", "WRITE", "Freeze one action with an idempotency key."],
  ["evaluate_policy", "SAFE", "Apply limits before approval."],
  ["demo_authorize_intent", "DEMO", "Record explicit sandbox confirmation."],
  ["execute_authorized_intent", "REPLAY SAFE", "Create or replay one sandbox receipt."],
  ["get_receipt", "READ", "Retrieve durable execution evidence."],
];

const copy = {
  en: {
    nav: ["Product", "Integration Lab", "GitHub"],
    eyebrow: "DEVELOPER PLATFORM",
    title: "Build the action layer for the agent economy.",
    lede: "Use our agent, publish a service agents can discover, or connect your product through a narrow and auditable tool contract.",
    badges: ["STELLAR TESTNET", "NON-CUSTODIAL", "3 MCP SURFACES"],
    metrics: [["3", "integration paths"], ["7", "sandbox tools"], ["0", "private keys stored"]],
    choose: "Choose how you want to build",
    chooseText: "Each path starts small, proves one useful action and keeps sensitive execution behind explicit authority.",
    paths: [
      ["01", "Use Carmelita", "Connect an external agent to our public commerce sandbox or, during development, to a user's personal agent.", "Start with public MCP", "#quickstart", "SANDBOX LIVE"],
      ["02", "Publish your service", "Create a scoped provider identity, publish structured offers and make them discoverable by agents.", "See provider flow", "#provider", "PILOT READY"],
      ["03", "Connect your product", "Expose one official MCP or API action and let Carmelita call it after user consent.", "Use integration checklist", "#connect-product", "GUIDED"],
    ],
    architecture: "One gateway, two directions",
    architectureText: "External agents can use us. Our agent can use external products. Providers can publish the services both sides discover.",
    diagram: ["External agent", "Carmelita", "Policy + receipts", "Provider catalog", "External product"],
    quick: "Public MCP quickstart",
    quickText: "No API key is required for the commerce sandbox. Add the endpoint, list the tools and keep one stable idempotency key for every logical action.",
    copy: "Copy config",
    copied: "Copied",
    test: "Open MCP discovery",
    toolsTitle: "Seven narrow tools, one safe lifecycle",
    toolsText: "Discovery is separated from intent creation, policy, approval, execution and evidence.",
    providerTitle: "Publish a service without rebuilding your product",
    providerText: "The current pilot flow uses one scoped key per provider. Self-service verification and rotation are the next public milestone.",
    providerSteps: [
      ["1", "Register provider", "Founder creates the pilot identity and returns the raw token once."],
      ["2", "Create a draft", "Map one service to a strict offer contract with a stable external ID."],
      ["3", "Publish", "Only published offers appear in public search."],
      ["4", "Receive intent", "Orders and fulfillment events remain the next vertical slice."],
    ],
    connectTitle: "Bring your own MVP",
    connectText: "You do not need to rebuild your product around MCP. We select the smallest official surface that can prove one useful action.",
    checklist: ["Official API, MCP, SDK or WebMCP surface", "Minimum user consent and scopes", "Stable identifiers and normalized errors", "Sandbox or reversible first action", "Idempotency, timeout and retry behavior", "Settlement and fulfillment verified separately"],
    handoff: "Send this brief to your developer or implementation agent",
    handoffCta: "Open integration agent brief",
    docsTitle: "Documentation that matches the product state",
    docs: [
      ["Product narrative", "What Carmelita does, how the control model works and how to explain it.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/product-narrative.md"],
      ["Mission and vision", "Why Carmelita exists, its north star and the principles that constrain growth.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mission-vision.md"],
      ["Business onboarding", "Choose the smallest API, MCP, WebMCP or guided integration path.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/business-onboarding.md"],
      ["Developer guide", "Quickstart, APIs, connectors, errors and definition of done.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/developer-guide.md"],
      ["Architecture", "Identity, consent, tools, payment boundaries and deployment diagrams.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/architecture.md"],
      ["MCP gateway", "Public sandbox, personal agent and provider-admin surfaces.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mcp-gateway.md"],
      ["Agent Gateway v1", "Connect Codex or another agent with scoped Testnet credentials.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/agent-gateway-v1.md"],
      ["DeFindex Testnet", "Trustline, transaction review, Privy signature and receipt flow.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/defindex-testnet.md"],
    ],
    statusTitle: "Know exactly what is real",
    statusRows: [["Public commerce MCP", "Sandbox live"], ["Provider MCP", "Pilot ready"], ["Personal agent MCP", "Testnet PAT ready"], ["DeFindex signing", "Live Testnet proof"], ["Mainnet settlement", "Disabled"]],
    securityTitle: "Security contract",
    security: ["No private key or seed phrase reaches Carmelita.", "Personal users and providers are isolated principals.", "Provider keys are hashed, scoped and returned raw only once.", "Creating an intent never moves funds.", "Retries reuse the original intent or receipt.", "Mainnet and public MCP payment signing remain disabled."],
    finalTitle: "Start with one action worth proving.",
    finalText: "Connect the public sandbox today or bring us one product action for a guided Testnet pilot.",
    finalPrimary: "Copy MCP endpoint",
    finalSecondary: "Review integrations",
    back: "Back to product",
  },
  es: {
    nav: ["Producto", "Laboratorio", "GitHub"],
    eyebrow: "PLATAFORMA PARA DEVELOPERS",
    title: "Construye la capa de acciones para la economía de agentes.",
    lede: "Usa nuestro agente, publica un servicio que otros agentes puedan descubrir o conecta tu producto mediante herramientas específicas y auditables.",
    badges: ["STELLAR TESTNET", "NO CUSTODIAL", "3 SUPERFICIES MCP"],
    metrics: [["3", "rutas de integración"], ["7", "herramientas sandbox"], ["0", "claves privadas almacenadas"]],
    choose: "Elige cómo quieres construir",
    chooseText: "Cada ruta comienza pequeña, demuestra una acción útil y protege la ejecución sensible con autoridad explícita.",
    paths: [
      ["01", "Usar Carmelita", "Conecta un agente externo a nuestro sandbox público o, durante desarrollo, al agente personal de un usuario.", "Comenzar con MCP público", "#quickstart", "SANDBOX ACTIVO"],
      ["02", "Publicar tu servicio", "Crea una identidad de provider con permisos limitados y publica ofertas estructuradas para agentes.", "Ver flujo de providers", "#provider", "PILOTO LISTO"],
      ["03", "Conectar tu producto", "Expón una acción oficial mediante MCP o API y permite que Carmelita la use después del consentimiento.", "Usar checklist", "#connect-product", "GUIADO"],
    ],
    architecture: "Un gateway, dos direcciones",
    architectureText: "Agentes externos pueden utilizarnos. Nuestro agente puede utilizar productos externos. Los providers publican los servicios que ambos descubren.",
    diagram: ["Agente externo", "Carmelita", "Política + recibos", "Catálogo provider", "Producto externo"],
    quick: "Quickstart del MCP público",
    quickText: "El sandbox de comercio no requiere API key. Agrega el endpoint, descubre las herramientas y conserva una idempotency key estable para cada acción lógica.",
    copy: "Copiar config",
    copied: "Copiado",
    test: "Abrir discovery MCP",
    toolsTitle: "Siete herramientas específicas, un ciclo seguro",
    toolsText: "El descubrimiento está separado de la creación del intent, política, aprobación, ejecución y evidencia.",
    providerTitle: "Publica un servicio sin reconstruir tu producto",
    providerText: "El piloto actual utiliza una clave limitada por provider. La verificación y rotación autoservicio son el próximo hito público.",
    providerSteps: [
      ["1", "Registrar provider", "El founder crea la identidad piloto y entrega el token raw una sola vez."],
      ["2", "Crear borrador", "Mapea un servicio a un contrato estricto con external ID estable."],
      ["3", "Publicar", "Solo las ofertas publicadas aparecen en la búsqueda pública."],
      ["4", "Recibir intent", "Órdenes y eventos de fulfillment son el siguiente corte vertical."],
    ],
    connectTitle: "Trae tu propia MVP",
    connectText: "No necesitas reconstruir tu producto alrededor de MCP. Elegimos la superficie oficial más pequeña que permita demostrar una acción útil.",
    checklist: ["API, MCP, SDK o WebMCP oficial", "Consentimiento y scopes mínimos", "IDs estables y errores normalizados", "Primera acción reversible o sandbox", "Idempotencia, timeout y reintentos", "Liquidación y entrega verificadas por separado"],
    handoff: "Envía este brief a tu developer o agente de implementación",
    handoffCta: "Abrir brief para integrar productos",
    docsTitle: "Documentación alineada con el estado real",
    docs: [
      ["Narrativa del producto", "Qué hace Carmelita, cómo funciona el control y cómo explicarlo.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/product-narrative.md"],
      ["Misión y visión", "Por qué existe Carmelita, su norte y los principios que limitan su crecimiento.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mission-vision.md"],
      ["Onboarding para negocios", "Elige la ruta más pequeña mediante API, MCP, WebMCP o integración guiada.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/business-onboarding.md"],
      ["Guía para developers", "Quickstart, APIs, conectores, errores y definición de terminado.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/developer-guide.md"],
      ["Arquitectura", "Diagramas de identidad, consentimiento, herramientas, pagos y despliegue.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/architecture.md"],
      ["Gateway MCP", "Sandbox público, agente personal y administración de providers.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mcp-gateway.md"],
      ["Agent Gateway v1", "Conecta Codex u otro agente con credenciales Testnet limitadas.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/agent-gateway-v1.md"],
      ["DeFindex Testnet", "Trustline, revisión, firma Privy y flujo de recibos.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/defindex-testnet.md"],
    ],
    statusTitle: "Sabe exactamente qué es real",
    statusRows: [["MCP de comercio público", "Sandbox activo"], ["Provider MCP", "Piloto listo"], ["MCP del agente personal", "PAT Testnet listo"], ["Firma DeFindex", "Prueba Testnet activa"], ["Liquidación Mainnet", "Desactivada"]],
    securityTitle: "Contrato de seguridad",
    security: ["Ninguna clave privada o seed phrase llega a Carmelita.", "Usuarios personales y providers son identidades aisladas.", "Las claves provider se guardan hasheadas y con scopes.", "Crear un intent nunca mueve fondos.", "Los reintentos reutilizan el intent o recibo original.", "Mainnet y la firma de pagos vía MCP público siguen desactivados."],
    finalTitle: "Comienza con una acción que valga la pena demostrar.",
    finalText: "Conecta hoy el sandbox público o trae una acción de tu producto para un piloto guiado en Testnet.",
    finalPrimary: "Copiar endpoint MCP",
    finalSecondary: "Revisar integraciones",
    back: "Volver al producto",
  },
  pt: {
    nav: ["Produto", "Laboratório", "GitHub"],
    eyebrow: "PLATAFORMA PARA DEVELOPERS",
    title: "Construa a camada de ações para a economia de agentes.",
    lede: "Use nosso agente, publique um serviço que outros agentes possam descobrir ou conecte seu produto por meio de ferramentas específicas e auditáveis.",
    badges: ["STELLAR TESTNET", "NÃO CUSTODIAL", "3 SUPERFÍCIES MCP"],
    metrics: [["3", "rotas de integração"], ["7", "ferramentas sandbox"], ["0", "chaves privadas armazenadas"]],
    choose: "Escolha como você quer construir",
    chooseText: "Cada rota começa pequena, prova uma ação útil e mantém a execução sensível sob autoridade explícita.",
    paths: [
      ["01", "Usar Carmelita", "Conecte um agente externo ao nosso sandbox público ou, durante o desenvolvimento, ao agente pessoal de um usuário.", "Começar com MCP público", "#quickstart", "SANDBOX ATIVO"],
      ["02", "Publicar seu serviço", "Crie uma identidade de provider com permissões limitadas e publique ofertas estruturadas para agentes.", "Ver fluxo de providers", "#provider", "PILOTO PRONTO"],
      ["03", "Conectar seu produto", "Exponha uma ação oficial via MCP ou API e permita que Carmelita a use após o consentimento.", "Usar checklist", "#connect-product", "GUIADO"],
    ],
    architecture: "Um gateway, duas direções",
    architectureText: "Agentes externos podem nos usar. Nosso agente pode usar produtos externos. Providers publicam os serviços que ambos descobrem.",
    diagram: ["Agente externo", "Carmelita", "Política + recibos", "Catálogo provider", "Produto externo"],
    quick: "Quickstart do MCP público",
    quickText: "O sandbox de comércio não exige API key. Adicione o endpoint, descubra as ferramentas e mantenha uma idempotency key estável para cada ação lógica.",
    copy: "Copiar config",
    copied: "Copiado",
    test: "Abrir discovery MCP",
    toolsTitle: "Sete ferramentas específicas, um ciclo seguro",
    toolsText: "A descoberta é separada da criação do intent, política, aprovação, execução e evidência.",
    providerTitle: "Publique um serviço sem reconstruir seu produto",
    providerText: "O piloto atual usa uma chave limitada por provider. Verificação e rotação self-service são o próximo marco público.",
    providerSteps: [
      ["1", "Registrar provider", "O founder cria a identidade piloto e entrega o token bruto uma única vez."],
      ["2", "Criar rascunho", "Mapeie um serviço para um contrato estrito com external ID estável."],
      ["3", "Publicar", "Somente ofertas publicadas aparecem na busca pública."],
      ["4", "Receber intent", "Pedidos e eventos de fulfillment são o próximo corte vertical."],
    ],
    connectTitle: "Traga seu próprio MVP",
    connectText: "Você não precisa reconstruir seu produto em torno do MCP. Escolhemos a menor superfície oficial capaz de provar uma ação útil.",
    checklist: ["API, MCP, SDK ou WebMCP oficial", "Consentimento e scopes mínimos", "IDs estáveis e erros normalizados", "Primeira ação reversível ou sandbox", "Idempotência, timeout e tentativas", "Liquidação e entrega verificadas separadamente"],
    handoff: "Envie este briefing ao seu developer ou agente de implementação",
    handoffCta: "Abrir briefing de integração",
    docsTitle: "Documentação alinhada ao estado real",
    docs: [
      ["Narrativa do produto", "O que Carmelita faz, como funciona o controle e como explicá-lo.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/product-narrative.md"],
      ["Missão e visão", "Por que Carmelita existe, sua direção e os princípios que limitam seu crescimento.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mission-vision.md"],
      ["Onboarding para negócios", "Escolha a menor rota via API, MCP, WebMCP ou integração guiada.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/business-onboarding.md"],
      ["Guia para developers", "Quickstart, APIs, conectores, erros e definição de pronto.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/developer-guide.md"],
      ["Arquitetura", "Diagramas de identidade, consentimento, ferramentas, pagamentos e deploy.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/architecture.md"],
      ["Gateway MCP", "Sandbox público, agente pessoal e administração de providers.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/mcp-gateway.md"],
      ["Agent Gateway v1", "Conecte Codex ou outro agente com credenciais Testnet limitadas.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/agent-gateway-v1.md"],
      ["DeFindex Testnet", "Trustline, revisão, assinatura Privy e fluxo de recibos.", "https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/defindex-testnet.md"],
    ],
    statusTitle: "Saiba exatamente o que é real",
    statusRows: [["MCP de comércio público", "Sandbox ativo"], ["Provider MCP", "Piloto pronto"], ["MCP do agente pessoal", "PAT Testnet pronto"], ["Assinatura DeFindex", "Prova Testnet ativa"], ["Liquidação Mainnet", "Desativada"]],
    securityTitle: "Contrato de segurança",
    security: ["Nenhuma chave privada ou seed phrase chega à Carmelita.", "Usuários pessoais e providers são identidades isoladas.", "Chaves de provider são armazenadas com hash e scopes.", "Criar um intent nunca move fundos.", "Novas tentativas reutilizam o intent ou recibo original.", "Mainnet e assinatura de pagamentos via MCP público continuam desativados."],
    finalTitle: "Comece com uma ação que vale a pena provar.",
    finalText: "Conecte o sandbox público hoje ou traga uma ação do seu produto para um piloto guiado na Testnet.",
    finalPrimary: "Copiar endpoint MCP",
    finalSecondary: "Revisar integrações",
    back: "Voltar ao produto",
  },};

export default function Developers() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [copied, setCopied] = useState<string | null>(null);

  async function copyValue(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <main className="developer-portal">
      <nav className="developer-nav shell">
        <Link className="brand" href="/"><BrandLockup /></Link>
        <div><Link href="/">{t.nav[0]}</Link><Link href="/connections">{t.nav[1]}</Link><a href="https://github.com/CaBsCrypto/agente-asistente">{t.nav[2]}</a><LanguageToggle locale={locale} onChange={setLocale} compact /></div>
      </nav>

      <header className="developer-hero shell">
        <div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="lede">{t.lede}</p><div className="developer-badges">{t.badges.map((badge) => <span key={badge}>{badge}</span>)}</div></div>
        <div className="developer-metrics">{t.metrics.map((metric) => <article key={metric[1]}><strong>{metric[0]}</strong><span>{metric[1]}</span></article>)}</div>
      </header>

      <section className="developer-section shell"><header className="section-heading"><p className="eyebrow">01 · START</p><h2>{t.choose}</h2><p>{t.chooseText}</p></header><div className="developer-paths">{t.paths.map((path) => <article key={path[0]}><header><b>{path[0]}</b><span>{path[5]}</span></header><h3>{path[1]}</h3><p>{path[2]}</p><a href={path[4]}>{path[3]} →</a></article>)}</div></section>

      <section className="developer-architecture"><div className="shell"><header className="section-heading"><p className="eyebrow">02 · ARCHITECTURE</p><h2>{t.architecture}</h2><p>{t.architectureText}</p></header><div className="architecture-map"><div>{t.diagram[0]}</div><i>→</i><div className="core">{t.diagram[1]}<small>{t.diagram[2]}</small></div><i>↔</i><div>{t.diagram[3]}</div><i>↔</i><div>{t.diagram[4]}</div></div></div></section>

      <section className="developer-section shell" id="quickstart"><div className="quickstart-grid"><div><p className="eyebrow">03 · QUICKSTART</p><h2>{t.quick}</h2><p>{t.quickText}</p><div className="quick-actions"><button type="button" onClick={() => void copyValue(clientConfig, "config")}>{copied === "config" ? t.copied : t.copy}</button><a href="/.well-known/mcp" target="_blank">{t.test} ↗</a></div></div><div className="code-window"><header><span /><span /><span /><b>mcp.config.json</b></header><pre>{clientConfig}</pre></div></div></section>

      <section className="developer-section shell"><header className="section-heading"><p className="eyebrow">04 · TOOL CONTRACT</p><h2>{t.toolsTitle}</h2><p>{t.toolsText}</p></header><div className="developer-tools">{tools.map((tool) => <article key={tool[0]}><header><code>{tool[0]}</code><span>{tool[1]}</span></header><p>{tool[2]}</p></article>)}</div></section>

      <section className="provider-band" id="provider"><div className="shell"><header className="section-heading"><p className="eyebrow">05 · PROVIDER MCP</p><h2>{t.providerTitle}</h2><p>{t.providerText}</p></header><div className="provider-steps">{t.providerSteps.map((step) => <article key={step[0]}><b>{step[0]}</b><h3>{step[1]}</h3><p>{step[2]}</p></article>)}</div></div></section>

      <section className="developer-section shell" id="connect-product"><div className="connect-grid"><div><p className="eyebrow">06 · OUTBOUND CONNECTOR</p><h2>{t.connectTitle}</h2><p>{t.connectText}</p><div className="handoff-card"><strong>{t.handoff}</strong><a href="https://github.com/CaBsCrypto/agente-asistente/blob/main/docs/NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md">{t.handoffCta} ↗</a></div></div><ol>{t.checklist.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ol></div></section>

      <section className="developer-section shell"><header className="section-heading"><p className="eyebrow">07 · DOCS</p><h2>{t.docsTitle}</h2></header><div className="docs-grid">{t.docs.map((doc) => <a key={doc[0]} href={doc[2]}><span>DOC</span><h3>{doc[0]}</h3><p>{doc[1]}</p><b>Open ↗</b></a>)}</div></section>

      <section className="developer-section shell"><div className="status-security"><div><p className="eyebrow">08 · HONEST STATUS</p><h2>{t.statusTitle}</h2><dl>{t.statusRows.map((row) => <div key={row[0]}><dt>{row[0]}</dt><dd>{row[1]}</dd></div>)}</dl></div><div className="security-card"><p className="eyebrow">SECURITY</p><h2>{t.securityTitle}</h2><ul>{t.security.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section>

      <section className="developer-final shell"><div><p className="eyebrow">READY WHEN YOU ARE</p><h2>{t.finalTitle}</h2><p>{t.finalText}</p></div><div><button type="button" onClick={() => void copyValue(endpoint, "endpoint")}>{copied === "endpoint" ? t.copied : t.finalPrimary}</button><Link href="/connections">{t.finalSecondary}</Link></div></section>
      <footer className="developer-footer shell"><Link className="brand" href="/"><BrandLockup /></Link><Link href="/">← {t.back}</Link></footer>
    </main>
  );
}