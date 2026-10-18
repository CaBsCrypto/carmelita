"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BrandLockup from "../brand-lockup";
import LanguageToggle, { useLocale } from "../language-toggle";
import { connections, type ConnectionStage } from "./data";

const stages: ConnectionStage[] = ["Connected", "Read-only connected", "Ready to test", "Credentials needed", "Partner outreach", "Research"];
const priorities = ["P0", "P1", "P2"] as const;
const categories = Array.from(new Set(connections.map((connection) => connection.category))).sort();
type StageFilter = "All" | ConnectionStage;
type PriorityFilter = "All" | (typeof priorities)[number];
const slug = (value: string) => value.toLowerCase().replaceAll(" ", "-");
const stageEs: Record<string, string> = { Connected: "Conectado", "Read-only connected": "Conectado en lectura", "Ready to test": "Listo para probar", "Credentials needed": "Requiere credenciales", "Partner outreach": "Contacto con partner", Research: "Investigación", All: "Todos" };
const stagePt: Record<string, string> = { Connected: "Conectado", "Read-only connected": "Conectado somente para leitura", "Ready to test": "Pronto para testar", "Credentials needed": "Requer credenciais", "Partner outreach": "Contato com parceiro", Research: "Pesquisa", All: "Todos" };

const ui = {
  en: {
    docs: "Developer portal", eyebrow: "INTEGRATION LAB", title: "Every connection. One honest status.",
    intro: "Track protocols, partners, tests, blockers and the next concrete action. A target is connected only when evidence exists.",
    add: "+ Add a target", search: "Search", placeholder: "Search Shopify, payments, travel...", category: "Category", allCategories: "All categories", priority: "Priority", stage: "Stage", allStages: "All stages", clear: "Clear filters", targets: "targets", filtered: "Filtered view", defaultView: "Default view: all connections", columns: ["Target", "Status", "Priority", "Route", "Next action", "Evidence"], evidence: "Open evidence", empty: "No matching targets.", emptyText: "Try another search, category, stage or priority.", showAll: "Show all connections", next: "NEXT TARGET", nextTitle: "Bring us a product, API or MCP.", nextText: "We verify the official interface, select the smallest useful route and define a reversible first test.", cta: "Use the developer onboarding", ctaText: "Follow the self-service checklist, then share the integration brief with your developer or implementation agent.", open: "Open developer portal",
  },
  es: {
    docs: "Portal de developers", eyebrow: "LABORATORIO DE INTEGRACIONES", title: "Cada conexión. Un estado honesto.",
    intro: "Sigue protocolos, partners, pruebas, bloqueos y la próxima acción concreta. Una integración solo aparece conectada cuando existe evidencia.",
    add: "+ Agregar objetivo", search: "Buscar", placeholder: "Buscar Shopify, pagos, viajes...", category: "Categoría", allCategories: "Todas las categorías", priority: "Prioridad", stage: "Estado", allStages: "Todos los estados", clear: "Limpiar filtros", targets: "objetivos", filtered: "Vista filtrada", defaultView: "Vista predeterminada: todas las conexiones", columns: ["Objetivo", "Estado", "Prioridad", "Ruta", "Próxima acción", "Evidencia"], evidence: "Abrir evidencia", empty: "No hay coincidencias.", emptyText: "Prueba otra búsqueda, categoría, estado o prioridad.", showAll: "Mostrar todo", next: "PRÓXIMO OBJETIVO", nextTitle: "Trae un producto, API o MCP.", nextText: "Verificamos la interfaz oficial, elegimos la ruta útil más pequeña y definimos una primera prueba reversible.", cta: "Usa el onboarding para developers", ctaText: "Sigue el checklist autoservicio y comparte el brief con tu developer o agente de implementación.", open: "Abrir portal de developers",
  },
  pt: {
    docs: "Portal de developers", eyebrow: "LABORATÓRIO DE INTEGRAÇÕES", title: "Cada conexão. Um status honesto.",
    intro: "Acompanhe protocolos, parceiros, testes, bloqueios e a próxima ação concreta. Uma integração só aparece conectada quando existe evidência.",
    add: "+ Adicionar objetivo", search: "Pesquisar", placeholder: "Pesquisar Shopify, pagamentos, viagens...", category: "Categoria", allCategories: "Todas as categorias", priority: "Prioridade", stage: "Status", allStages: "Todos os status", clear: "Limpar filtros", targets: "objetivos", filtered: "Visão filtrada", defaultView: "Visão padrão: todas as conexões", columns: ["Objetivo", "Status", "Prioridade", "Rota", "Próxima ação", "Evidência"], evidence: "Abrir evidência", empty: "Nenhum objetivo encontrado.", emptyText: "Tente outra busca, categoria, status ou prioridade.", showAll: "Mostrar tudo", next: "PRÓXIMO OBJETIVO", nextTitle: "Traga um produto, API ou MCP.", nextText: "Verificamos a interface oficial, escolhemos a menor rota útil e definimos um primeiro teste reversível.", cta: "Use o onboarding para developers", ctaText: "Siga o checklist self-service e compartilhe o briefing com seu developer ou agente de implementação.", open: "Abrir portal de developers",
  },};

export default function Connections() {
  const { locale, setLocale } = useLocale();
  const t = ui[locale];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [stage, setStage] = useState<StageFilter>("All");
  const [priority, setPriority] = useState<PriorityFilter>("All");
  const labelStage = (value: string) => locale === "es" ? stageEs[value] ?? value : locale === "pt" ? stagePt[value] ?? value : value;

  const counts = Object.fromEntries(stages.map((item) => [item, connections.filter((connection) => connection.stage === item).length]));
  const visibleConnections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return connections.filter((connection) => {
      const searchable = [connection.name, connection.category, connection.stage, connection.route, connection.proof, connection.nextAction].join(" ").toLowerCase();
      return (!needle || searchable.includes(needle)) && (category === "All" || connection.category === category) && (stage === "All" || connection.stage === stage) && (priority === "All" || connection.priority === priority);
    });
  }, [query, category, stage, priority]);
  const hasFilters = Boolean(query.trim() || category !== "All" || stage !== "All" || priority !== "All");
  function clearFilters() { setQuery(""); setCategory("All"); setStage("All"); setPriority("All"); }

  return (
    <main className="lab shell">
      <nav className="lab-nav"><Link className="brand" href="/"><BrandLockup /></Link><div className="lab-nav-actions"><Link href="/connections/bazaar">{locale === "es" ? "Conectar Bazaar" : "Connect Bazaar"}</Link><Link href="/developers">{t.docs}</Link><LanguageToggle locale={locale} onChange={setLocale} compact /></div></nav>
      <header className="lab-hero"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro} <strong>{connections.length}</strong></p></div><a className="lab-add" href="#submit-target">{t.add}</a></header>
      <section className="lab-stats" aria-label="Integration stage totals">{stages.map((item) => <button type="button" key={item} className={stage === item ? "active" : ""} aria-pressed={stage === item} onClick={() => setStage(stage === item ? "All" : item)}><strong>{counts[item]}</strong><span>{labelStage(item)}</span></button>)}</section>
      <section className="lab-controls" aria-label="Connection filters"><div className="filter-topline"><label className="filter-group filter-search"><span>{t.search}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.placeholder} /></label><label className="filter-group filter-select"><span>{t.category}</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">{t.allCategories}</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><div className="filter-group priority-filter"><span>{t.priority}</span><div className="filter-buttons">{(["All", ...priorities] as PriorityFilter[]).map((item) => <button type="button" key={item} className={priority === item ? "active" : ""} aria-pressed={priority === item} onClick={() => setPriority(item)}>{item}</button>)}</div></div></div><div className="filter-bottomline"><div className="filter-group"><span>{t.stage}</span><div className="filter-buttons">{(["All", ...stages] as StageFilter[]).map((item) => <button type="button" key={item} className={stage === item ? "active" : ""} aria-pressed={stage === item} onClick={() => setStage(item)}>{item === "All" ? t.allStages : labelStage(item)}</button>)}</div></div><button type="button" className="clear-filters" onClick={clearFilters} disabled={!hasFilters}>{t.clear}</button></div></section>
      <div className="tracker-summary" aria-live="polite"><strong>{visibleConnections.length}</strong> {locale === "en" ? "of" : "de"} {connections.length} {t.targets}<small>{hasFilters ? t.filtered : t.defaultView}</small></div>
      <section className="connection-list" aria-label="Integration targets"><div className="connection-list-head" aria-hidden="true">{t.columns.map((column) => <span key={column}>{column}</span>)}</div>{visibleConnections.map((connection) => <article className="connection-row" key={connection.name}><div className="connection-name">{connection.focus && <span className="target-focus">{connection.focus}</span>}<small>{connection.category}</small><h2>{connection.name}</h2><time>{connection.updated}</time></div><div className="mobile-label">{t.columns[1]}</div><div><span className={`stage ${slug(connection.stage)}`}>{labelStage(connection.stage)}</span></div><div className="mobile-label">{t.columns[2]}</div><div><b className={`priority ${connection.priority.toLowerCase()}`}>{connection.priority}</b></div><div className="mobile-label">{t.columns[3]}</div><p>{connection.route}</p><div className="mobile-label">{t.columns[4]}</div><p>{connection.nextAction}</p><div className="mobile-label">{t.columns[5]}</div><div className="connection-proof"><span>{connection.proof}</span><a href={connection.href} target={connection.href.startsWith("http") ? "_blank" : undefined} rel={connection.href.startsWith("http") ? "noreferrer" : undefined}>{t.evidence}</a></div></article>)}{visibleConnections.length === 0 && <div className="connection-empty"><strong>{t.empty}</strong><span>{t.emptyText}</span><button type="button" onClick={clearFilters}>{t.showAll}</button></div>}</section>
      <section className="lab-submit" id="submit-target"><div><p className="eyebrow">{t.next}</p><h2>{t.nextTitle}</h2><p>{t.nextText}</p></div><div><strong>{t.cta}</strong><p>{t.ctaText}</p><Link className="lab-submit-link" href="/developers#connect-product">{t.open} →</Link></div></section>
    </main>
  );
}
