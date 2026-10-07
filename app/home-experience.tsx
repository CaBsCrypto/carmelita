"use client";

import Link from "next/link";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./home-experience.module.css";

const copy = {
  es: {
    home: "Inicio de Carmelita", guide: "Guía", developers: "Desarrolladores", enter: "Abrir Carmelita", skip: "Ir al contenido",
    title: "Tus billeteras y servicios, en una conversación.",
    description: "Conecta Carmelita con ChatGPT para consultar tus billeteras y tu historial. Explora los servicios publicados en Bazaar y conoce qué está disponible hoy.",
    connect: "Conectar Carmelita con ChatGPT", explore: "Explorar servicios",
    badges: ["Billeteras Testnet", "Mercado Mainnet · consultas", "Catálogo Bazaar"],
    example: "Ejemplo de consulta", question: "¿Cuáles son mis cinco redes?",
    answer: "Puedes consultar tus direcciones y abrir el explorador de cada red.",
    preview: "Ejemplo ilustrativo. Tus direcciones aparecen al ingresar con tu cuenta.",
    stepsTitle: "De tu cuenta a la conversación.",
    steps: [
      ["Ingresa a Carmelita", "Crea tu acceso con tu correo o ingresa con tu cuenta para consultar tus propias billeteras."],
      ["Autoriza la conexión", "Sigue la guía de ChatGPT. La conexión depende de las opciones de tu cuenta o espacio de trabajo."],
      ["Pregunta y descubre", "Consulta tus billeteras, recupera tu historial y descubre las fichas de servicios de Bazaar."],
    ],
    boundary: "Los fondos de las billeteras son Testnet. Los precios y datos de mercado son consultas Mainnet. La compra de servicios desde ChatGPT sigue pendiente de validación.",
    footer: "Carmelita · construida en Latinoamérica",
  },
  en: {
    home: "Carmelita home", guide: "Guide", developers: "Developers", enter: "Open Carmelita", skip: "Skip to content",
    title: "Your wallets and services, in one conversation.",
    description: "Connect Carmelita with ChatGPT to check your wallets and your history. Explore the services published in Bazaar and see what is available today.",
    connect: "Connect Carmelita with ChatGPT", explore: "Explore services",
    badges: ["Testnet wallets", "Mainnet market · queries", "Bazaar catalog"],
    example: "Example query", question: "What are my five networks?",
    answer: "You can check your addresses and open each network's explorer.",
    preview: "Illustrative example. Your addresses appear after you sign in with your account.",
    stepsTitle: "From your account to the conversation.",
    steps: [
      ["Sign in to Carmelita", "Create access with your email or sign in with your account to check your own wallets."],
      ["Authorize the connection", "Follow the ChatGPT guide. Connecting depends on the options in your account or workspace."],
      ["Ask and discover", "Check your wallets, recover your history and discover Bazaar service listings."],
    ],
    boundary: "Wallet funds are Testnet funds. Prices and market data are Mainnet queries. Buying services from ChatGPT is still awaiting validation.",
    footer: "Carmelita · built in Latin America",
  },
  pt: {
    home: "Início da Carmelita", guide: "Guia", developers: "Desenvolvedores", enter: "Abrir a Carmelita", skip: "Ir para o conteúdo",
    title: "Suas carteiras e serviços, em uma conversa.",
    description: "Conecte a Carmelita ao ChatGPT para consultar suas carteiras e seu histórico. Explore os serviços publicados no Bazaar e veja o que está disponível hoje.",
    connect: "Conectar a Carmelita ao ChatGPT", explore: "Explorar serviços",
    badges: ["Carteiras Testnet", "Mercado Mainnet · consultas", "Catálogo Bazaar"],
    example: "Exemplo de consulta", question: "Quais são minhas cinco redes?",
    answer: "Você pode consultar seus endereços e abrir o explorador de cada rede.",
    preview: "Exemplo ilustrativo. Seus endereços aparecem ao entrar com sua conta.",
    stepsTitle: "Da sua conta à conversa.",
    steps: [
      ["Entre na Carmelita", "Crie seu acesso com seu e-mail ou entre com sua conta para consultar suas próprias carteiras."],
      ["Autorize a conexão", "Siga o guia do ChatGPT. A conexão depende das opções da sua conta ou espaço de trabalho."],
      ["Pergunte e descubra", "Consulte suas carteiras, recupere seu histórico e descubra as fichas de serviços do Bazaar."],
    ],
    boundary: "Os fundos das carteiras são Testnet. Preços e dados de mercado são consultas Mainnet. A compra de serviços pelo ChatGPT ainda aguarda validação.",
    footer: "Carmelita · criada na América Latina",
  },
};

const networks = ["Avalanche Fuji", "Base Sepolia", "BNB Testnet", "Solana Devnet", "Stellar Testnet"];

export default function HomeExperience() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
      <a className={styles.skipLink} href="#home-content">{t.skip}</a>
      <nav className={styles.nav} aria-label={t.home}>
        <Link href="/" className={styles.brand} aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.navActions}>
          <Link href="/agent">{t.enter}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
        </div>
      </nav>

      <section id="home-content" className={styles.hero} aria-labelledby="home-title" tabIndex={-1}>
        <div className={styles.intro}>
          <h1 id="home-title">{t.title}</h1>
          <p className={styles.description}>{t.description}</p>
          <div className={styles.actions}>
            <Link href="/connect-chatgpt" className={styles.primary}>{t.connect}</Link>
            <Link href="/services" className={styles.secondary}>{t.explore}</Link>
          </div>
          <ul className={styles.badges} aria-label={t.explore}>
            {t.badges.map(badge => <li key={badge}>{badge}</li>)}
          </ul>
        </div>

        <aside className={styles.conversation} aria-label={t.example}>
          <header><BrandLockup /><span>{t.example}</span></header>
          <p className={styles.question}>{t.question}</p>
          <p className={styles.answer}>{t.answer}</p>
          <ul className={styles.networks}>
            {networks.map(network => <li key={network}><span aria-hidden="true" />{network}</li>)}
          </ul>
          <p className={styles.previewNote}>{t.preview}</p>
        </aside>
      </section>

      <section className={styles.steps} aria-labelledby="home-steps-title">
        <h2 id="home-steps-title">{t.stepsTitle}</h2>
        <ol>
          {t.steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </li>
          ))}
        </ol>
        <p className={styles.boundary}>{t.boundary}</p>
      </section>

      <footer className={styles.footer}>
        <p>{t.footer}</p>
        <nav aria-label={t.footer}>
          <Link href="/guide">{t.guide}</Link>
          <Link href="/developers">{t.developers}</Link>
        </nav>
      </footer>
    </main>
  );
}
