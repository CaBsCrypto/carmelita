"use client";

import Link from "next/link";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";

const copy = {
  es: {
    home: "Inicio de Carmelita", guide: "Guía", developers: "Desarrolladores", enter: "Abrir el chat",
    title: "Tus billeteras y el mercado,", emphasis: "en una conversación.",
    description: "Consulta tus billeteras, busca precios de tokens y compara redes. Empieza con tu correo y pregunta a Carmelita.",
    start: "Comenzar con Carmelita", how: "Cómo empezar", pilot: "Prueba de registro y consultas · billeteras Testnet",
    example: "Ejemplo de consulta", question: "¿Qué billeteras tengo?", answer: "Tus billeteras se reúnen en un solo lugar, con sus redes y exploradores.",
    families: "3 billeteras · 5 redes", preview: "Ejemplo ilustrativo. Tus direcciones aparecen después de ingresar.",
    questionsTitle: "Empieza por una pregunta.", questionsText: "Elige un ejemplo para dejarlo escrito en el chat. Tú decides cuándo enviarlo.",
    examples: ["Mis billeteras", "Precio de XLM, SOL, AVAX y BNB", "Comparar redes por TVL"],
    marketNote: "Precios y TVL son datos de mercado Mainnet. Cada respuesta indica la fuente y la fecha; los fondos Testnet se consultan por separado.",
    stepsTitle: "Del correo a tu primera consulta.",
    steps: [["Ingresa con Privy", "Usa tu correo y el código de acceso visible. Tu identidad se conserva."], ["Consulta tus billeteras", "Revisa direcciones, redes, estado del registro y exploradores."], ["Explora a tu ritmo", "Abre Funciones desde el chat. Las conexiones que falten te pedirán autorización."]],
    chatgpt: "¿Prefieres ChatGPT?", chatgptText: "El complemento es opcional y usa las mismas consultas de Carmelita. Su conexión requiere autorización; el acceso desde otra cuenta de ChatGPT sigue en validación.",
    chatgptLink: "Ver cómo conectar", footer: "Carmelita · construida en Latinoamérica", feedback: "Una prueba pequeña, una conversación a la vez.",
  },
  en: {
    home: "Carmelita home", guide: "Guide", developers: "Developers", enter: "Open chat",
    title: "Your wallets and the market,", emphasis: "in one conversation.",
    description: "Check your wallets, find token prices and compare networks. Start with your email and ask Carmelita.",
    start: "Start with Carmelita", how: "How to start", pilot: "Registration and query pilot · Testnet wallets",
    example: "Example query", question: "Which wallets do I have?", answer: "Your wallets come together in one place, with their networks and explorers.",
    families: "3 wallets · 5 networks", preview: "Illustrative example. Your addresses appear after signing in.",
    questionsTitle: "Start with a question.", questionsText: "Choose an example to fill the chat composer. You decide when to send it.",
    examples: ["My wallets", "Price of XLM, SOL, AVAX and BNB", "Compare networks by TVL"],
    marketNote: "Prices and TVL are Mainnet market data. Each response shows its source and date; Testnet funds are checked separately.",
    stepsTitle: "From email to your first query.",
    steps: [["Sign in with Privy", "Use your email and the visible access code flow. Your identity stays the same."], ["Check your wallets", "Review addresses, networks, registration status and explorers."], ["Explore at your pace", "Open Features from the chat. Missing connections will ask for authorization."]],
    chatgpt: "Prefer ChatGPT?", chatgptText: "The optional connector uses Carmelita's shared queries. Connecting requires authorization; access from another ChatGPT account is still being validated.",
    chatgptLink: "See how to connect", footer: "Carmelita · built in Latin America", feedback: "A small pilot, one conversation at a time.",
  },
  pt: {
    home: "Início da Carmelita", guide: "Guia", developers: "Desenvolvedores", enter: "Abrir o chat",
    title: "Suas carteiras e o mercado,", emphasis: "em uma conversa.",
    description: "Consulte suas carteiras, busque preços de tokens e compare redes. Comece com seu e-mail e pergunte à Carmelita.",
    start: "Começar com a Carmelita", how: "Como começar", pilot: "Teste de cadastro e consultas · carteiras Testnet",
    example: "Exemplo de consulta", question: "Quais carteiras eu tenho?", answer: "Suas carteiras reunidas em um só lugar, com suas redes e exploradores.",
    families: "3 carteiras · 5 redes", preview: "Exemplo ilustrativo. Seus endereços aparecem após entrar.",
    questionsTitle: "Comece por uma pergunta.", questionsText: "Escolha um exemplo para preencher o campo do chat. Você decide quando enviar.",
    examples: ["Minhas carteiras", "Preço de XLM, SOL, AVAX e BNB", "Comparar redes por TVL"],
    marketNote: "Preços e TVL são dados de mercado Mainnet. Cada resposta mostra a fonte e a data; fundos Testnet são consultados separadamente.",
    stepsTitle: "Do e-mail à primeira consulta.",
    steps: [["Entre com Privy", "Use seu e-mail e o fluxo visível do código de acesso. Sua identidade é preservada."], ["Consulte suas carteiras", "Veja endereços, redes, estado do cadastro e exploradores."], ["Explore no seu ritmo", "Abra Funções no chat. Conexões ausentes solicitarão autorização."]],
    chatgpt: "Prefere o ChatGPT?", chatgptText: "O complemento opcional usa as consultas compartilhadas da Carmelita. A conexão requer autorização; o acesso de outra conta do ChatGPT continua em validação.",
    chatgptLink: "Veja como conectar", footer: "Carmelita · criada na América Latina", feedback: "Um teste pequeno, uma conversa por vez.",
  },
};

const drafts = [
  "/consulta personal.wallets {}",
  '/consulta offchain.market.quote {"assets":[{"query":"XLM"},{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}',
  '/consulta offchain.defillama.chains {"sortBy":"tvl","limit":10}',
];

export default function HomeExperience() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  return (
    <main className="welcome-page">
      <nav className="welcome-nav shell" aria-label={t.home}>
        <Link href="/" className="brand" aria-label={t.home}><BrandLockup /></Link>
        <div className="welcome-nav-actions">
          <Link href="/guide" className="welcome-guide">{t.guide}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
          <Link href="/agent" className="welcome-enter">{t.enter}</Link>
        </div>
      </nav>
      <section className="welcome-hero shell">
        <div className="welcome-intro">
          <h1>{t.title}<br /><em>{t.emphasis}</em></h1><p>{t.description}</p>
          <div className="welcome-actions"><Link href="/agent?connect=privy" className="welcome-primary">{t.start}</Link><a href="#start">{t.how}</a></div>
          <small className="welcome-pilot"><span aria-hidden="true" />{t.pilot}</small>
        </div>
        <aside className="welcome-conversation" aria-label={t.example}>
          <header><BrandLockup /><span>{t.example}</span></header>
          <p className="welcome-question">{t.question}</p><p className="welcome-answer">{t.answer}</p>
          <div className="welcome-wallet-preview"><strong>{t.families}</strong><dl>
            <div><dt>Stellar Testnet</dt><dd>XLM</dd></div>
            <div><dt>EVM<small>Avalanche Fuji · BNB Testnet · Base Sepolia</small></dt><dd>AVAX · BNB · ETH</dd></div>
            <div><dt>Solana Devnet</dt><dd>SOL</dd></div>
          </dl></div><small>{t.preview}</small>
        </aside>
      </section>
      <section className="welcome-questions shell" aria-labelledby="welcome-questions-title">
        <div><h2 id="welcome-questions-title">{t.questionsTitle}</h2><p>{t.questionsText}</p></div>
        <div className="welcome-examples">{t.examples.map((example, index) => <Link key={index} href={`/agent?draft=${encodeURIComponent(drafts[index])}`}>{example}</Link>)}</div>
        <p className="welcome-market-note">{t.marketNote}</p>
      </section>
      <section id="start" className="welcome-start shell" aria-labelledby="welcome-start-title">
        <h2 id="welcome-start-title">{t.stepsTitle}</h2>
        <ol>{t.steps.map(([title, description], index) => <li key={title}><span aria-hidden="true">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
        <div className="welcome-chatgpt"><h3>{t.chatgpt}</h3><p>{t.chatgptText}</p><Link href="/guide#chatgpt">{t.chatgptLink}</Link></div>
      </section>
      <footer className="welcome-footer shell"><div><BrandLockup /><p>{t.feedback}</p></div><nav aria-label={t.footer}><Link href="/guide">{t.guide}</Link><Link href="/developers">{t.developers}</Link></nav></footer>
    </main>
  );
}
