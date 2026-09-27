import assert from "node:assert/strict";
import test from "node:test";
import { createLocaleStore, LOCALE_STORAGE_KEY } from "../app/locale-store";

function environment(saved: string | null = null) {
  let value = saved;
  let language = "";
  const events = new EventTarget();
  return {
    events,
    read: () => value,
    write: (next: string) => { value = next; },
    setDocumentLanguage: (next: string) => { language = next; },
    language: () => language,
  };
}

function storageEvent(key: string | null, newValue: string | null) {
  return Object.assign(new Event("storage"), { key, newValue });
}

test("two mounted locale consumers update immediately from one selection", () => {
  const browser = environment();
  const store = createLocaleStore(() => browser);
  const first: string[] = [];
  const second: string[] = [];
  const stopFirst = store.subscribe(() => first.push(store.getSnapshot()));
  const stopSecond = store.subscribe(() => second.push(store.getSnapshot()));
  store.setLocale("es");
  store.setLocale("pt");
  assert.deepEqual(first, ["es", "pt"]);
  assert.deepEqual(second, ["es", "pt"]);
  assert.equal(browser.read(), "pt");
  assert.equal(browser.language(), "pt-BR");
  stopFirst();
  store.setLocale("en");
  assert.deepEqual(first, ["es", "pt"]);
  assert.deepEqual(second, ["es", "pt", "en"]);
  stopSecond();
});

test("local change events synchronize independent stores on the same browser surface", () => {
  const browser = environment("es");
  const header = createLocaleStore(() => browser);
  const onboarding = createLocaleStore(() => browser);
  const stopHeader = header.subscribe(() => {});
  const values: string[] = [];
  const stopOnboarding = onboarding.subscribe(() => values.push(onboarding.getSnapshot()));
  header.setLocale("pt");
  assert.deepEqual(values, ["es", "pt"]);
  assert.equal(onboarding.getSnapshot(), "pt");
  stopHeader();
  stopOnboarding();
});

test("other-tab storage changes propagate while unrelated keys are ignored and listeners are removed", () => {
  const browser = environment("es");
  const store = createLocaleStore(() => browser);
  const values: string[] = [];
  const stop = store.subscribe(() => values.push(store.getSnapshot()));
  browser.events.dispatchEvent(storageEvent("unrelated-key", "pt"));
  assert.equal(store.getSnapshot(), "es");
  browser.events.dispatchEvent(storageEvent(LOCALE_STORAGE_KEY, "pt"));
  assert.equal(store.getSnapshot(), "pt");
  assert.equal(browser.language(), "pt-BR");
  browser.events.dispatchEvent(storageEvent(LOCALE_STORAGE_KEY, "unsupported"));
  assert.equal(store.getSnapshot(), "en");
  stop();
  browser.events.dispatchEvent(storageEvent(LOCALE_STORAGE_KEY, "es"));
  assert.deepEqual(values, ["es", "pt", "en"]);
});

test("server rendering is consistently English and blocked storage still permits a language choice", () => {
  const server = createLocaleStore(() => null);
  assert.equal(server.getSnapshot(), "en");
  assert.equal(server.getServerSnapshot(), "en");
  server.setLocale("pt");
  assert.equal(server.getSnapshot(), "en");
  const browser = environment();
  const store = createLocaleStore(() => ({ ...browser, read: () => { throw new Error("blocked"); }, write: () => { throw new Error("blocked"); } }));
  const stop = store.subscribe(() => {});
  assert.doesNotThrow(() => store.setLocale("es"));
  assert.equal(store.getSnapshot(), "es");
  assert.equal(store.getServerSnapshot(), "en");
  assert.equal(browser.language(), "es");
  stop();
});
