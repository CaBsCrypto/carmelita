"use client";

import Link from "next/link";
import { useLocale } from "../language-toggle";
import PublicPageShell from "../public-page-shell";
import styles from "../public-pages.module.css";

const commands = {
  wallets: "/consulta personal.wallets {}",
  market: '/consulta offchain.market.quote {"assets":[{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}',
  functions: "/consulta offchain.capabilities.list {}",
};

const copy = {
  es: {
    title: "Tu primera conversación con Carmelita.",
    lede: "Conecta Carmelita con ChatGPT, autoriza tu cuenta y pregunta por tu información. Empieza con Stellar Testnet.",
    connect: "Conectar con ChatGPT", recommended: "Recomendado", web: "Usar el chat de Carmelita",
    example: "Tu primera consulta", question: "¿Está activa mi cuenta Stellar Testnet?",
    exampleTitle: "Una cuenta tuya. Una respuesta útil.",
    exampleItems: ["Registro de tu cuenta", "Estado de activación en la red", "Saldo XLM y enlace al explorador"],
    exampleNote: "Ejemplo ilustrativo. Tus datos aparecen después de autorizar; la activación se confirma en Stellar.",
    startTitle: "De la conexión a tu primera consulta.",
    startText: "Puedes crear tu cuenta Carmelita o iniciar sesión durante la autorización. No necesitas prepararla antes en otra pestaña.",
    steps: [
      ["Abre la guía de conexión", "Copia la URL de Carmelita y añádela manualmente en los conectores de ChatGPT. Tu cuenta debe permitir conectores personalizados."],
      ["Autoriza tu cuenta", "Crea tu cuenta Carmelita o usa tu identidad existente. Revisa los permisos antes de aceptar; una cuenta existente conserva sus direcciones."],
      ["Empieza por Stellar", "Habilita Carmelita en una conversación y pregunta: «¿Está activa mi cuenta Stellar Testnet?». Revisa la respuesta y abre el explorador si quieres comprobarla."],
    ],
    readGuide: "Abrir la guía de conexión",
    webTitle: "También puedes conversar aquí.",
    webText: "El chat de Carmelita es otra forma de consultar tu cuenta. Inicia sesión con la misma identidad para acceder a las wallets que ya tienes.",
    webNote: "Los siguientes ejemplos abren un borrador en el chat de Carmelita. Revísalo y envíalo cuando quieras: abrirlo no ejecuta la consulta.",
    examplesTitle: "Consultas que puedes probar.",
    examples: [
      ["Tus wallets", "Consulta las direcciones y el estado de registro. Empieza por Stellar Testnet y revisa las otras cuatro redes de prueba.", commands.wallets],
      ["Datos de mercado", "Prueba una consulta de SOL, AVAX o BNB. Comprueba la fuente, la fecha y cualquier resultado parcial; son datos Mainnet separados de tus fondos de prueba.", commands.market],
      ["Consultas disponibles", "Revisa las funciones que Carmelita tiene implementadas y su disponibilidad. Cada consulta depende de sus permisos, conexión y fuente.", commands.functions],
    ],
    draft: "Abrir como borrador", command: "Ver comando",
    helpTitle: "Si algo queda pendiente.",
    helpText: "Mantén la misma identidad y comprueba qué parte del recorrido falta.",
    questions: [
      ["¿No aparece la opción de añadir Carmelita en ChatGPT?", "La cuenta o el espacio de trabajo debe permitir conectores MCP personalizados. Crear una cuenta ChatGPT no garantiza ese permiso. La guía de conexión explica cómo comprobarlo; mientras tanto, puedes usar el chat de Carmelita."],
      ["¿Qué pasa si mis wallets no están listas?", "Revisa el estado de cada red con tu misma cuenta. La preparación puede ser parcial o una red puede no responder todavía. Si aparece Reintentar, úsalo; crear otra identidad generaría una cuenta distinta."],
      ["¿Qué significa que Stellar está activa?", "La activación se presenta como completada sólo cuando Stellar Testnet la confirma. Carmelita intenta activarla automáticamente con XLM de prueba; si la red no responde, puede quedar pendiente. XLM es el activo nativo y no necesita una trustline. Otros activos tienen requisitos propios."],
      ["¿Qué redes puedo consultar?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia y BNB Testnet. Las tres redes EVM comparten una dirección; cada una mantiene su propio saldo y actividad. Tener una dirección no significa tener fondos en todas las redes."],
      ["¿Qué hago si una consulta devuelve datos incompletos?", "Comprueba la fuente y el aviso de la respuesta. Una consulta puede quedar parcial si su proveedor no está disponible. Puedes reintentar; un precio que falta no equivale a cero y una función listada no garantiza que su proveedor esté operativo."],
    ],
    advanced: "Quiero revisar los detalles técnicos",
    advancedText: "Consulta los comandos y el alcance actual. La financiación de otros activos, las trustlines y los depósitos tienen requisitos específicos; no son parte del recorrido de conexión y lectura.",
    developers: "Documentación para desarrolladores",
    financeDocs: "Documentación técnica de DeFindex Testnet",
  },
  en: {
    title: "Your first conversation with Carmelita.",
    lede: "Connect Carmelita with ChatGPT, authorize your account and ask about your information. Start with Stellar Testnet.",
    connect: "Connect with ChatGPT", recommended: "Recommended", web: "Use Carmelita’s chat",
    example: "Your first query", question: "Is my Stellar Testnet account active?",
    exampleTitle: "Your own account. A useful answer.",
    exampleItems: ["Your account’s registration", "Activation status on the network", "XLM balance and explorer link"],
    exampleNote: "Illustrative example. Your data appears after authorization; activation is confirmed on Stellar.",
    startTitle: "From connecting to your first query.",
    startText: "You can create your Carmelita account or sign in during authorization. You do not need to prepare it in another tab first.",
    steps: [
      ["Open the connection guide", "Copy Carmelita’s URL and add it manually in ChatGPT’s connectors. Your account must allow custom connectors."],
      ["Authorize your account", "Create your Carmelita account or use your existing identity. Review the permissions before accepting; an existing account keeps its addresses."],
      ["Start with Stellar", "Enable Carmelita in a conversation and ask: “Is my Stellar Testnet account active?”. Review the answer and open the explorer if you want to check it."],
    ],
    readGuide: "Open the connection guide",
    webTitle: "You can also chat here.",
    webText: "Carmelita’s chat is another way to query your account. Sign in with the same identity to access the wallets you already have.",
    webNote: "The examples below open a draft in Carmelita’s chat. Review it and send it when ready: opening a draft does not run the query.",
    examplesTitle: "Queries you can try.",
    examples: [
      ["Your wallets", "Check addresses and registration status. Start with Stellar Testnet and review the other four test networks.", commands.wallets],
      ["Market data", "Try querying SOL, AVAX or BNB. Check the source, date and any partial results; this is Mainnet data separate from your test funds.", commands.market],
      ["Available queries", "Review the features Carmelita has implemented and their availability. Each query depends on its permissions, connection and source.", commands.functions],
    ],
    draft: "Open as draft", command: "View command",
    helpTitle: "If something is still pending.",
    helpText: "Keep the same identity and check which part of the flow is missing.",
    questions: [
      ["Can’t find the option to add Carmelita in ChatGPT?", "Your account or workspace must allow custom MCP connectors. Creating a ChatGPT account does not guarantee this permission. The connection guide explains how to check; meanwhile, you can use Carmelita’s chat."],
      ["What if my wallets are not ready?", "Check each network’s status with the same account. Preparation may be partial, or a network may not be responding yet. If you see Retry, use it; creating another identity would create a different account."],
      ["What does an active Stellar account mean?", "Activation is shown as complete only after Stellar Testnet confirms it. Carmelita attempts automatic activation with test XLM; if the network does not respond, it may remain pending. XLM is the native asset and needs no trustline. Other assets have their own requirements."],
      ["Which networks can I query?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia and BNB Testnet. The three EVM networks share an address; each has its own balance and activity. Having an address does not mean having funds on every network."],
      ["What if a query returns incomplete data?", "Check the source and the notice in the response. A query can be partial when its provider is unavailable. You can retry; a missing price is not zero, and a listed feature does not guarantee that its provider is operating."],
    ],
    advanced: "I want to review the technical details",
    advancedText: "Check the commands and current scope. Funding other assets, trustlines and deposits have specific requirements; they are outside the connection and read-only flow.",
    developers: "Developer documentation",
    financeDocs: "DeFindex Testnet technical documentation",
  },
  pt: {
    title: "Sua primeira conversa com a Carmelita.",
    lede: "Conecte a Carmelita ao ChatGPT, autorize sua conta e pergunte sobre suas informações. Comece pela Stellar Testnet.",
    connect: "Conectar ao ChatGPT", recommended: "Recomendado", web: "Usar o chat da Carmelita",
    example: "Sua primeira consulta", question: "Minha conta Stellar Testnet está ativa?",
    exampleTitle: "Uma conta sua. Uma resposta útil.",
    exampleItems: ["Registro da sua conta", "Estado de ativação na rede", "Saldo XLM e link do explorador"],
    exampleNote: "Exemplo ilustrativo. Seus dados aparecem após a autorização; a ativação é confirmada na Stellar.",
    startTitle: "Da conexão à sua primeira consulta.",
    startText: "Você pode criar sua conta Carmelita ou entrar durante a autorização. Não precisa prepará-la antes em outra aba.",
    steps: [
      ["Abra o guia de conexão", "Copie a URL da Carmelita e adicione-a manualmente nos conectores do ChatGPT. Sua conta precisa permitir conectores personalizados."],
      ["Autorize sua conta", "Crie sua conta Carmelita ou use sua identidade existente. Confira as permissões antes de aceitar; uma conta existente mantém seus endereços."],
      ["Comece pela Stellar", "Ative a Carmelita em uma conversa e pergunte: “Minha conta Stellar Testnet está ativa?”. Confira a resposta e abra o explorador se quiser verificá-la."],
    ],
    readGuide: "Abrir o guia de conexão",
    webTitle: "Você também pode conversar aqui.",
    webText: "O chat da Carmelita é outra forma de consultar sua conta. Entre com a mesma identidade para acessar as carteiras que já possui.",
    webNote: "Os exemplos abaixo abrem um rascunho no chat da Carmelita. Revise e envie quando desejar: abrir um rascunho não executa a consulta.",
    examplesTitle: "Consultas que você pode experimentar.",
    examples: [
      ["Suas carteiras", "Consulte endereços e o estado do registro. Comece pela Stellar Testnet e confira as outras quatro redes de teste.", commands.wallets],
      ["Dados de mercado", "Experimente consultar SOL, AVAX ou BNB. Confira a fonte, a data e resultados parciais; são dados Mainnet separados dos seus fundos de teste.", commands.market],
      ["Consultas disponíveis", "Confira as funções que a Carmelita implementou e sua disponibilidade. Cada consulta depende de suas permissões, conexão e fonte.", commands.functions],
    ],
    draft: "Abrir como rascunho", command: "Ver comando",
    helpTitle: "Se algo estiver pendente.",
    helpText: "Mantenha a mesma identidade e confira qual parte do fluxo está faltando.",
    questions: [
      ["Não encontro a opção de adicionar a Carmelita no ChatGPT?", "A conta ou o espaço de trabalho precisa permitir conectores MCP personalizados. Criar uma conta ChatGPT não garante essa permissão. O guia de conexão explica como verificar; enquanto isso, você pode usar o chat da Carmelita."],
      ["E se minhas carteiras não estiverem prontas?", "Confira o estado de cada rede com a mesma conta. A preparação pode estar parcial ou uma rede pode não responder ainda. Se aparecer Tentar novamente, use esse botão; criar outra identidade geraria uma conta diferente."],
      ["O que significa que a Stellar está ativa?", "A ativação só aparece como concluída após a confirmação da Stellar Testnet. A Carmelita tenta ativá-la automaticamente com XLM de teste; se a rede não responder, pode ficar pendente. XLM é o ativo nativo e não precisa de uma trustline. Outros ativos têm requisitos próprios."],
      ["Quais redes posso consultar?", "Stellar Testnet, Solana Devnet, Avalanche Fuji, Base Sepolia e BNB Testnet. As três redes EVM compartilham um endereço; cada uma tem seu próprio saldo e atividade. Ter um endereço não significa ter fundos em todas as redes."],
      ["E se uma consulta retornar dados incompletos?", "Confira a fonte e o aviso da resposta. Uma consulta pode ficar parcial quando o provedor está indisponível. Você pode tentar novamente; um preço que falta não equivale a zero e uma função listada não garante que seu provedor esteja operando."],
    ],
    advanced: "Quero conferir os detalhes técnicos",
    advancedText: "Consulte os comandos e o escopo atual. O financiamento de outros ativos, as trustlines e os depósitos têm requisitos específicos; ficam fora do fluxo de conexão e leitura.",
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

      <section className={styles.section} aria-labelledby="guide-examples">
        <div className={styles.sectionHead}>
          <h2 id="guide-examples">{t.examplesTitle}</h2><p>{t.webNote}</p>
        </div>
        <div className={styles.queryCards}>
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
