"use client";

import Link from "next/link";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./home-experience.module.css";

const copy = {
  es: {
    home: "Inicio de Carmelita", footerNav: "Enlaces de Carmelita", skip: "Ir al contenido", guide: "Guía de conexión", developers: "Desarrolladores",
    title: "Carmelita,", titleEnd: "dentro de ChatGPT.",
    description: "Carmelita es un complemento para consultar tu información y datos Web3 desde ChatGPT. Conecta tu cuenta y pregunta por tus wallets, redes y mercado en la misma conversación.",
    connect: "Conectar Carmelita con ChatGPT", recommended: "Recomendado", signIn: "Iniciar sesión en Carmelita",
    alternative: "También puedes entrar directamente", scope: "Consultas vinculadas a la cuenta que autorizas.",
    example: "Ejemplo ilustrativo", question: "¿Qué puedo consultar con Carmelita?", answer: "Empieza por tu cuenta y el contexto de tus redes.",
    queries: ["Tu wallet Stellar y tus otras wallets", "El estado de tu cuenta en la red", "Información de mercado y redes"],
    preview: "Ejemplo ilustrativo de consultas. Tus datos aparecen después de autorizar.",
    benefits: [
      ["Tu información", "Consulta las wallets asociadas a la cuenta que autorizas."],
      ["El contexto", "Pregunta por precios y redes, con fuentes y disponibilidad."],
      ["Tu conversación", "Pregunta con tus palabras, sin salir de ChatGPT."],
    ],
    stellarLabel: "Empieza con Stellar", stellarTitle: "Una pregunta para conocer tu cuenta.",
    stellarQuestion: "«¿Está activa mi cuenta Stellar Testnet?»",
    stellarDescription: "Carmelita consulta su estado. La activación se confirma en la red; los fondos de este recorrido son de prueba.",
    stepsTitle: "Conecta una vez. Empieza a preguntar.", stepsIntro: "La guía te acompaña. La conexión se añade manualmente en ChatGPT.",
    steps: [
      ["Abre la guía", "Copia la URL de Carmelita y abre la sección de conectores de ChatGPT."],
      ["Añade Carmelita y autoriza", "Crea tu cuenta Carmelita o inicia sesión durante la autorización. Revisa los permisos antes de aceptar."],
      ["Empieza a preguntar", "Habilita Carmelita en una conversación. Puedes empezar con: «¿Está activa mi cuenta Stellar Testnet?»."],
    ],
    stepsLink: "Abrir la guía paso a paso",
    faqTitle: "Antes de conectar.", faqIntro: "Lo que necesitas saber para empezar con tu cuenta.",
    faqs: [
      ["¿Necesito crear una cuenta Carmelita antes?", "Puedes crear tu cuenta Carmelita o iniciar sesión durante la autorización desde ChatGPT. Si ya tienes cuenta, utiliza la misma identidad para conservar tus wallets."],
      ["¿Funciona con cualquier cuenta de ChatGPT?", "Tu cuenta debe permitir conectores MCP personalizados. La disponibilidad depende de tu cuenta y de las políticas de tu espacio de trabajo. Crear una cuenta ChatGPT no garantiza ese permiso; la guía explica cómo comprobarlo."],
      ["¿Mis wallets se preparan al conectar?", "La autorización prepara tus wallets para las cinco redes de prueba. Stellar intenta activarse automáticamente con XLM Testnet y sólo aparece activa cuando la red lo confirma. Si la red no responde, la activación puede quedar pendiente. Las otras redes no se financian automáticamente."],
      ["¿Qué redes puedo consultar?", "Empezamos por Stellar Testnet. También puedes consultar tus wallets en Solana Devnet, Avalanche Fuji, Base Sepolia y BNB Testnet. Las tres redes EVM comparten una dirección; cada red mantiene su propio saldo y actividad."],
      ["¿Son fondos reales o de prueba?", "Las wallets de este recorrido usan Testnet o Devnet. Sus fondos sirven para pruebas y no se convierten en fondos Mainnet. Los datos de mercado se consultan por separado y no dan valor real a los fondos Testnet. XLM es el activo nativo de Stellar y no necesita una trustline."],
    ],
    development: "En desarrollo", visionTitle: "Más servicios, una misma conexión.",
    vision: "Estamos preparando Carmelita como una pasarela para conectar servicios de empresas y desarrolladores con los asistentes. Bazaar, las compras y la ejecución de servicios siguen pendientes de validación.",
    visionLink: "Conocer la integración piloto", footer: "Construida en Latinoamérica.",
  },
  en: {
    home: "Carmelita home", footerNav: "Carmelita links", skip: "Skip to content", guide: "Connection guide", developers: "Developers",
    title: "Carmelita,", titleEnd: "in ChatGPT.",
    description: "Carmelita is a connector for checking your information and Web3 data from ChatGPT. Connect your account and ask about your wallets, networks and markets in the same conversation.",
    connect: "Connect Carmelita with ChatGPT", recommended: "Recommended", signIn: "Sign in to Carmelita",
    alternative: "You can also sign in directly", scope: "Queries linked to the account you authorize.",
    example: "Illustrative example", question: "What can I ask Carmelita about?", answer: "Start with your account and the context of your networks.",
    queries: ["Your Stellar wallet and your other wallets", "Your account’s status on the network", "Market and network information"],
    preview: "Illustrative queries. Your data appears after authorization.",
    benefits: [
      ["Your information", "Check the wallets associated with the account you authorize."],
      ["The context", "Ask about prices and networks, with sources and availability."],
      ["Your conversation", "Ask in your own words, without leaving ChatGPT."],
    ],
    stellarLabel: "Start with Stellar", stellarTitle: "One question to learn about your account.",
    stellarQuestion: "“Is my Stellar Testnet account active?”",
    stellarDescription: "Carmelita checks its status. Activation is confirmed on the network; funds in this flow are test funds.",
    stepsTitle: "Connect once. Start asking.", stepsIntro: "The guide walks you through it. You add the connection manually in ChatGPT.",
    steps: [
      ["Open the guide", "Copy Carmelita’s URL and open the connectors section in ChatGPT."],
      ["Add Carmelita and authorize", "Create your Carmelita account or sign in during authorization. Review the permissions before accepting."],
      ["Start asking", "Enable Carmelita in a conversation. You can start with: “Is my Stellar Testnet account active?”."],
    ],
    stepsLink: "Open the step-by-step guide",
    faqTitle: "Before you connect.", faqIntro: "What you need to know to get started with your account.",
    faqs: [
      ["Do I need a Carmelita account first?", "You can create your Carmelita account or sign in during authorization from ChatGPT. If you already have an account, use the same identity to keep your wallets."],
      ["Does it work with every ChatGPT account?", "Your account must allow custom MCP connectors. Availability depends on your account and workspace policies. Creating a ChatGPT account does not guarantee this permission; the guide explains how to check."],
      ["Are my wallets prepared when I connect?", "Authorization prepares your wallets for the five test networks. Stellar attempts automatic activation with Testnet XLM and is shown as active only after network confirmation. If the network does not respond, activation may remain pending. The other networks are not automatically funded."],
      ["Which networks can I ask about?", "Start with Stellar Testnet. You can also check your wallets on Solana Devnet, Avalanche Fuji, Base Sepolia and BNB Testnet. The three EVM networks share an address; each network keeps its own balance and activity."],
      ["Are these real funds or test funds?", "The wallets in this flow use Testnet or Devnet. Their funds are for testing and do not become Mainnet funds. Market data is queried separately and does not give Testnet funds real value. XLM is Stellar’s native asset and does not need a trustline."],
    ],
    development: "In development", visionTitle: "More services, one connection.",
    vision: "We are preparing Carmelita as a gateway connecting services from businesses and developers with assistants. Bazaar, purchases and service execution are still awaiting validation.",
    visionLink: "Learn about the integration pilot", footer: "Built in Latin America.",
  },
  pt: {
    home: "Início da Carmelita", footerNav: "Links da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de conexão", developers: "Desenvolvedores",
    title: "Carmelita,", titleEnd: "no ChatGPT.",
    description: "A Carmelita é um conector para consultar suas informações e dados Web3 pelo ChatGPT. Conecte sua conta e pergunte sobre suas carteiras, redes e mercado na mesma conversa.",
    connect: "Conectar a Carmelita ao ChatGPT", recommended: "Recomendado", signIn: "Entrar na Carmelita",
    alternative: "Você também pode entrar diretamente", scope: "Consultas vinculadas à conta que você autoriza.",
    example: "Exemplo ilustrativo", question: "O que posso consultar com a Carmelita?", answer: "Comece pela sua conta e pelo contexto das suas redes.",
    queries: ["Sua carteira Stellar e suas outras carteiras", "O estado da sua conta na rede", "Informações de mercado e redes"],
    preview: "Exemplo ilustrativo de consultas. Seus dados aparecem após a autorização.",
    benefits: [
      ["Suas informações", "Consulte as carteiras associadas à conta que autoriza."],
      ["O contexto", "Pergunte sobre preços e redes, com fontes e disponibilidade."],
      ["Sua conversa", "Pergunte com suas palavras, sem sair do ChatGPT."],
    ],
    stellarLabel: "Comece com Stellar", stellarTitle: "Uma pergunta para conhecer sua conta.",
    stellarQuestion: "“Minha conta Stellar Testnet está ativa?”",
    stellarDescription: "A Carmelita consulta o estado da conta. A ativação é confirmada na rede; os fundos deste fluxo são de teste.",
    stepsTitle: "Conecte uma vez. Comece a perguntar.", stepsIntro: "O guia acompanha você. A conexão é adicionada manualmente no ChatGPT.",
    steps: [
      ["Abra o guia", "Copie a URL da Carmelita e abra a seção de conectores do ChatGPT."],
      ["Adicione a Carmelita e autorize", "Crie sua conta Carmelita ou entre durante a autorização. Confira as permissões antes de aceitar."],
      ["Comece a perguntar", "Ative a Carmelita em uma conversa. Você pode começar com: “Minha conta Stellar Testnet está ativa?”."],
    ],
    stepsLink: "Abrir o guia passo a passo",
    faqTitle: "Antes de conectar.", faqIntro: "O que você precisa saber para começar com sua conta.",
    faqs: [
      ["Preciso criar uma conta Carmelita antes?", "Você pode criar sua conta Carmelita ou entrar durante a autorização pelo ChatGPT. Se já tem uma conta, use a mesma identidade para manter suas carteiras."],
      ["Funciona com qualquer conta do ChatGPT?", "Sua conta precisa permitir conectores MCP personalizados. A disponibilidade depende da conta e das políticas do espaço de trabalho. Criar uma conta ChatGPT não garante essa permissão; o guia explica como verificar."],
      ["Minhas carteiras são preparadas ao conectar?", "A autorização prepara suas carteiras para as cinco redes de teste. A Stellar tenta ativar-se automaticamente com XLM Testnet e só aparece ativa após confirmação da rede. Se a rede não responder, a ativação pode ficar pendente. As demais redes não recebem fundos automaticamente."],
      ["Quais redes posso consultar?", "Comece pela Stellar Testnet. Você também pode consultar suas carteiras na Solana Devnet, Avalanche Fuji, Base Sepolia e BNB Testnet. As três redes EVM compartilham um endereço; cada rede mantém seu próprio saldo e atividade."],
      ["São fundos reais ou de teste?", "As carteiras deste fluxo usam Testnet ou Devnet. Seus fundos servem para testes e não se tornam fundos Mainnet. Dados de mercado são consultados separadamente e não dão valor real aos fundos Testnet. XLM é o ativo nativo da Stellar e não precisa de uma trustline."],
    ],
    development: "Em desenvolvimento", visionTitle: "Mais serviços, uma mesma conexão.",
    vision: "Estamos preparando a Carmelita como uma plataforma para conectar serviços de empresas e desenvolvedores aos assistentes. Bazaar, compras e execução de serviços ainda aguardam validação.",
    visionLink: "Conhecer a integração piloto", footer: "Criada na América Latina.",
  },
};

function QueryIcon({ kind }: { kind: number }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === 0 ? <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m0 3h-5v5h5" /><circle cx="18" cy="14.5" r=".7" /></> :
        kind === 1 ? <path d="M2 12h4l3-8 4 16 3-8h6" /> :
          <path d="M4 4v16h16M8 16v-4m4 4V8m4 8V5" />}
    </svg>
  );
}

export default function HomeExperience() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
      <Link className={styles.skipLink} href="#home-content" prefetch={false}>{t.skip}</Link>
      <nav className={styles.nav} aria-label={t.home}>
        <Link href="/" className={styles.brand} aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.navActions}>
          <Link href="/agent?connect=privy" className={styles.navSignIn}>{t.signIn}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
        </div>
      </nav>
      <section id="home-content" className={styles.hero} aria-labelledby="home-title" tabIndex={-1}>
        <div className={styles.intro}>
          <h1 id="home-title">{t.title}<br />{t.titleEnd}</h1>
          <p className={styles.description}>{t.description}</p>
          <div className={styles.actions}>
            <Link href="/connect-chatgpt" className={styles.primary}>
              <span>{t.connect}</span><span className={styles.recommended}>{t.recommended}</span>
            </Link>
            <div className={styles.alternative}>
              <span>{t.alternative}</span><Link href="/agent?connect=privy">{t.signIn}</Link>
            </div>
          </div>
          <p className={styles.scope}><span aria-hidden="true" />{t.scope}</p>
        </div>
        <figure className={styles.demo} aria-label={t.example}>
          <div className={styles.conversation}>
            <header><BrandLockup /><span>{t.example}</span></header>
            <p className={styles.question}>{t.question}</p>
            <div className={styles.response}>
              <p className={styles.answer}>{t.answer}</p>
              <ul className={styles.queryList}>
                {t.queries.map((query, index) => (
                  <li key={query}><QueryIcon kind={index} /><span>{query}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <figcaption className={styles.previewNote}>{t.preview}</figcaption>
        </figure>
      </section>
      <div className={styles.benefits}>
        {t.benefits.map(([title, description]) => (
          <div key={title}><h2>{title}</h2><p>{description}</p></div>
        ))}
      </div>
      <section className={styles.stellarUse} aria-labelledby="home-stellar-title">
        <div>
          <p className={styles.development}><span aria-hidden="true" />{t.stellarLabel}</p>
          <h2 id="home-stellar-title">{t.stellarTitle}</h2>
        </div>
        <div>
          <blockquote className={styles.stellarQuestion}>{t.stellarQuestion}</blockquote>
          <p className={styles.stellarDescription}>{t.stellarDescription}</p>
        </div>
      </section>
      <section className={styles.steps} aria-labelledby="home-steps-title">
        <div className={styles.sectionHeading}>
          <h2 id="home-steps-title">{t.stepsTitle}</h2><p>{t.stepsIntro}</p>
        </div>
        <ol>
          {t.steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <h3>{title}</h3><p>{description}</p>
            </li>
          ))}
        </ol>
        <Link href="/connect-chatgpt" className={styles.textLink}>{t.stepsLink}</Link>
      </section>
      <section className={styles.faq} aria-labelledby="home-faq-title">
        <div className={styles.sectionHeading}>
          <h2 id="home-faq-title">{t.faqTitle}</h2><p>{t.faqIntro}</p>
        </div>
        <div className={styles.faqList}>
          {t.faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>
      <section className={styles.vision} aria-labelledby="home-vision-title">
        <div>
          <p className={styles.development}><span aria-hidden="true" />{t.development}</p>
          <h2 id="home-vision-title">{t.visionTitle}</h2>
        </div>
        <div className={styles.visionBody}>
          <p>{t.vision}</p><Link href="/developers" className={styles.textLink}>{t.visionLink}</Link>
        </div>
      </section>
      <footer className={styles.footer}>
        <div><BrandLockup /><p>{t.footer}</p></div>
        <nav aria-label={t.footerNav}>
          <Link href="/connect-chatgpt">{t.guide}</Link><Link href="/developers">{t.developers}</Link>
        </nav>
      </footer>
    </main>
  );
}
