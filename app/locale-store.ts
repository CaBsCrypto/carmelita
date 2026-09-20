export type Locale = "en" | "es" | "pt";
export const LOCALE_STORAGE_KEY = "aa-locale";
const LOCALE_CHANGE_EVENT = "aa-locale-change";

type LocaleEnvironment = {
  events: EventTarget;
  read: () => string | null;
  write: (value: Locale) => void;
  setDocumentLanguage: (value: string) => void;
};

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es" || value === "pt";
}

export function createLocaleStore(getEnvironment: () => LocaleEnvironment | null) {
  let locale: Locale = "en";
  const subscribers = new Set<() => void>();
  let stopListening: (() => void) | undefined;

  function publish(next: Locale, environment: LocaleEnvironment) {
    const changed = next !== locale;
    locale = next;
    environment.setDocumentLanguage(next === "pt" ? "pt-BR" : next);
    if (changed) for (const notify of subscribers) notify();
  }

  return {
    getSnapshot: () => locale,
    getServerSnapshot: (): Locale => "en",
    subscribe(notify: () => void) {
      const environment = getEnvironment();
      if (!environment) return () => {};
      subscribers.add(notify);
      if (!stopListening) {
        const onLocalChange = (event: Event) => {
          const next = (event as CustomEvent<unknown>).detail;
          if (isLocale(next)) publish(next, environment);
        };
        const onStorageChange = (event: Event) => {
          const { key, newValue } = event as StorageEvent;
          if (key !== LOCALE_STORAGE_KEY && key !== null) return;
          publish(isLocale(newValue) ? newValue : "en", environment);
        };
        environment.events.addEventListener(LOCALE_CHANGE_EVENT, onLocalChange);
        environment.events.addEventListener("storage", onStorageChange);
        stopListening = () => {
          environment.events.removeEventListener(LOCALE_CHANGE_EVENT, onLocalChange);
          environment.events.removeEventListener("storage", onStorageChange);
        };
        try {
          const saved = environment.read();
          publish(isLocale(saved) ? saved : "en", environment);
        } catch {
          // Browser storage restrictions do not prevent a session language choice.
          publish(locale, environment);
        }
      }
      return () => {
        subscribers.delete(notify);
        if (subscribers.size === 0) { stopListening?.(); stopListening = undefined; }
      };
    },
    setLocale(next: Locale) {
      if (!isLocale(next)) return;
      const environment = getEnvironment();
      if (!environment) return;
      try { environment.write(next); } catch { /* Keep this session usable without persistent storage. */ }
      publish(next, environment);
      environment.events.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: next }));
    },
  };
}

export const localeStore = createLocaleStore(() => typeof window === "undefined" ? null : {
  events: window,
  read: () => window.localStorage.getItem(LOCALE_STORAGE_KEY),
  write: (value) => window.localStorage.setItem(LOCALE_STORAGE_KEY, value),
  setDocumentLanguage: (value) => { document.documentElement.lang = value; },
});
