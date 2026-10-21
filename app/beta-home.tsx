"use client";

import Link from "next/link";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { useLocale } from "./language-toggle";
import styles from "./beta-home.module.css";

const copy = {
  es: { badge: "Beta en preparación", title: "Tu día, en una conversación.", intro: "Conversa con Carmelita, guarda las preferencias que elijas y consulta tus billeteras de prueba. Estamos preparando conexiones para reunir tus servicios en el mismo chat.", start: "Conversar con Carmelita", steps: "Un espacio que sigue contigo", items: [["Conversa", "Empieza con una pregunta y recupera tu historial al volver."], ["Personaliza", "Decide qué preferencias guardar y elimínalas cuando quieras."], ["Conecta", "Usa tus capacidades autorizadas desde Carmelita. Cada nuevo acceso desde otro chat se valida antes de anunciarse."]], example: "Prueba: «Muéstrame mis billeteras»", boundary: "Billeteras en Testnet y Devnet. Iniciar sesión no autoriza pagos.", business: "¿Tu empresa quiere conectar un servicio?", businessText: "Propón una integración por API o MCP para su revisión. El catálogo no admite destinos arbitrarios.", docs: "Ver cómo integrar un servicio", footer: "Las funciones en validación no se presentan como disponibles." },
  en: { badge: "Beta in preparation", title: "Your day, in one conversation.", intro: "Talk to Carmelita, save the preferences you choose and check your test wallets. We are preparing connections to bring your services into the same chat.", start: "Talk to Carmelita", steps: "A space that stays with you", items: [["Talk", "Start with a question and recover your history when you return."], ["Personalize", "Choose which preferences to save and delete them whenever you want."], ["Connect", "Use your authorized capabilities from Carmelita. Each new connection from another chat is validated before being announced."]], example: "Try: “Show me my wallets”", boundary: "Testnet and Devnet wallets. Signing in does not authorize payments.", business: "Want to connect your business?", businessText: "Propose an API or MCP integration for review. The catalog does not accept arbitrary destinations.", docs: "Learn how to integrate a service", footer: "Features under validation are not presented as available." },
  pt: { badge: "Beta em preparação", title: "Seu dia, em uma conversa.", intro: "Converse com Carmelita, salve as preferências que escolher e consulte suas carteiras de teste. Estamos preparando conexões para reunir seus serviços no mesmo chat.", start: "Conversar com Carmelita", steps: "Um espaço que acompanha você", items: [["Converse", "Comece com uma pergunta e recupere seu histórico ao voltar."], ["Personalize", "Escolha quais preferências salvar e exclua quando quiser."], ["Conecte", "Use suas capacidades autorizadas pela Carmelita. Cada novo acesso por outro chat é validado antes de ser anunciado."]], example: "Experimente: «Mostre minhas carteiras»", boundary: "Carteiras em Testnet e Devnet. Entrar não autoriza pagamentos.", business: "Sua empresa quer conectar um serviço?", businessText: "Proponha uma integração por API ou MCP para revisão. O catálogo não aceita destinos arbitrários.", docs: "Veja como integrar um serviço", footer: "Funções em validação não são apresentadas como disponíveis." },
};

export default function BetaHome() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" aria-label="Carmelita"><BrandLockup /></Link><LanguageToggle locale={locale} onChange={setLocale} /></nav>
    <section className={styles.hero} aria-labelledby="beta-title"><p className={styles.badge}>{t.badge}</p><h1 id="beta-title">{t.title}</h1><p>{t.intro}</p><Link className={styles.cta} href="/agent?connect=privy">{t.start} →</Link><p className={styles.example}>{t.example}</p><small>{t.boundary}</small></section>
    <section className={styles.features} aria-labelledby="beta-steps"><h2 id="beta-steps">{t.steps}</h2><div>{t.items.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <aside className={styles.business}><h2>{t.business}</h2><p>{t.businessText}</p><Link href="/developers#connect-product">{t.docs} →</Link></aside>
    <footer>{t.footer}</footer>
  </main>;
}
