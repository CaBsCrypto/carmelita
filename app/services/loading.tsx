"use client";

import { useLocale } from "../language-toggle";
import styles from "./services.module.css";

export default function ServicesLoading() {
  const { locale } = useLocale();
  const message = { es: "Consultando el catálogo de Bazaar…", en: "Checking the Bazaar catalog…", pt: "Consultando o catálogo do Bazaar…" }[locale];
  return <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}><div className={styles.content}><p role="status">{message}</p></div></main>;
}
