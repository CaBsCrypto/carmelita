"use client";

import { useState } from "react";
import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";
import type { readBazaarCatalog } from "../connectors/bazaar-catalog";
import styles from "./services.module.css";

type Catalog = Awaited<ReturnType<typeof readBazaarCatalog>>;

const copy = {
  es: {
    home: "Inicio de Carmelita", connect: "Conectar con ChatGPT", skip: "Ir al catálogo", navigation: "Navegación de servicios",
    title: "Descubre los servicios de Bazaar.",
    description: "Consulta qué publica cada proveedor, qué entrada necesita su servicio y qué funciones siguen pendientes.",
    boundaryTitle: "Primero, conoce la disponibilidad.",
    boundaryText: "Una ficha publicada no significa que el servicio esté validado. La compra y la ejecución desde ChatGPT todavía no están disponibles.",
    status: "Estado de la consulta", ok: "Catálogo consultado", partial: "Información parcial", unavailable: "Catálogo no disponible",
    partialText: "Mostramos la información recibida. Algunas secciones no están disponibles o el catálogo está incompleto.",
    unavailableText: "No pudimos recuperar el catálogo. Puedes volver a consultar; no se ha iniciado ninguna operación.",
    retry: "Volver a consultar", retrying: "Consultando…", checked: "Consultado", source: "Ver fuente pública del catálogo",
    services: "Servicios", servicesText: "Fichas publicadas por los proveedores. Los importes y entradas son datos declarados, no una oferta de compra habilitada.",
    emptyServices: "Esta consulta no devolvió servicios publicados.", unavailableServices: "La información de servicios no está disponible en este momento.",
    published: "Publicado en catálogo", notPublished: "Publicación pendiente", providerPending: "Proveedor pendiente de validación", providerUnavailable: "Proveedor no disponible",
    provider: "Proveedor", supplierDescription: "Descripción del proveedor", amount: "Importe declarado · Testnet", network: "Red declarada", upTo: "Hasta",
    inputs: "Entrada declarada", required: "Obligatoria", optional: "Opcional", noInputs: "La ficha no declara campos de entrada.",
    types: { string: "Texto", number: "Número", boolean: "Sí / no" },
    suites: "Suites", suitesText: "Descripciones de flujos que agrupan servicios. Carmelita todavía no ejecuta estos flujos.",
    suiteDeclared: "Flujo declarado por el proveedor", suiteDraft: "Borrador declarado por el proveedor", stages: "Etapas declaradas", suiteBoundary: "Ejecución pendiente de validación. Esta ficha no acredita una entrega ni un pago.",
    emptySuites: "Esta consulta no devolvió suites publicadas.", unavailableSuites: "La información de suites no está disponible en este momento.",
    skills: "Skills", skillsText: "Instrucciones publicadas como documentación. Su publicación no las convierte en funciones ejecutables.",
    emptySkills: "Esta consulta no devolvió skills publicadas.", unavailableSkills: "La información de skills no está disponible en el Bazaar conectado.",
    skillOnly: "Documentación · sin ejecución", guide: "Guía de conexión", footer: "Catálogo de consulta · Carmelita + Bazaar",
  },
  en: {
    home: "Carmelita home", connect: "Connect with ChatGPT", skip: "Skip to catalog", navigation: "Service navigation",
    title: "Discover Bazaar services.",
    description: "See what each provider publishes, what input a service needs and which features are still pending.",
    boundaryTitle: "Start with availability.",
    boundaryText: "A published listing does not mean a service has been validated. Buying and running services from ChatGPT are not yet available.",
    status: "Query status", ok: "Catalog checked", partial: "Partial information", unavailable: "Catalog unavailable",
    partialText: "We show the information received. Some sections are unavailable or the catalog is incomplete.",
    unavailableText: "We could not retrieve the catalog. You can check again; no operation has been started.",
    retry: "Check again", retrying: "Checking…", checked: "Checked", source: "View the public catalog source",
    services: "Services", servicesText: "Listings published by providers. Amounts and inputs are declared information, not an enabled purchase offer.",
    emptyServices: "This query returned no published services.", unavailableServices: "Service information is unavailable at the moment.",
    published: "Published in catalog", notPublished: "Publication pending", providerPending: "Provider validation pending", providerUnavailable: "Provider unavailable",
    provider: "Provider", supplierDescription: "Provider description", amount: "Declared amount · Testnet", network: "Declared network", upTo: "Up to",
    inputs: "Declared input", required: "Required", optional: "Optional", noInputs: "The listing declares no input fields.",
    types: { string: "Text", number: "Number", boolean: "Yes / no" },
    suites: "Suites", suitesText: "Descriptions of workflows that combine services. Carmelita does not yet run these workflows.",
    suiteDeclared: "Workflow declared by the provider", suiteDraft: "Draft declared by the provider", stages: "Declared stages", suiteBoundary: "Execution validation pending. This listing is not evidence of delivery or payment.",
    emptySuites: "This query returned no published suites.", unavailableSuites: "Suite information is unavailable at the moment.",
    skills: "Skills", skillsText: "Instructions published as documentation. Publication does not make them executable features.",
    emptySkills: "This query returned no published skills.", unavailableSkills: "Skill information is unavailable in the connected Bazaar.",
    skillOnly: "Documentation · no execution", guide: "Connection guide", footer: "Catalog for discovery · Carmelita + Bazaar",
  },
  pt: {
    home: "Início da Carmelita", connect: "Conectar ao ChatGPT", skip: "Ir para o catálogo", navigation: "Navegação de serviços",
    title: "Descubra os serviços do Bazaar.",
    description: "Veja o que cada fornecedor publica, qual entrada o serviço precisa e quais funções ainda estão pendentes.",
    boundaryTitle: "Comece pela disponibilidade.",
    boundaryText: "Uma ficha publicada não significa que o serviço foi validado. A compra e a execução pelo ChatGPT ainda não estão disponíveis.",
    status: "Estado da consulta", ok: "Catálogo consultado", partial: "Informação parcial", unavailable: "Catálogo indisponível",
    partialText: "Mostramos as informações recebidas. Algumas seções estão indisponíveis ou o catálogo está incompleto.",
    unavailableText: "Não foi possível recuperar o catálogo. Você pode consultar novamente; nenhuma operação foi iniciada.",
    retry: "Consultar novamente", retrying: "Consultando…", checked: "Consultado", source: "Ver fonte pública do catálogo",
    services: "Serviços", servicesText: "Fichas publicadas pelos fornecedores. Valores e entradas são informações declaradas, não uma oferta de compra habilitada.",
    emptyServices: "Esta consulta não retornou serviços publicados.", unavailableServices: "As informações de serviços estão indisponíveis no momento.",
    published: "Publicado no catálogo", notPublished: "Publicação pendente", providerPending: "Fornecedor com validação pendente", providerUnavailable: "Fornecedor indisponível",
    provider: "Fornecedor", supplierDescription: "Descrição do fornecedor", amount: "Valor declarado · Testnet", network: "Rede declarada", upTo: "Até",
    inputs: "Entrada declarada", required: "Obrigatória", optional: "Opcional", noInputs: "A ficha não declara campos de entrada.",
    types: { string: "Texto", number: "Número", boolean: "Sim / não" },
    suites: "Suites", suitesText: "Descrições de fluxos que agrupam serviços. A Carmelita ainda não executa esses fluxos.",
    suiteDeclared: "Fluxo declarado pelo fornecedor", suiteDraft: "Rascunho declarado pelo fornecedor", stages: "Etapas declaradas", suiteBoundary: "Execução com validação pendente. Esta ficha não comprova entrega nem pagamento.",
    emptySuites: "Esta consulta não retornou suites publicadas.", unavailableSuites: "As informações de suites estão indisponíveis no momento.",
    skills: "Skills", skillsText: "Instruções publicadas como documentação. A publicação não as transforma em funções executáveis.",
    emptySkills: "Esta consulta não retornou skills publicadas.", unavailableSkills: "As informações de skills estão indisponíveis no Bazaar conectado.",
    skillOnly: "Documentação · sem execução", guide: "Guia de conexão", footer: "Catálogo para consulta · Carmelita + Bazaar",
  },
};

// This is an informational source link, never a provider or checkout URL.
const catalogSource = "https://bazaar.browns.studio/api/discovery/resources";

export default function ServicesClient({ catalog }: { catalog: Catalog }) {
  const { locale, setLocale } = useLocale();
  const [refreshing, setRefreshing] = useState(false);
  const t = copy[locale];
  const checked = new Date(catalog.queriedAt);
  const dateValid = !Number.isNaN(checked.getTime());
  const checkedLabel = dateValid ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale, {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(checked) : null;
  const statusLabel = catalog.status === "unavailable" ? t.unavailable : catalog.status === "partial" ? t.partial : t.ok;

  function refresh() {
    setRefreshing(true);
    window.location.reload();
  }

  return (
    <main className={styles.page} lang={locale === "pt" ? "pt-BR" : locale}>
      <a className={styles.skipLink} href="#catalog-content">{t.skip}</a>
      <nav className={styles.nav} aria-label={t.navigation}>
        <Link href="/" className={styles.brand} aria-label={t.home}><BrandLockup /></Link>
        <div className={styles.navActions}>
          <Link href="/connect-chatgpt">{t.connect}</Link>
          <LanguageToggle locale={locale} onChange={setLocale} compact />
        </div>
      </nav>

      <div className={styles.content} id="catalog-content" tabIndex={-1}>
        <header className={styles.intro}>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
        </header>

        <aside className={styles.boundary} aria-labelledby="catalog-boundary-title">
          <h2 id="catalog-boundary-title">{t.boundaryTitle}</h2>
          <p>{t.boundaryText}</p>
        </aside>

        <div className={styles.status} aria-label={t.status}>
          <div>
            <strong>{statusLabel}</strong>
            {checkedLabel && <p>{t.checked}: <time dateTime={checked.toISOString()}>{checkedLabel} UTC</time></p>}
            {catalog.status !== "ok" && <p>{catalog.status === "unavailable" ? t.unavailableText : t.partialText}</p>}
          </div>
          <button type="button" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
            {refreshing ? t.retrying : t.retry}
          </button>
        </div>

        <section className={styles.section} aria-labelledby="catalog-services-title">
          <header className={styles.sectionHeader}><h2 id="catalog-services-title">{t.services}</h2><p>{t.servicesText}</p></header>
          {catalog.services.services.length ? (
            <div className={styles.serviceGrid}>
              {catalog.services.services.map(service => (
                <article className={styles.service} key={service.id}>
                  <div className={styles.labels}>
                    <span>{service.readiness.publication === "published" ? t.published : t.notPublished}</span>
                    <span className={styles.pending}>{service.readiness.providerAvailability === "unavailable" ? t.providerUnavailable : t.providerPending}</span>
                  </div>
                  <h3>{service.name}</h3>
                  <p className={styles.provider}>{t.provider}: {service.provider}</p>
                  <p className={styles.supplierLabel}>{t.supplierDescription}</p>
                  <p className={styles.description}>{service.description}</p>
                  <dl className={styles.terms}>
                    <div><dt>{t.amount}</dt><dd>{service.payment.scheme === "upto" ? t.upTo + " " : ""}{service.payment.amount} {service.payment.asset}</dd></div>
                    <div><dt>{t.network}</dt><dd>Stellar Testnet</dd></div>
                  </dl>
                  <details className={styles.inputs}>
                    <summary>{t.inputs}</summary>
                    {service.input.length ? <ul>{service.input.map((field, index) => (
                      <li key={field.name + index}><span>{field.name}</span><small>{t.types[field.type]} · {field.required ? t.required : t.optional}</small></li>
                    ))}</ul> : <p>{t.noInputs}</p>}
                  </details>
                </article>
              ))}
            </div>
          ) : <p className={styles.empty}>{catalog.services.status === "unavailable" ? t.unavailableServices : t.emptyServices}</p>}
        </section>

        <section className={styles.section} aria-labelledby="catalog-suites-title">
          <header className={styles.sectionHeader}><h2 id="catalog-suites-title">{t.suites}</h2><p>{t.suitesText}</p></header>
          {catalog.suites.suites.length ? (
            <ul className={styles.suiteList}>
              {catalog.suites.suites.map(suite => (
                <li key={suite.id}>
                  <div>
                    <p className={styles.supplierLabel}>{suite.status === "draft" ? t.suiteDraft : t.suiteDeclared}</p>
                    <h3 lang={locale === "es" ? "es" : "en"}>{locale === "es" ? suite.title.es : suite.title.en}</h3>
                    <p>{t.stages}: {suite.stageCount}</p>
                  </div>
                  <p className={styles.suiteBoundary}>{t.suiteBoundary}</p>
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>{catalog.suites.status === "unavailable" ? t.unavailableSuites : t.emptySuites}</p>}
        </section>

        <section className={styles.section} aria-labelledby="catalog-skills-title">
          <header className={styles.sectionHeader}><h2 id="catalog-skills-title">{t.skills}</h2><p>{t.skillsText}</p></header>
          {catalog.skills.skills.length ? <ul className={styles.skillList}>{catalog.skills.skills.map(skill => (
            <li key={skill.role}><h3>{skill.name}</h3><p>{t.skillOnly}</p></li>
          ))}</ul> : <p className={styles.empty}>{catalog.skills.status === "unavailable" ? t.unavailableSkills : t.emptySkills}</p>}
        </section>
      </div>

      <footer className={styles.footer}>
        <p>{t.footer}</p>
        <nav aria-label={t.footer}>
          <Link href="/connect-chatgpt">{t.guide}</Link>
          <a href={catalogSource} target="_blank" rel="noopener noreferrer">{t.source}</a>
        </nav>
      </footer>
    </main>
  );
}
