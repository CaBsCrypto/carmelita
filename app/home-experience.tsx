"use client";

import Link from "next/link";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./home-experience.module.css";

const copy = {
  es: {
    home: "Inicio de Carmelita", footerNav: "Enlaces de Carmelita", skip: "Ir al contenido", guide: "Guía de conexión", developers: "Desarrolladores",
    title: "Tus wallets,", titleEnd: "en ChatGPT.",
    description: "Conecta Carmelita y consulta las direcciones de tus wallets en cinco redes de prueba, desde una conversación.",
    connect: "Conectar Carmelita con ChatGPT", recommended: "Recomendado", signIn: "Iniciar sesión en Carmelita",
    alternative: "También puedes entrar directamente", scope: "Wallets Testnet y Devnet. Fondos de prueba.",
    example: "Ejemplo ilustrativo", question: "Muéstrame mis wallets", answer: "Estas son tus cinco redes de prueba.",
    address: "Ejemplo de dirección", preview: "Vista ilustrativa. Al conectar, consultas las direcciones asociadas a tu cuenta.",
    benefits: [
      ["Pregunta con tus palabras", "Consulta tus direcciones sin cambiar de conversación."],
      ["Encuentra tus wallets", "Revisa las wallets de la cuenta que autorizas y abre sus exploradores."],
      ["Empieza en redes de prueba", "Conoce el recorrido con Testnet y Devnet antes de usar fondos reales."],
    ],
    stepsTitle: "De la conexión a tu primera pregunta.", stepsIntro: "La guía te acompaña. La conexión se añade manualmente en ChatGPT.",
    steps: [
      ["Abre la guía", "Copia la URL de Carmelita y abre la sección de conectores de ChatGPT."],
      ["Añade Carmelita y autoriza", "Crea tu cuenta Carmelita o inicia sesión durante la autorización. Revisa los permisos antes de aceptar."],
      ["Pregunta por tus wallets", "Habilita Carmelita en una conversación y escribe: «Muéstrame mis wallets»."],
    ],
    stepsLink: "Abrir la guía paso a paso",
    faqTitle: "Antes de conectar.", faqIntro: "Lo que necesitas saber para empezar con tu cuenta.",
    faqs: [
      ["¿Necesito crear una cuenta Carmelita antes?", "Puedes crear tu cuenta Carmelita o iniciar sesión durante la autorización desde ChatGPT. Si ya tienes cuenta, utiliza la misma identidad para conservar tus wallets."],
      ["¿Funciona con cualquier cuenta de ChatGPT?", "Tu cuenta debe permitir conectores MCP personalizados. La disponibilidad depende de tu cuenta y de las políticas de tu espacio de trabajo. Crear una cuenta ChatGPT no garantiza ese permiso; la guía explica cómo comprobarlo."],
      ["¿Mis wallets se preparan al conectar?", "La autorización prepara tus wallets para las cinco redes de prueba. Stellar intenta activarse automáticamente con XLM Testnet y sólo aparece activa cuando la red lo confirma. Si la red no responde, la activación puede quedar pendiente. Las otras redes no se financian automáticamente."],
      ["¿Por qué tres redes comparten una dirección?", "Avalanche Fuji, Base Sepolia y BNB Testnet utilizan la misma dirección EVM. Cada red mantiene su propio saldo y actividad. Solana Devnet y Stellar Testnet tienen sus propias direcciones."],
      ["¿Estos fondos tienen valor real?", "Las wallets de este recorrido usan Testnet o Devnet. Sus fondos sirven para pruebas y no se convierten en fondos Mainnet. XLM es el activo nativo de Stellar y no necesita una trustline."],
    ],
    development: "En desarrollo", visionTitle: "Más servicios, una misma conexión.",
    vision: "Estamos preparando Carmelita como una pasarela para conectar servicios de empresas y desarrolladores con los asistentes. Bazaar, las compras y la ejecución de servicios siguen pendientes de validación.",
    visionLink: "Conocer la integración piloto", footer: "Construida en Latinoamérica.",
  },
  en: {
    home: "Carmelita home", footerNav: "Carmelita links", skip: "Skip to content", guide: "Connection guide", developers: "Developers",
    title: "Your wallets,", titleEnd: "in ChatGPT.",
    description: "Connect Carmelita and check your wallet addresses across five test networks, from a conversation.",
    connect: "Connect Carmelita with ChatGPT", recommended: "Recommended", signIn: "Sign in to Carmelita",
    alternative: "You can also sign in directly", scope: "Testnet and Devnet wallets. Test funds.",
    example: "Illustrative example", question: "Show me my wallets", answer: "Here are your five test networks.",
    address: "Example address", preview: "Illustrative view. Once connected, you can check the addresses associated with your account.",
    benefits: [
      ["Ask in your own words", "Check your addresses without leaving the conversation."],
      ["Find your wallets", "View the wallets of the account you authorize and open their explorers."],
      ["Start on test networks", "Learn the flow with Testnet and Devnet before using real funds."],
    ],
    stepsTitle: "From connecting to your first question.", stepsIntro: "The guide walks you through it. You add the connection manually in ChatGPT.",
    steps: [
      ["Open the guide", "Copy Carmelita’s URL and open the connectors section in ChatGPT."],
      ["Add Carmelita and authorize", "Create your Carmelita account or sign in during authorization. Review the permissions before accepting."],
      ["Ask about your wallets", "Enable Carmelita in a conversation and type: “Show me my wallets”."],
    ],
    stepsLink: "Open the step-by-step guide",
    faqTitle: "Before you connect.", faqIntro: "What you need to know to get started with your account.",
    faqs: [
      ["Do I need a Carmelita account first?", "You can create your Carmelita account or sign in during authorization from ChatGPT. If you already have an account, use the same identity to keep your wallets."],
      ["Does it work with every ChatGPT account?", "Your account must allow custom MCP connectors. Availability depends on your account and workspace policies. Creating a ChatGPT account does not guarantee this permission; the guide explains how to check."],
      ["Are my wallets prepared when I connect?", "Authorization prepares your wallets for the five test networks. Stellar attempts automatic activation with Testnet XLM and is shown as active only after network confirmation. If the network does not respond, activation may remain pending. The other networks are not automatically funded."],
      ["Why do three networks share an address?", "Avalanche Fuji, Base Sepolia and BNB Testnet use the same EVM address. Each network keeps its own balance and activity. Solana Devnet and Stellar Testnet have their own addresses."],
      ["Do these funds have real value?", "The wallets in this flow use Testnet or Devnet. Their funds are for testing and do not become Mainnet funds. XLM is Stellar’s native asset and does not need a trustline."],
    ],
    development: "In development", visionTitle: "More services, one connection.",
    vision: "We are preparing Carmelita as a gateway connecting services from businesses and developers with assistants. Bazaar, purchases and service execution are still awaiting validation.",
    visionLink: "Learn about the integration pilot", footer: "Built in Latin America.",
  },
  pt: {
    home: "Início da Carmelita", footerNav: "Links da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de conexão", developers: "Desenvolvedores",
    title: "Suas carteiras,", titleEnd: "no ChatGPT.",
    description: "Conecte a Carmelita e consulte os endereços das suas carteiras em cinco redes de teste, a partir de uma conversa.",
    connect: "Conectar a Carmelita ao ChatGPT", recommended: "Recomendado", signIn: "Entrar na Carmelita",
    alternative: "Você também pode entrar diretamente", scope: "Carteiras Testnet e Devnet. Fundos de teste.",
    example: "Exemplo ilustrativo", question: "Mostre minhas carteiras", answer: "Estas são suas cinco redes de teste.",
    address: "Exemplo de endereço", preview: "Vista ilustrativa. Ao conectar, você consulta os endereços associados à sua conta.",
    benefits: [
      ["Pergunte com suas palavras", "Consulte seus endereços sem sair da conversa."],
      ["Encontre suas carteiras", "Confira as carteiras da conta que autoriza e abra seus exploradores."],
      ["Comece em redes de teste", "Conheça o fluxo com Testnet e Devnet antes de usar fundos reais."],
    ],
    stepsTitle: "Da conexão à sua primeira pergunta.", stepsIntro: "O guia acompanha você. A conexão é adicionada manualmente no ChatGPT.",
    steps: [
      ["Abra o guia", "Copie a URL da Carmelita e abra a seção de conectores do ChatGPT."],
      ["Adicione a Carmelita e autorize", "Crie sua conta Carmelita ou entre durante a autorização. Confira as permissões antes de aceitar."],
      ["Pergunte pelas suas carteiras", "Ative a Carmelita em uma conversa e escreva: “Mostre minhas carteiras”."],
    ],
    stepsLink: "Abrir o guia passo a passo",
    faqTitle: "Antes de conectar.", faqIntro: "O que você precisa saber para começar com sua conta.",
    faqs: [
      ["Preciso criar uma conta Carmelita antes?", "Você pode criar sua conta Carmelita ou entrar durante a autorização pelo ChatGPT. Se já tem uma conta, use a mesma identidade para manter suas carteiras."],
      ["Funciona com qualquer conta do ChatGPT?", "Sua conta precisa permitir conectores MCP personalizados. A disponibilidade depende da conta e das políticas do espaço de trabalho. Criar uma conta ChatGPT não garante essa permissão; o guia explica como verificar."],
      ["Minhas carteiras são preparadas ao conectar?", "A autorização prepara suas carteiras para as cinco redes de teste. A Stellar tenta ativar-se automaticamente com XLM Testnet e só aparece ativa após confirmação da rede. Se a rede não responder, a ativação pode ficar pendente. As demais redes não recebem fundos automaticamente."],
      ["Por que três redes compartilham um endereço?", "Avalanche Fuji, Base Sepolia e BNB Testnet usam o mesmo endereço EVM. Cada rede mantém seu próprio saldo e atividade. Solana Devnet e Stellar Testnet têm seus próprios endereços."],
      ["Esses fundos têm valor real?", "As carteiras deste fluxo usam Testnet ou Devnet. Seus fundos servem para testes e não se tornam fundos Mainnet. XLM é o ativo nativo da Stellar e não precisa de uma trustline."],
    ],
    development: "Em desenvolvimento", visionTitle: "Mais serviços, uma mesma conexão.",
    vision: "Estamos preparando a Carmelita como uma plataforma para conectar serviços de empresas e desenvolvedores aos assistentes. Bazaar, compras e execução de serviços ainda aguardam validação.",
    visionLink: "Conhecer a integração piloto", footer: "Criada na América Latina.",
  },
};

const networks = [
  { name: "Avalanche Fuji", symbol: "A", family: "evm", example: "0x…" },
  { name: "Base Sepolia", symbol: "B", family: "evm", example: "0x…" },
  { name: "BNB Testnet", symbol: "B", family: "evm", example: "0x…" },
  { name: "Solana Devnet", symbol: "S", family: "solana", example: "…" },
  { name: "Stellar Testnet", symbol: "S", family: "stellar", example: "G…" },
];

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
              <ul className={styles.networks}>
                {networks.map(network => (
                  <li key={network.name}>
                    <span className={styles.networkSymbol + " " + styles[network.family]} aria-hidden="true">{network.symbol}</span>
                    <span>{network.name}</span>
                    <span className={styles.address} aria-label={t.address}>{network.example}</span>
                  </li>
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
