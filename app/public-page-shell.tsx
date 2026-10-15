"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import BrandLockup from "./brand-lockup";
import LanguageToggle, { type Locale } from "./language-toggle";
import styles from "./public-pages.module.css";

const copy = {
  es: { home: "Inicio de Carmelita", navigation: "Recursos de Carmelita", connect: "Conectar ChatGPT", guide: "Guía de uso", developers: "Desarrolladores", agent: "Abrir Carmelita", skip: "Ir al contenido", footer: "Carmelita, tu agente personal en ChatGPT." },
  en: { home: "Carmelita home", navigation: "Carmelita resources", connect: "Connect ChatGPT", guide: "User guide", developers: "Developers", agent: "Open Carmelita", skip: "Skip to content", footer: "Carmelita, your personal agent in ChatGPT." },
  pt: { home: "Início da Carmelita", navigation: "Recursos da Carmelita", connect: "Conectar ChatGPT", guide: "Guia de uso", developers: "Desenvolvedores", agent: "Abrir Carmelita", skip: "Ir para o conteúdo", footer: "Carmelita, seu agente pessoal no ChatGPT." },
};
const routes = { connect: "/connect-chatgpt", guide: "/guide", developers: "/developers" } as const;

export default function PublicPageShell({ locale, onLocaleChange, active, children }: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  active: keyof typeof routes;
  children: ReactNode;
}) {
  const content = useRef<HTMLElement>(null);
  const t = copy[locale];
  useEffect(() => {
    if (content.current) content.current.dataset.hydrated = "true";
  }, []);
  return <div className={styles.page}>
    <div className={styles.shell}>
      <Link className={styles.skipLink} href={`${routes[active]}#page-content`} prefetch={false} onClick={() => content.current?.focus()}>{t.skip}</Link>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={t.home}><BrandLockup /></Link>
        <nav className={styles.navigation} aria-label={t.navigation}>
          {(Object.keys(routes) as (keyof typeof routes)[]).map(key => <Link key={key} href={routes[key]} aria-current={key === active ? "page" : undefined}>{t[key]}</Link>)}
        </nav>
        <LanguageToggle locale={locale} onChange={onLocaleChange} compact />
      </header>
      <main id="page-content" ref={content} data-hydrated="false" tabIndex={-1} className={styles.content}>{children}</main>
      <footer className={styles.footer}>
        <div><BrandLockup /><p>{t.footer}</p></div>
        <Link href="/agent?connect=privy">{t.agent}</Link>
      </footer>
    </div>
  </div>;
}
