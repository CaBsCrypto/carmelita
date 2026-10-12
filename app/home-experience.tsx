"use client";

import Link from "next/link";
import { useRef } from "react";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./home-experience.module.css";

const copy = {
  es: {
    home: "Inicio de Carmelita", footerNav: "Enlaces de Carmelita", skip: "Ir al contenido", guide: "Guía de conexión", developers: "Desarrolladores",
    title: "Carmelita,", titleEnd: "tu agente personal en ChatGPT.",
    description: "Conecta tu cuenta y consulta tu información desde una conversación.",
    connect: "Conectar Carmelita con ChatGPT", recommended: "Recomendado", signIn: "Iniciar sesión en Carmelita",
    scope: "Primer caso de uso: Stellar Testnet.",
    example: "Ejemplo ilustrativo · Stellar Testnet", conversationTitle: "En ChatGPT",
    question: "¿Qué puedo consultar de mi cuenta Stellar?", answer: "Tu dirección, la activación en la red y tu saldo XLM.",
    explorerHint: "También puedes abrir el explorador de Stellar Testnet.",
    preview: "Tus datos aparecen después de autorizar. Los fondos de este ejemplo son de prueba.",
    benefitsTitle: "Un agente vinculado a tu identidad", usageGuide: "Guía de uso",
    benefits: [
      ["Una cuenta tuya", "Accede a la información vinculada a la identidad que autorizas."],
      ["Permisos claros", "El acceso se limita a los permisos que revisas y autorizas."],
      ["Desde tu conversación", "Utiliza Carmelita en ChatGPT y pregunta con tus propias palabras."],
    ],
    stellarLabel: "Nuestro primer caso de uso", stellarTitle: "Empezamos con Stellar.",
    stellarQuestion: "«¿Está activa mi cuenta Stellar Testnet?»",
    stellarDescription: "El primer recorrido vincula tu identidad con una cuenta Stellar Testnet. Consulta su registro, activación y saldo XLM. La activación se confirma en la red y los fondos de este ejemplo son de prueba.",
    stellarReply: "Puedo consultar el registro y el estado de activación de tu cuenta en la red.",
    stellarNote: "La cuenta sólo aparece activa tras confirmación de Stellar. Si la red no responde, el estado puede quedar pendiente.",
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
    development: "Nuestra visión · En desarrollo", visionTitle: "Tus aplicaciones, en una misma conversación.",
    vision: "Queremos que puedas conectar las aplicaciones y los servicios que usas a Carmelita, con una misma identidad y permisos claros.",
    visionStatus: "Estamos desarrollando esa pasarela con empresas y desarrolladores. Cada integración debe validarse antes de ofrecerse; las compras y la ejecución de servicios siguen pendientes.",
    visionLink: "Conocer la integración piloto", footer: "Construida en Latinoamérica.",
    visionFlow: ["Aplicaciones y servicios", "Carmelita", "ChatGPT"], visionFlowLabel: "Visión de integración en desarrollo: aplicaciones y servicios, Carmelita y ChatGPT",
    closingTitle: "Tu primera conversación empieza aquí.", closingDescription: "Abre la guía, añade Carmelita y empieza por tu cuenta Stellar Testnet.",
  },
  en: {
    home: "Carmelita home", footerNav: "Carmelita links", skip: "Skip to content", guide: "Connection guide", developers: "Developers",
    title: "Carmelita,", titleEnd: "your personal agent in ChatGPT.",
    description: "Connect your account and check your information from a conversation.",
    connect: "Connect Carmelita with ChatGPT", recommended: "Recommended", signIn: "Sign in to Carmelita",
    scope: "First use case: Stellar Testnet.",
    example: "Illustrative example · Stellar Testnet", conversationTitle: "In ChatGPT",
    question: "What can I check about my Stellar account?", answer: "Your address, activation on the network and your XLM balance.",
    explorerHint: "You can also open the Stellar Testnet explorer.",
    preview: "Your data appears after authorization. Funds in this example are test funds.",
    benefitsTitle: "An agent linked to your identity", usageGuide: "User guide",
    benefits: [
      ["Your own account", "Access information linked to the identity you authorize."],
      ["Clear permissions", "Access is limited to the permissions you review and authorize."],
      ["From your conversation", "Use Carmelita in ChatGPT and ask in your own words."],
    ],
    stellarLabel: "Our first use case", stellarTitle: "We start with Stellar.",
    stellarQuestion: "“Is my Stellar Testnet account active?”",
    stellarDescription: "The first flow links your identity to a Stellar Testnet account. Check its registration, activation and XLM balance. Activation is confirmed on the network, and funds in this example are test funds.",
    stellarReply: "I can check your account’s registration and activation status on the network.",
    stellarNote: "The account is shown as active only after Stellar confirms it. If the network does not respond, its status may remain pending.",
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
    development: "Our vision · In development", visionTitle: "Your applications, in one conversation.",
    vision: "We want you to connect the applications and services you use to Carmelita, with one identity and clear permissions.",
    visionStatus: "We are developing this gateway with businesses and developers. Each integration must be validated before it is offered; purchases and service execution are still pending.",
    visionLink: "Learn about the integration pilot", footer: "Built in Latin America.",
    visionFlow: ["Applications and services", "Carmelita", "ChatGPT"], visionFlowLabel: "Integration vision in development: applications and services, Carmelita and ChatGPT",
    closingTitle: "Your first conversation starts here.", closingDescription: "Open the guide, add Carmelita and start with your Stellar Testnet account.",
  },
  pt: {
    home: "Início da Carmelita", footerNav: "Links da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de conexão", developers: "Desenvolvedores",
    title: "Carmelita,", titleEnd: "seu agente pessoal no ChatGPT.",
    description: "Conecte sua conta e consulte suas informações em uma conversa.",
    connect: "Conectar a Carmelita ao ChatGPT", recommended: "Recomendado", signIn: "Entrar na Carmelita",
    scope: "Primeiro caso de uso: Stellar Testnet.",
    example: "Exemplo ilustrativo · Stellar Testnet", conversationTitle: "No ChatGPT",
    question: "O que posso consultar sobre minha conta Stellar?", answer: "Seu endereço, a ativação na rede e seu saldo XLM.",
    explorerHint: "Você também pode abrir o explorador da Stellar Testnet.",
    preview: "Seus dados aparecem após a autorização. Os fundos deste exemplo são de teste.",
    benefitsTitle: "Um agente vinculado à sua identidade", usageGuide: "Guia de uso",
    benefits: [
      ["Uma conta sua", "Acesse as informações vinculadas à identidade que autoriza."],
      ["Permissões claras", "O acesso se limita às permissões que você confere e autoriza."],
      ["Na sua conversa", "Use a Carmelita no ChatGPT e pergunte com suas próprias palavras."],
    ],
    stellarLabel: "Nosso primeiro caso de uso", stellarTitle: "Começamos com Stellar.",
    stellarQuestion: "“Minha conta Stellar Testnet está ativa?”",
    stellarDescription: "O primeiro fluxo vincula sua identidade a uma conta Stellar Testnet. Consulte seu registro, ativação e saldo XLM. A ativação é confirmada na rede e os fundos deste exemplo são de teste.",
    stellarReply: "Posso consultar o registro e o estado de ativação da sua conta na rede.",
    stellarNote: "A conta só aparece ativa após a confirmação da Stellar. Se a rede não responder, o estado pode ficar pendente.",
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
    development: "Nossa visão · Em desenvolvimento", visionTitle: "Seus aplicativos, em uma mesma conversa.",
    vision: "Queremos que você conecte os aplicativos e serviços que usa à Carmelita, com uma mesma identidade e permissões claras.",
    visionStatus: "Estamos desenvolvendo essa plataforma com empresas e desenvolvedores. Cada integração deve ser validada antes de ser oferecida; compras e execução de serviços ainda estão pendentes.",
    visionLink: "Conhecer a integração piloto", footer: "Criada na América Latina.",
    visionFlow: ["Aplicativos e serviços", "Carmelita", "ChatGPT"], visionFlowLabel: "Visão de integração em desenvolvimento: aplicativos e serviços, Carmelita e ChatGPT",
    closingTitle: "Sua primeira conversa começa aqui.", closingDescription: "Abra o guia, adicione a Carmelita e comece pela sua conta Stellar Testnet.",
  },
};

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
      <section className={styles.stellarUse} aria-labelledby="home-stellar-title">
        <div className={styles.stellarIntro}>
          <p className={styles.sectionKicker}>{t.stellarLabel}</p>
          <h2 id="home-stellar-title">{t.stellarTitle}</h2>
          <p className={styles.stellarDescription}>{t.stellarDescription}</p>
          <Link href="/guide#chatgpt" className={styles.textLink}>{t.usageGuide}</Link>
        </div>
        <div className={styles.stellarConversation}>
          <p className={styles.stellarCaption}>{t.example}</p>
          <blockquote className={styles.stellarQuestion}>{t.stellarQuestion}</blockquote>
          <span className={styles.replyIdentity}>Carmelita</span>
          <p className={styles.stellarReply}>{t.stellarReply}</p>
          <p className={styles.stellarNote}>{t.stellarNote}</p>
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
          <p className={styles.visionIntro}>{t.vision}</p>
          <Link href="/developers" className={styles.textLink}>{t.visionLink}</Link>
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
