"use client";

import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";

const commands = {
  wallets: "/consulta personal.wallets {}",
  market: '/consulta offchain.market.quote {"assets":[{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}',
  functions: "/consulta offchain.capabilities.list {}",
};

const copy = {
  es: {
    back: "Inicio", agent: "Abrir chat", eyebrow: "COMIENZA AQUÍ",
    title: "Conoce Carmelita desde el chat.",
    lede: "Ingresa con Privy, consulta tus billeteras de prueba y explora el mercado.",
    badges: ["Billeteras Testnet", "Precios Mainnet", "Español · English · Português"],
    before: "Tu primer recorrido", beforeTitle: "Ingresa y haz una consulta.",
    beforeText: "Privy proporciona tu identidad. Carmelita carga o prepara tus registros de billeteras Stellar, EVM y Solana; una cuenta existente conserva sus direcciones.",
    beforeItems: ["La preparación completa incluye tres familias y cinco redes.", "Las tres redes EVM comparten dirección y tienen exploradores distintos.", "El registro, el saldo y la activación en la red son datos distintos."],
    journey: "PASO A PASO", journeyTitle: "Ingresa. Consulta. Explora.",
    journeyText: "Los ejemplos sólo rellenan el compositor. Revisa la consulta y envíala cuando quieras.",
    steps: [
      ["01", "Ingresa con Privy", "Abre el chat, elige un método de acceso disponible y espera a que carguen tus registros de billeteras.", ""],
      ["02", "Consulta tus billeteras", "Consulta red, dirección, estado del registro y explorador de tus cinco redes Testnet.", commands.wallets],
      ["03", "Consulta un precio", "Prueba SOL, AVAX y BNB. Las respuestas muestran la fuente y la fecha de los datos de mercado Mainnet.", commands.market],
      ["04", "Descubre funciones", "Abre Funciones o consulta el catálogo. La implementación, tu conexión y la disponibilidad del proveedor se muestran por separado.", commands.functions],
    ],
    draft: "Abrir como borrador", command: "Ver comando",
    help: "PREGUNTAS COMUNES", helpTitle: "Si algo falta",
    questions: [
      ["¿Qué hago si la preparación queda parcial?", "Conserva la misma cuenta y revisa el aviso en Billeteras. Algunas redes pueden no estar listas todavía; no necesitas crear otra identidad."],
      ["¿Tener una dirección significa que tengo saldo?", "No. El estado del registro describe la preparación en Carmelita. El saldo y la activación en la red se consultan por separado. No necesitas financiar la billetera para este recorrido."],
      ["¿Qué pasa si una consulta no está disponible?", "La respuesta indica la fuente, la conexión o el dato que falta. Puedes reintentar la consulta; si un panel muestra Reintentar, usa ese botón. Una función en el catálogo no garantiza que su proveedor esté operativo en ese momento."],
      ["¿Qué significa un precio no disponible?", "Un activo identificado como inactivo conserva su ID y fuente. No encontrado se limita a los catálogos consultados. Si hay varios candidatos, elige un ID o precisa red y dirección. Si otra fuente falla, la consulta es parcial y puedes reintentar; la falta de precio no equivale a cero."],
      ["¿Por qué los precios dicen Mainnet?", "Los precios y el TVL son datos públicos de mercado Mainnet. Tus billeteras siguen en Testnet y sus fondos de prueba no se valoran automáticamente."],
    ],
    chatgpt: "ChatGPT es opcional",
    chatgptText: "Puedes completar este recorrido en Carmelita. Si tienes acceso al complemento, autoriza la misma cuenta por el flujo visible y revisa sus permisos. El acceso desde otra cuenta independiente de ChatGPT sigue pendiente de validación.",
    chatgptHelp: "Si la conexión no termina, continúa en Carmelita y registra el paso que falló sin compartir códigos, tokens ni credenciales.",
    advanced: "Documentación avanzada",
    advancedText: "La financiación de Testnet, las trustlines y los depósitos tienen requisitos propios y quedan fuera de esta primera prueba de registro y consultas.",
    developers: "Comandos y documentación para desarrolladores",
    financeDocs: "Consultar documentación técnica de DeFindex Testnet",
    footer: "Registro y consultas · Billeteras Testnet",
  },
  en: {
    back: "Home", agent: "Open chat", eyebrow: "START HERE",
    title: "Get to know Carmelita through chat.",
    lede: "Sign in with Privy, view your test wallets and explore the market.",
    badges: ["Testnet wallets", "Mainnet prices", "English · Español · Português"],
    before: "Your first visit", beforeTitle: "Sign in and ask a question.",
    beforeText: "Privy provides your identity. Carmelita loads or prepares your Stellar, EVM and Solana wallet records; an existing account keeps its addresses.",
    beforeItems: ["Complete preparation includes three wallet families and five networks.", "The three EVM networks share an address and use different explorers.", "Registration, balance and on-chain activation are separate facts."],
    journey: "STEP BY STEP", journeyTitle: "Sign in. Ask. Explore.",
    journeyText: "Examples only fill the composer. Review the query and send it when ready.",
    steps: [
      ["01", "Sign in with Privy", "Open chat, choose an available sign-in method and wait for your wallet records to load.", ""],
      ["02", "View your wallets", "Check the network, address, registration status and explorer for your five Testnet networks.", commands.wallets],
      ["03", "Check a price", "Try SOL, AVAX and BNB. Responses show the source and date of Mainnet market data.", commands.market],
      ["04", "Discover features", "Open Features or query the catalog. Implementation, your connection and provider availability are reported separately.", commands.functions],
    ],
    draft: "Open as draft", command: "View command",
    help: "COMMON QUESTIONS", helpTitle: "If something is missing",
    questions: [
      ["What if preparation is only partial?", "Keep the same account and check the notice in Wallets. Some networks may not be ready yet; you do not need to create another identity."],
      ["Does having an address mean I have funds?", "No. Registration status describes preparation in Carmelita. Balance and on-chain activation are checked separately. You do not need to fund a wallet for this visit."],
      ["What if a query is unavailable?", "The response identifies the missing source, connection or data. You can retry the query; if a panel shows Retry, use that button. A catalog entry does not guarantee that its provider is operating at that moment."],
      ["What does an unavailable price mean?", "An asset identified as inactive keeps its ID and source. Not found applies only to the catalogs consulted. If several candidates match, choose an ID or specify network and address. If another source fails, the query is partial and you can retry; a missing price is not zero."],
      ["Why do prices say Mainnet?", "Prices and TVL are public Mainnet market data. Your wallets remain on Testnet and test funds are not automatically valued."],
    ],
    chatgpt: "ChatGPT is optional",
    chatgptText: "You can complete this visit in Carmelita. If you have access to the connector, authorize the same account through the visible flow and review its permissions. Access from another independent ChatGPT account is still awaiting validation.",
    chatgptHelp: "If connecting does not finish, continue in Carmelita and note the step that failed without sharing codes, tokens or credentials.",
    advanced: "Advanced documentation",
    advancedText: "Testnet funding, trustlines and deposits have their own requirements and are outside this first registration and query test.",
    developers: "Commands and developer documentation",
    financeDocs: "Read the DeFindex Testnet technical documentation",
    footer: "Registration and queries · Testnet wallets",
  },
  pt: {
    back: "Início", agent: "Abrir chat", eyebrow: "COMECE AQUI",
    title: "Conheça a Carmelita pelo chat.",
    lede: "Entre com Privy, consulte suas carteiras de teste e explore o mercado.",
    badges: ["Carteiras Testnet", "Preços Mainnet", "Português · Español · English"],
    before: "Seu primeiro percurso", beforeTitle: "Entre e faça uma consulta.",
    beforeText: "Privy fornece sua identidade. Carmelita carrega ou prepara seus registros de carteiras Stellar, EVM e Solana; uma conta existente mantém seus endereços.",
    beforeItems: ["A preparação completa inclui três famílias e cinco redes.", "As três redes EVM compartilham o endereço e têm exploradores diferentes.", "Registro, saldo e ativação na rede são dados distintos."],
    journey: "PASSO A PASSO", journeyTitle: "Entre. Consulte. Explore.",
    journeyText: "Os exemplos apenas preenchem o compositor. Revise a consulta e envie quando desejar.",
    steps: [
      ["01", "Entre com Privy", "Abra o chat, escolha um método de acesso disponível e aguarde seus registros de carteiras carregarem.", ""],
      ["02", "Consulte suas carteiras", "Confira rede, endereço, estado do registro e explorador das suas cinco redes Testnet.", commands.wallets],
      ["03", "Consulte um preço", "Experimente SOL, AVAX e BNB. As respostas mostram a fonte e a data dos dados de mercado Mainnet.", commands.market],
      ["04", "Descubra funções", "Abra Funções ou consulte o catálogo. A implementação, sua conexão e a disponibilidade do provedor são apresentadas separadamente.", commands.functions],
    ],
    draft: "Abrir como rascunho", command: "Ver comando",
    help: "PERGUNTAS COMUNS", helpTitle: "Se algo estiver faltando",
    questions: [
      ["E se a preparação estiver parcial?", "Mantenha a mesma conta e confira o aviso em Carteiras. Algumas redes podem não estar prontas ainda; não é necessário criar outra identidade."],
      ["Ter um endereço significa que tenho saldo?", "Não. O estado do registro descreve a preparação na Carmelita. Saldo e ativação na rede são consultados separadamente. Não é necessário financiar a carteira para este percurso."],
      ["E se uma consulta estiver indisponível?", "A resposta indica a fonte, conexão ou dado que falta. Você pode repetir a consulta; se um painel mostrar Tentar novamente, use esse botão. Uma função no catálogo não garante que seu provedor esteja operando naquele momento."],
      ["O que significa um preço indisponível?", "Um ativo identificado como inativo mantém seu ID e fonte. Não encontrado se limita aos catálogos consultados. Se houver vários candidatos, escolha um ID ou indique rede e endereço. Se outra fonte falhar, a consulta é parcial e você pode tentar novamente; a falta de preço não equivale a zero."],
      ["Por que os preços dizem Mainnet?", "Preços e TVL são dados públicos de mercado Mainnet. Suas carteiras continuam em Testnet e os fundos de teste não são avaliados automaticamente."],
    ],
    chatgpt: "ChatGPT é opcional",
    chatgptText: "Você pode completar este percurso na Carmelita. Se tiver acesso ao complemento, autorize a mesma conta pelo fluxo visível e confira suas permissões. O acesso por outra conta independente do ChatGPT ainda aguarda validação.",
    chatgptHelp: "Se a conexão não terminar, continue na Carmelita e registre a etapa que falhou sem compartilhar códigos, tokens ou credenciais.",
    advanced: "Documentação avançada",
    advancedText: "Financiamento de Testnet, trustlines e depósitos têm requisitos próprios e ficam fora desta primeira prova de registro e consultas.",
    developers: "Comandos e documentação para desenvolvedores",
    financeDocs: "Consultar a documentação técnica de DeFindex Testnet",
    footer: "Registro e consultas · Carteiras Testnet",
  },
};

export default function GuideClient() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <main className="guide-page">
      <nav className="guide-nav shell">
        <Link className="brand" href="/"><BrandLockup /></Link>
        <div>
          <Link href="/">{t.back}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
          <Link className="guide-nav-agent" href="/agent">{t.agent}</Link>
        </div>
      </nav>
      <header className="guide-hero shell">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p className="lede">{t.lede}</p>
          <div className="guide-badges">{t.badges.map(badge => <span key={badge}>{badge}</span>)}</div>
        </div>
        <aside>
          <span>{t.before}</span><h2>{t.beforeTitle}</h2><p>{t.beforeText}</p>
          <ul>{t.beforeItems.map(item => <li key={item}>{item}</li>)}</ul>
        </aside>
      </header>
      <section className="guide-journey shell">
        <div className="guide-heading">
          <p className="eyebrow">{t.journey}</p><h2>{t.journeyTitle}</h2><p>{t.journeyText}</p>
        </div>
        <ol>
          {t.steps.map(([number, title, description, command]) => (
            <li key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3><p>{description}</p>
                {command && <>
                  <p><Link href={"/agent?draft=" + encodeURIComponent(command)}>{t.draft}</Link></p>
                  <details><summary>{t.command}</summary><div className="guide-command"><code>{command}</code></div></details>
                </>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="guide-faq guide-help shell">
        <div className="guide-heading"><p className="eyebrow">{t.help}</p><h2>{t.helpTitle}</h2></div>
        {t.questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        <details id="chatgpt">
          <summary>{t.chatgpt}</summary><p>{t.chatgptText}</p><p>{t.chatgptHelp}</p>
          <p><Link href="/connect-chatgpt">{locale === "es" ? "Conectar Carmelita con ChatGPT" : locale === "pt" ? "Conectar Carmelita ao ChatGPT" : "Connect Carmelita with ChatGPT"}</Link></p>
        </details>
        <details>
          <summary>{t.advanced}</summary><p>{t.advancedText}</p>
          <p><Link href="/developers#quickstart">{t.developers}</Link></p>
          <p><a href="https://github.com/CaBsCrypto/carmelita/blob/main/docs/defindex-testnet.md" target="_blank" rel="noreferrer">{t.financeDocs} ↗</a></p>
        </details>
      </section>
      <footer className="guide-footer shell">
        <Link className="brand" href="/"><BrandLockup /></Link><span>{t.footer}</span><Link href="/agent">{t.agent}</Link>
      </footer>
    </main>
  );
}
