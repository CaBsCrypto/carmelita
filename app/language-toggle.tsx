"use client";

import { useSyncExternalStore } from "react";
import { localeStore, type Locale } from "./locale-store";
export type { Locale } from "./locale-store";

export function useLocale() {
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot, localeStore.getServerSnapshot);
  return { locale, setLocale: localeStore.setLocale };
}

export default function LanguageToggle({
  locale,
  onChange,
  compact = false,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  compact?: boolean;
}) {
  return (
    <div className={"language-toggle" + (compact ? " compact" : "")} aria-label="Language / Idioma">
      {(["en", "es", "pt"] as const).map((item) => (
        <button
          type="button"
          className={locale === item ? "active" : ""}
          aria-pressed={locale === item}
          onClick={() => onChange(item)}
          key={item}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function LanguageControl({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return <LanguageToggle locale={locale} onChange={setLocale} compact={compact} />;
}
