"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale, type Locale } from "../language-toggle";
import styles from "../account-access.module.css";

const copy = {
  en: {
    home: "Carmelita home", skip: "Skip to content", guide: "User guide", title: "Start a conversation with Carmelita.",
    lede: "Connect your account and ask about your information from ChatGPT. Start with Stellar Testnet and choose the permissions you share.",
    connect: "Connect with ChatGPT", recommended: "Recommended", direct: "You can also use Carmelita’s chat directly.", signIn: "Sign in or create account",
    loading: "Preparing secure sign-in…", unavailable: "Sign-in is temporarily unavailable here. You can read the guide and try again later.",
    funding: "We recover your existing addresses and attempt to activate Stellar Testnet with XLM from the official Friendbot. Activation depends on confirmation from the network. Test funds have no real value. This does not authorize payments, Mainnet operations or USDC funding.",
    example: "Stellar Testnet example", question: "Is my Stellar Testnet account active?", answer: "Authorize your account to check:",
    items: ["Your Stellar address", "Activation status on the network", "XLM balance and explorer link"], note: "Illustrative example. Your information appears after you authorize access.",
  },
  es: {
    home: "Inicio de Carmelita", skip: "Ir al contenido", guide: "Guía de uso", title: "Empieza una conversación con Carmelita.",
    lede: "Conecta tu cuenta y consulta tu información desde ChatGPT. Empieza con Stellar Testnet y elige los permisos que compartes.",
    connect: "Conectar con ChatGPT", recommended: "Recomendado", direct: "También puedes usar el chat de Carmelita directamente.", signIn: "Iniciar sesión o crear cuenta",
    loading: "Preparando ingreso seguro…", unavailable: "El ingreso no está disponible temporalmente aquí. Consulta la guía y vuelve a intentarlo más tarde.",
    funding: "Recuperamos tus direcciones existentes e intentamos activar Stellar Testnet con XLM del Friendbot oficial. La activación depende de la confirmación de la red. Los fondos de prueba no tienen valor real. Esto no autoriza pagos, operaciones Mainnet ni financiación en USDC.",
    example: "Ejemplo de Stellar Testnet", question: "¿Está activa mi cuenta Stellar Testnet?", answer: "Autoriza tu cuenta para consultar:",
    items: ["Tu dirección Stellar", "Estado de activación en la red", "Saldo XLM y enlace al explorador"], note: "Ejemplo ilustrativo. Tu información aparece después de autorizar el acceso.",
  },
  pt: {
    home: "Início da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de uso", title: "Comece uma conversa com a Carmelita.",
    lede: "Conecte sua conta e consulte suas informações pelo ChatGPT. Comece com Stellar Testnet e escolha as permissões que compartilha.",
    connect: "Conectar com ChatGPT", recommended: "Recomendado", direct: "Você também pode usar o chat da Carmelita diretamente.", signIn: "Entrar ou criar conta",
    loading: "Preparando acesso seguro…", unavailable: "O acesso está temporariamente indisponível aqui. Consulte o guia e tente novamente mais tarde.",
    funding: "Recuperamos seus endereços existentes e tentamos ativar Stellar Testnet com XLM do Friendbot oficial. A ativação depende da confirmação da rede. Os fundos de teste não têm valor real. Isso não autoriza pagamentos, operações Mainnet nem financiamento em USDC.",
    example: "Exemplo de Stellar Testnet", question: "Minha conta Stellar Testnet está ativa?", answer: "Autorize sua conta para consultar:",
    items: ["Seu endereço Stellar", "Status de ativação na rede", "Saldo XLM e link do explorador"], note: "Exemplo ilustrativo. Suas informações aparecem após autorizar o acesso.",
  },
};

export default function AgentAccessEntry({ locale, loading = false, unavailable = false, onSignIn, signInDisabled = false, children }: {
  locale: Locale; loading?: boolean; unavailable?: boolean; onSignIn?: () => void; signInDisabled?: boolean; children?: ReactNode;
}) {
  const { setLocale } = useLocale();
  const content = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  return <section className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
    <div className={styles.shell}>
      <Link className={styles.skipLink} href="/agent#access-content" prefetch={false} onClick={() => content.current?.focus()}>{t.skip}</Link>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.headerActions}><Link href="/guide" className={styles.textLink}>{t.guide}</Link><LanguageToggle locale={locale} onChange={setLocale} compact /></div>
      </header>
      <div id="access-content" ref={content} tabIndex={-1} className={`${styles.content} ${styles.hero}`}>
        <div>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.lede}>{t.lede}</p>
          <div className={styles.actions}><Link href="/connect-chatgpt" className={styles.primary}><span className={styles.primaryStack}>{t.connect}<span className={styles.recommended}>{t.recommended}</span></span></Link></div>
          <p className={styles.note}>{t.direct}</p>
          {loading ? <p className={styles.status} role="status">{t.loading}</p> : unavailable ? <p className={styles.status} role="status">{t.unavailable}</p> : <button type="button" className={styles.secondary} disabled={signInDisabled} onClick={onSignIn}>{t.signIn}</button>}
          {children}
          <p className={styles.note}>{t.funding}</p>
        </div>
        <aside className={styles.panel} aria-labelledby="access-example-title">
          <div className={styles.exampleHead}><BrandLockup /><span className={styles.badge} id="access-example-title">{t.example}</span></div>
          <p className={styles.question}>{t.question}</p><p>{t.answer}</p>
          <ul className={styles.exampleList}>{t.items.map(item => <li key={item}>{item}</li>)}</ul>
          <p className={styles.note}>{t.note}</p>
        </aside>
      </div>
    </div>
  </section>;
}
