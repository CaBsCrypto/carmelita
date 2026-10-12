"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef } from "react";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";
import styles from "../account-access.module.css";

const copy = {
  en: {
    home: "Carmelita home", skip: "Skip to content", guide: "User guide", title: "Sign in to Carmelita.",
    text: "Use your existing account or create one to query your own information. You can also create your Carmelita account when authorizing the connection in ChatGPT.",
    ready: "Sign in or create account", loading: "Preparing secure sign-in…", boundary: "You do not need to enter a seed phrase or wallet password to get started.",
    unavailable: "Sign-in is temporarily unavailable in this environment. Read the connection guide and try again later.", connect: "Connect with ChatGPT", recommended: "Recommended",
    includes: "Your account, your information.", steps: ["A secure account you can use in Carmelita and ChatGPT", "Your existing addresses recovered, or new test wallets prepared", "Stellar Testnet address, activation status and XLM balance"],
    note: "Stellar activation is shown only after confirmation from the network. Test funds have no real value.",
  },
  es: {
    home: "Inicio de Carmelita", skip: "Ir al contenido", guide: "Guía de uso", title: "Inicia sesión en Carmelita.",
    text: "Usa tu cuenta existente o crea una para consultar tu información. También puedes crear tu cuenta Carmelita al autorizar la conexión en ChatGPT.",
    ready: "Iniciar sesión o crear cuenta", loading: "Preparando ingreso seguro…", boundary: "No necesitas ingresar una seed phrase ni contraseña de wallet para empezar.",
    unavailable: "El ingreso no está disponible temporalmente en este entorno. Consulta la guía de conexión y vuelve a intentarlo más tarde.", connect: "Conectar con ChatGPT", recommended: "Recomendado",
    includes: "Tu cuenta, tu información.", steps: ["Una cuenta segura que puedes usar en Carmelita y ChatGPT", "Recuperación de tus direcciones existentes o preparación de wallets de prueba", "Dirección de Stellar Testnet, estado de activación y saldo XLM"],
    note: "La activación de Stellar se muestra sólo después de la confirmación de la red. Los fondos de prueba no tienen valor real.",
  },
  pt: {
    home: "Início da Carmelita", skip: "Ir para o conteúdo", guide: "Guia de uso", title: "Entre na Carmelita.",
    text: "Use sua conta existente ou crie uma para consultar suas informações. Você também pode criar sua conta Carmelita ao autorizar a conexão no ChatGPT.",
    ready: "Entrar ou criar conta", loading: "Preparando acesso seguro…", boundary: "Você não precisa informar uma seed phrase ou senha de wallet para começar.",
    unavailable: "O acesso está temporariamente indisponível neste ambiente. Consulte o guia de conexão e tente novamente mais tarde.", connect: "Conectar com ChatGPT", recommended: "Recomendado",
    includes: "Sua conta, suas informações.", steps: ["Uma conta segura para usar na Carmelita e no ChatGPT", "Recuperação dos endereços existentes ou preparação de wallets de teste", "Endereço Stellar Testnet, status de ativação e saldo XLM"],
    note: "A ativação da Stellar só aparece após confirmação da rede. Os fundos de teste não têm valor real.",
  },
};

export default function LoginPanel({ configured }: { configured: boolean }) {
  const { locale, setLocale } = useLocale();
  const content = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  return <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
    <div className={styles.shell}>
      <Link className={styles.skipLink} href="/login#access-content" prefetch={false} onClick={() => content.current?.focus()}>{t.skip}</Link>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.headerActions}><Link className={styles.textLink} href="/guide">{t.guide}</Link><LanguageToggle locale={locale} onChange={setLocale} compact /></div>
      </header>
      <div id="access-content" ref={content} tabIndex={-1} className={`${styles.content} ${styles.hero}`}>
        <div>
          <h1 className={styles.title}>{t.title}</h1><p className={styles.lede}>{t.text}</p>
          {configured ? <PrivyLogin t={t} /> : <p className={styles.status} role="status">{t.unavailable}</p>}
          <p className={styles.note}>{t.boundary}</p>
          <div className={styles.help}><Link href="/connect-chatgpt">{t.connect}</Link><span className={styles.recommended}>{t.recommended}</span></div>
        </div>
        <aside className={styles.panel} aria-labelledby="login-account-title">
          <p className={styles.kicker}>Stellar Testnet</p><h2 id="login-account-title">{t.includes}</h2>
          <ul className={styles.exampleList}>{t.steps.map(step => <li key={step}>{step}</li>)}</ul><p className={styles.note}>{t.note}</p>
        </aside>
      </div>
    </div>
  </main>;
}

type LoginCopy = (typeof copy)["en"];

function PrivyLogin({ t }: { t: LoginCopy }) {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.replace("/agent");
  }, [authenticated, ready, router]);

  return <button type="button" className={styles.primary} disabled={!ready} onClick={() => login()}>{ready ? t.ready : t.loading}</button>;
}
