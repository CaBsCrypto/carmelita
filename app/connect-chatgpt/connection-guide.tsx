"use client";

import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";
import { ConnectionSteps } from "../agent/chatgpt-connection";
import styles from "./connection.module.css";

const titles = { es: "Conecta Carmelita con ChatGPT", en: "Connect Carmelita with ChatGPT", pt: "Conecte Carmelita ao ChatGPT" };
const home = { es: "Inicio", en: "Home", pt: "Início" };
export default function ConnectionGuide() {
  const { locale, setLocale } = useLocale();
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label={home[locale]}><Link href="/" aria-label={home[locale]}><BrandLockup /></Link><LanguageToggle locale={locale} onChange={setLocale} compact /></nav>
    <header className={styles.hero}><h1>{titles[locale]}</h1></header>
    <ConnectionSteps locale={locale} fullPage />
  </main>;
}
