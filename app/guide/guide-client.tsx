"use client";

import Link from "next/link";
import { useLocale } from "../language-toggle";
import PublicPageShell from "../public-page-shell";
import styles from "../public-pages.module.css";

const commands = {
  wallets: "/consulta personal.wallets {}",
  activity: "/consulta personal.activity {}",
  market: '/consulta offchain.market.quote {"assets":[{"query":"ETH"}]}',
  functions: "/consulta offchain.capabilities.list {}",
};

const copy = {
  es: {
    title: "Tu primera conversación con Carmelita.",
    lede: "Conecta tu agente personal con ChatGPT y explora tus cuentas onchain, actividad reciente en Carmelita y cotizaciones de mercado, con los permisos que autorices.",
    connect: "Conectar con ChatGPT", recommended: "Recomendado", web: "Usar el chat de Carmelita",
    example: "Ejemplo ilustrativo · Cuentas multichain", question: "¿Qué redes de prueba están vinculadas a mi cuenta Carmelita?",
    exampleTitle: "Cinco redes de prueba. Una identidad Carmelita.",
    exampleItems: ["Stellar Testnet · cuenta y activación", "Solana Devnet · dirección y explorador", "Redes EVM · Avalanche Fuji, Base Sepolia y BNB Testnet"],
    exampleNote: "Tus datos aparecen después de autorizar. Registro, activación y saldo son estados diferentes; cada red tiene su propio explorador.",
    startTitle: "De la conexión a tu primera consulta.",
    startText: "Puedes crear tu cuenta Carmelita o iniciar sesión durante la autorización. No necesitas prepararla antes en otra pestaña.",
    steps: [
      ["Abre la guía de conexión", "Copia la URL de Carmelita y añádela manualmente en los conectores de ChatGPT. Tu cuenta debe permitir conectores personalizados."],
      ["Autoriza tu cuenta", "Crea tu cuenta Carmelita o usa tu identidad existente. Revisa los permisos antes de aceptar; una cuenta existente conserva sus direcciones."],
      ["Explora desde tu conversación", "Habilita Carmelita y pregunta: «¿Qué redes de prueba están vinculadas a mi cuenta Carmelita?». Después, consulta tu actividad reciente en Carmelita o el precio de ETH."],
    ],
    readGuide: "Abrir la guía de conexión",
    webTitle: "También puedes conversar aquí.",
    webText: "El chat de Carmelita es otra forma de consultar tus cuentas y actividad registrada. Inicia sesión con la misma identidad para acceder a la misma información personal.",
    webNote: "Los siguientes ejemplos abren un borrador en el chat de Carmelita. Revísalo y envíalo cuando quieras: abrirlo no ejecuta la consulta.",
    examplesTitle: "Consultas que puedes probar.",
    examples: [
      ["Tus cuentas multichain", "Consulta direcciones y registro en las cinco redes de prueba. Las tres redes EVM comparten tu dirección; sus saldos y exploradores son independientes.", commands.wallets],
      ["Actividad reciente en Carmelita", "Revisa los eventos recientes registrados para tu cuenta, con resúmenes y fechas. Los exploradores de cada red permiten consultar más detalles onchain.", commands.activity],
      ["Cotizaciones de mercado", "Consulta el precio de ETH con su fuente y hora de consulta. CoinGecko es la fuente principal y CoinMarketCap la alternativa. Comprueba los avisos de resultados parciales; los datos Mainnet están separados de tus fondos de prueba.", commands.market],
      ["Consultas disponibles", "Revisa las funciones que Carmelita tiene implementadas y su disponibilidad. Cada consulta depende de sus permisos, conexión y fuente.", commands.functions],
    ],
    draft: "Abrir como borrador", command: "Ver comando",
    helpTitle: "Si algo queda pendiente.",
    helpText: "Mantén la misma identidad y comprueba qué parte del recorrido falta.",
    questions: [
      ["¿No aparece la opción de añadir Carmelita en ChatGPT?", "La cuenta o el espacio de trabajo debe permitir conectores MCP personalizados. Crear una cuenta ChatGPT no garantiza ese permiso. La guía de conexión explica cómo comprobarlo; mientras tanto, puedes usar el chat de Carmelita."],
      ["¿Qué pasa si mis wallets no están listas?", "Revisa el estado de cada red con tu misma cuenta. La preparación puede ser parcial o una red puede no responder todavía. Si aparece Reintentar, úsalo; crear otra identidad generaría una cuenta distinta."],
      ["¿Qué incluye mi actividad?", "Incluye eventos recientes que Carmelita ha registrado para tu cuenta, con resúmenes y fechas. No es un historial completo de transacciones onchain; usa los exploradores para comprobar más detalles de cada red."],
      ["¿Qué significa que Stellar está activa?", "La activación se presenta como completada sólo cuando Stellar Testnet la confirma. Carmelita intenta activarla automáticamente con XLM de prueba; si la red no responde, puede quedar pendiente. XLM es el activo nativo y no necesita una trustline. Otros activos tienen requisitos propios."],
      ["¿Qué redes puedo consultar?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia y BNB Testnet. Las tres redes EVM comparten una dirección; cada una mantiene su propio saldo y actividad. Tener una dirección no significa tener fondos en todas las redes."],
      ["¿Qué hago si una consulta devuelve datos incompletos?", "Comprueba la fuente y el aviso de la respuesta. Una consulta puede quedar parcial si su proveedor no está disponible. Puedes reintentar; un precio que falta no equivale a cero y una función listada no garantiza que su proveedor esté operativo."],
    ],
    advanced: "Quiero revisar los detalles técnicos",
    advancedText: "La conexión usa agent:read para consultas de lectura. No autoriza pagos ni ejecución de servicios. La financiación de otros activos, las trustlines y los depósitos tienen requisitos específicos; quedan fuera de este recorrido.",
    developers: "Documentación para desarrolladores",
    financeDocs: "Documentación técnica de DeFindex Testnet",
  },
  en: {
    title: "Your first conversation with Carmelita.",
    lede: "Connect your personal agent with ChatGPT and explore your onchain accounts, recent Carmelita activity and market quotes, with the permissions you authorize.",
    connect: "Connect with ChatGPT", recommended: "Recommended", web: "Use Carmelita’s chat",
    example: "Illustrative example · Multichain accounts", question: "Which test networks are linked to my Carmelita account?",
    exampleTitle: "Five test networks. One Carmelita identity.",
    exampleItems: ["Stellar Testnet · account and activation", "Solana Devnet · address and explorer", "EVM networks · Avalanche Fuji, Base Sepolia and BNB Testnet"],
    exampleNote: "Your data appears after authorization. Registration, activation and balance are separate states; each network has its own explorer.",
    startTitle: "From connecting to your first query.",
    startText: "You can create your Carmelita account or sign in during authorization. You do not need to prepare it in another tab first.",
    steps: [
      ["Open the connection guide", "Copy Carmelita’s URL and add it manually in ChatGPT’s connectors. Your account must allow custom connectors."],
      ["Authorize your account", "Create your Carmelita account or use your existing identity. Review the permissions before accepting; an existing account keeps its addresses."],
      ["Explore from your conversation", "Enable Carmelita and ask: “Which test networks are linked to my Carmelita account?”. Then ask about your recent Carmelita activity or the price of ETH."],
    ],
    readGuide: "Open the connection guide",
    webTitle: "You can also chat here.",
    webText: "Carmelita’s chat is another way to query your accounts and recorded activity. Sign in with the same identity to access the same personal information.",
    webNote: "The examples below open a draft in Carmelita’s chat. Review it and send it when ready: opening a draft does not run the query.",
    examplesTitle: "Queries you can try.",
    examples: [
      ["Your multichain accounts", "Check addresses and registration across the five test networks. The three EVM networks share your address; their balances and explorers are separate.", commands.wallets],
      ["Recent activity in Carmelita", "Review recent events recorded for your account, with summaries and dates. Network explorers provide further onchain details.", commands.activity],
      ["Market quotes", "Ask for the price of ETH with its source and query time. CoinGecko is the primary source and CoinMarketCap the alternative. Check partial-result notices; Mainnet data is separate from your test funds.", commands.market],
      ["Available queries", "Review the features Carmelita has implemented and their availability. Each query depends on its permissions, connection and source.", commands.functions],
    ],
    draft: "Open as draft", command: "View command",
    helpTitle: "If something is still pending.",
    helpText: "Keep the same identity and check which part of the flow is missing.",
    questions: [
      ["Can’t find the option to add Carmelita in ChatGPT?", "Your account or workspace must allow custom MCP connectors. Creating a ChatGPT account does not guarantee this permission. The connection guide explains how to check; meanwhile, you can use Carmelita’s chat."],
      ["What if my wallets are not ready?", "Check each network’s status with the same account. Preparation may be partial, or a network may not be responding yet. If you see Retry, use it; creating another identity would create a different account."],
      ["What does my activity include?", "It includes recent events Carmelita has recorded for your account, with summaries and dates. It is not a complete onchain transaction history; use explorers to check further details on each network."],
      ["What does an active Stellar account mean?", "Activation is shown as complete only after Stellar Testnet confirms it. Carmelita attempts automatic activation with test XLM; if the network does not respond, it may remain pending. XLM is the native asset and needs no trustline. Other assets have their own requirements."],
      ["Which networks can I query?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia and BNB Testnet. The three EVM networks share an address; each has its own balance and activity. Having an address does not mean having funds on every network."],
      ["What if a query returns incomplete data?", "Check the source and the notice in the response. A query can be partial when its provider is unavailable. You can retry; a missing price is not zero, and a listed feature does not guarantee that its provider is operating."],
    ],
    advanced: "I want to review the technical details",
    advancedText: "The connection uses agent:read for read-only queries. It does not authorize payments or service execution. Funding other assets, trustlines and deposits have specific requirements; they are outside this flow.",
    developers: "Developer documentation",
    financeDocs: "DeFindex Testnet technical documentation",
  },
  pt: {
    title: "Sua primeira conversa com a Carmelita.",
    lede: "Conecte seu agente pessoal ao ChatGPT e explore suas contas onchain, atividade recente na Carmelita e cotações de mercado, com as permissões que autorizar.",
    connect: "Conectar ao ChatGPT", recommended: "Recomendado", web: "Usar o chat da Carmelita",
    example: "Exemplo ilustrativo · Contas multichain", question: "Quais redes de teste estão vinculadas à minha conta Carmelita?",
    exampleTitle: "Cinco redes de teste. Uma identidade Carmelita.",
    exampleItems: ["Stellar Testnet · conta e ativação", "Solana Devnet · endereço e explorador", "Redes EVM · Avalanche Fuji, Base Sepolia e BNB Testnet"],
    exampleNote: "Seus dados aparecem após a autorização. Registro, ativação e saldo são estados diferentes; cada rede tem seu próprio explorador.",
    startTitle: "Da conexão à sua primeira consulta.",
    startText: "Você pode criar sua conta Carmelita ou entrar durante a autorização. Não precisa prepará-la antes em outra aba.",
    steps: [
      ["Abra o guia de conexão", "Copie a URL da Carmelita e adicione-a manualmente nos conectores do ChatGPT. Sua conta precisa permitir conectores personalizados."],
      ["Autorize sua conta", "Crie sua conta Carmelita ou use sua identidade existente. Confira as permissões antes de aceitar; uma conta existente mantém seus endereços."],
      ["Explore pela sua conversa", "Ative a Carmelita e pergunte: “Quais redes de teste estão vinculadas à minha conta Carmelita?”. Depois, consulte sua atividade recente na Carmelita ou o preço de ETH."],
    ],
    readGuide: "Abrir o guia de conexão",
    webTitle: "Você também pode conversar aqui.",
    webText: "O chat da Carmelita é outra forma de consultar suas contas e atividade registrada. Entre com a mesma identidade para acessar as mesmas informações pessoais.",
    webNote: "Os exemplos abaixo abrem um rascunho no chat da Carmelita. Revise e envie quando desejar: abrir um rascunho não executa a consulta.",
    examplesTitle: "Consultas que você pode experimentar.",
    examples: [
      ["Suas contas multichain", "Consulte endereços e registro nas cinco redes de teste. As três redes EVM compartilham seu endereço; seus saldos e exploradores são independentes.", commands.wallets],
      ["Atividade recente na Carmelita", "Revise eventos recentes registrados para sua conta, com resumos e datas. Os exploradores permitem consultar mais detalhes onchain.", commands.activity],
      ["Cotações de mercado", "Consulte o preço de ETH com sua fonte e horário da consulta. CoinGecko é a fonte principal e CoinMarketCap a alternativa. Confira avisos de resultados parciais; os dados Mainnet estão separados dos seus fundos de teste.", commands.market],
      ["Consultas disponíveis", "Confira as funções que a Carmelita implementou e sua disponibilidade. Cada consulta depende de suas permissões, conexão e fonte.", commands.functions],
    ],
    draft: "Abrir como rascunho", command: "Ver comando",
    helpTitle: "Se algo estiver pendente.",
    helpText: "Mantenha a mesma identidade e confira qual parte do fluxo está faltando.",
    questions: [
      ["Não encontro a opção de adicionar a Carmelita no ChatGPT?", "A conta ou o espaço de trabalho precisa permitir conectores MCP personalizados. Criar uma conta ChatGPT não garante essa permissão. O guia de conexão explica como verificar; enquanto isso, você pode usar o chat da Carmelita."],
      ["E se minhas carteiras não estiverem prontas?", "Confira o estado de cada rede com a mesma conta. A preparação pode estar parcial ou uma rede pode não responder ainda. Se aparecer Tentar novamente, use esse botão; criar outra identidade geraria uma conta diferente."],
      ["O que minha atividade inclui?", "Inclui eventos recentes que a Carmelita registrou para sua conta, com resumos e datas. Não é um histórico completo de transações onchain; use os exploradores para conferir mais detalhes de cada rede."],
      ["O que significa que a Stellar está ativa?", "A ativação só aparece como concluída após a confirmação da Stellar Testnet. A Carmelita tenta ativá-la automaticamente com XLM de teste; se a rede não responder, pode ficar pendente. XLM é o ativo nativo e não precisa de uma trustline. Outros ativos têm requisitos próprios."],
      ["Quais redes posso consultar?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia e BNB Testnet. As três redes EVM compartilham um endereço; cada uma tem seu próprio saldo e atividade. Ter um endereço não significa ter fundos em todas as redes."],
      ["E se uma consulta retornar dados incompletos?", "Confira a fonte e o aviso da resposta. Uma consulta pode ficar parcial quando o provedor está indisponível. Você pode tentar novamente; um preço que falta não equivale a zero e uma função listada não garante que seu provedor esteja operando."],
    ],
    advanced: "Quero conferir os detalhes técnicos",
    advancedText: "A conexão usa agent:read para consultas de leitura. Não autoriza pagamentos nem execução de serviços. O financiamento de outros ativos, as trustlines e os depósitos têm requisitos específicos; ficam fora deste fluxo.",
    developers: "Documentação para desenvolvedores",
    financeDocs: "Documentação técnica de DeFindex Testnet",
  },
};

export default function GuideClient() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <PublicPageShell locale={locale} onLocaleChange={setLocale} active="guide">
      <header className={styles.hero}>
        <div className={styles.intro}>
          <h1 className={styles.heroTitle}>{t.title}</h1>
          <p className={styles.lede}>{t.lede}</p>
          <div className={styles.actions}>
            <Link href="/connect-chatgpt" className={styles.primary}>
              <span>{t.connect}</span><span className={styles.badge}>{t.recommended}</span>
            </Link>
            <Link href="/agent?connect=privy" className={styles.secondary}>{t.web}</Link>
          </div>
        </div>
        <aside className={styles.heroAside} aria-label={t.example}>
          <div className={styles.visualCard}>
            <p className={styles.kicker}>{t.example}</p>
            <blockquote className={styles.prompt}>{t.question}</blockquote>
            <h2 className={styles.panelTitle}>{t.exampleTitle}</h2>
            <ul className={styles.list}>{t.exampleItems.map(item => <li key={item}>{item}</li>)}</ul>
            <p className={styles.muted}>{t.exampleNote}</p>
          </div>
        </aside>
      </header>

      <section id="chatgpt" className={styles.section} aria-labelledby="guide-start">
        <div className={styles.sectionHead}>
          <h2 id="guide-start">{t.startTitle}</h2><p>{t.startText}</p>
        </div>
        <ol className={styles.steps} role="list">
          {t.steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div className={styles.stepBody}><h3>{title}</h3><p>{description}</p></div>
            </li>
          ))}
        </ol>
        <Link href="/connect-chatgpt" className={styles.textLink}>{t.readGuide}</Link>
      </section>

      <section className={styles.section} aria-labelledby="guide-web">
        <div className={styles.sectionHead}>
          <h2 id="guide-web">{t.webTitle}</h2><p>{t.webText}</p>
        </div>
        <Link href="/agent?connect=privy" className={styles.textLink}>{t.web}</Link>
      </section>

      <section id="queries" className={styles.section} aria-labelledby="guide-examples">
        <div className={styles.sectionHead}>
          <h2 id="guide-examples">{t.examplesTitle}</h2><p>{t.webNote}</p>
        </div>
        <div className={styles.columns}>
          {t.examples.map(([title, description, command]) => (
            <article className={styles.panel} key={title}>
              <h3 className={styles.panelTitle}>{title}</h3><p>{description}</p>
              <Link href={"/agent?draft=" + encodeURIComponent(command)} className={styles.textLink}>{t.draft}</Link>
              <details className={styles.disclosure}>
                <summary>{t.command}</summary>
                <pre className={styles.codeBlock}><code>{command}</code></pre>
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="guide-help">
        <div className={styles.sectionHead}>
          <h2 id="guide-help">{t.helpTitle}</h2><p>{t.helpText}</p>
        </div>
        {t.questions.map(([question, answer]) => (
          <details className={styles.disclosure} key={question}><summary>{question}</summary><p>{answer}</p></details>
        ))}
        <details className={styles.disclosure}>
          <summary>{t.advanced}</summary><p>{t.advancedText}</p>
          <div className={styles.inlineLinks}>
            <Link href="/developers#quickstart">{t.developers}</Link>
            <a href="https://github.com/CaBsCrypto/carmelita/blob/main/docs/defindex-testnet.md" target="_blank" rel="noreferrer">{t.financeDocs}</a>
          </div>
        </details>
      </section>
    </PublicPageShell>
  );
}
