"use client";

import PublicPageShell from "../public-page-shell";
import { useLocale } from "../language-toggle";
import { ConnectionSteps } from "../agent/chatgpt-connection";
export default function ConnectionGuide() {
  const { locale, setLocale } = useLocale();
  return <PublicPageShell locale={locale} onLocaleChange={setLocale} active="connect">
    <ConnectionSteps locale={locale} fullPage />
  </PublicPageShell>;
}
