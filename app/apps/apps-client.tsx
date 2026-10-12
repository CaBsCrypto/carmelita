"use client";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandLockup from "@/app/brand-lockup";
import LanguageToggle, { useLocale } from "@/app/language-toggle";
import type { AppDefinition, OwnApp, PublicAppChange } from "./types";
import BazaarPanel from "./bazaar-panel";
import access from "@/app/account-access.module.css";
import styles from "./apps.module.css";
import { requestOwnedAppJson } from "./browser-request";

export const appsCopy = {
  en: { title: "Your apps, in Carmelita.", text: "Choose an approved application and review its permissions. It is added only to your account, wherever you use Carmelita.", home: "Carmelita home", agent: "Open Carmelita", skip: "Skip to apps", sign: "Sign in or create account", unavailable: "Sign-in is unavailable in this local environment.", loading: "Loading your apps…", retry: "Refresh", error: "Your apps could not be updated. Check your connection and try again.", available: "Available applications", own: "Added to your account", add: "Add Bazaar", remove: "Remove Bazaar", review: "Awaiting review", preparing: "Preparing your private connection", active: "Connected", removed: "Removed", pending: "Remote disconnection pending", reviewTitle: "Review this change", addText: "Prepare your private Bazaar profile and access its changing catalog and your own results. Adding Bazaar does not authorize a payment.", removeText: "New access stops immediately. Your profile and previous operations remain recoverable. Other users are unaffected.", confirm: "Confirm", cancel: "Cancel", busy: "Working…", permission: "Permissions", boundary: "Services are consumed from Carmelita. ChatGPT can query your catalog and existing results; it cannot initiate a purchase.", empty: "You have not added an application yet.", close: "Close confirmation", detail: "View Bazaar" },
  es: { title: "Tus aplicaciones, en Carmelita.", text: "Elige una aplicación aprobada y revisa sus permisos. Se añade sólo a tu cuenta, donde uses Carmelita.", home: "Inicio de Carmelita", agent: "Abrir Carmelita", skip: "Ir a aplicaciones", sign: "Iniciar sesión o crear cuenta", unavailable: "El ingreso no está disponible en este entorno local.", loading: "Cargando tus aplicaciones…", retry: "Actualizar", error: "No pudimos actualizar tus aplicaciones. Comprueba la conexión y vuelve a intentarlo.", available: "Aplicaciones disponibles", own: "Añadidas a tu cuenta", add: "Añadir Bazaar", remove: "Quitar Bazaar", review: "En revisión", preparing: "Preparando tu conexión privada", active: "Conectada", removed: "Retirada", pending: "Desconexión remota pendiente", reviewTitle: "Revisa este cambio", addText: "Prepara tu perfil privado en Bazaar para consultar su catálogo cambiante y tus resultados. Añadir Bazaar no autoriza un pago.", removeText: "El acceso nuevo se detiene inmediatamente. Tu perfil y operaciones previas se pueden recuperar. No afecta a otros usuarios.", confirm: "Confirmar", cancel: "Cancelar", busy: "Procesando…", permission: "Permisos", boundary: "Los servicios se consumen desde Carmelita. ChatGPT puede consultar tu catálogo y resultados existentes; no puede iniciar compras.", empty: "Todavía no has añadido una aplicación.", close: "Cerrar confirmación", detail: "Ver Bazaar" },
  pt: { title: "Seus aplicativos, na Carmelita.", text: "Escolha um aplicativo aprovado e revise as permissões. Ele é adicionado somente à sua conta, onde você usar a Carmelita.", home: "Início da Carmelita", agent: "Abrir Carmelita", skip: "Ir aos aplicativos", sign: "Entrar ou criar conta", unavailable: "O acesso não está disponível neste ambiente local.", loading: "Carregando seus aplicativos…", retry: "Atualizar", error: "Não foi possível atualizar seus aplicativos. Verifique a conexão e tente novamente.", available: "Aplicativos disponíveis", own: "Adicionados à sua conta", add: "Adicionar Bazaar", remove: "Remover Bazaar", review: "Em análise", preparing: "Preparando sua conexão privada", active: "Conectado", removed: "Removido", pending: "Desconexão remota pendente", reviewTitle: "Revise esta alteração", addText: "Prepare seu perfil privado no Bazaar para consultar o catálogo atualizado e seus resultados. Adicionar Bazaar não autoriza um pagamento.", removeText: "Novos acessos param imediatamente. Seu perfil e operações anteriores continuam recuperáveis. Outros usuários não são afetados.", confirm: "Confirmar", cancel: "Cancelar", busy: "Processando…", permission: "Permissões", boundary: "Os serviços são consumidos na Carmelita. O ChatGPT pode consultar seu catálogo e resultados existentes; não pode iniciar compras.", empty: "Você ainda não adicionou um aplicativo.", close: "Fechar confirmação", detail: "Ver Bazaar" },
};
export default function AppsClient({ configured }: { configured: boolean }) {
  const { locale, setLocale } = useLocale(); const t = appsCopy[locale];
  return <main className={access.page} lang={locale === "pt" ? "pt-BR" : locale}><div className={access.shell}>
    <a className={access.skipLink} href="#my-apps">{t.skip}</a>
    <header className={access.header}><Link href="/" className={access.brand} aria-label={t.home}><BrandLockup /></Link><div className={access.headerActions}><Link href="/agent" className={access.textLink}>{t.agent}</Link><LanguageToggle locale={locale} onChange={setLocale} compact /></div></header>
    <div className={access.content} id="my-apps" tabIndex={-1}><h1 className={access.title}>{t.title}</h1><p className={access.lede}>{t.text}</p>
      {configured ? <AuthenticatedApps key="account-apps" /> : <p role="status" className={access.status}>{t.unavailable}</p>}
    </div>
  </div></main>;
}
function AuthenticatedApps() {
  const { ready, authenticated, login, user } = usePrivy(); const { locale } = useLocale(); const t = appsCopy[locale];
  if (!ready) return <p role="status" className={access.status}>{t.loading}</p>;
  if (!authenticated || !user) return <button className={access.primary} type="button" onClick={login}>{t.sign}</button>;
  return <AccountApps key={user.id} accountId={user.id} />;
}
function AccountApps({ accountId }: { accountId: string }) {
  const { getAccessToken } = usePrivy(); const { locale } = useLocale(); const t = appsCopy[locale];
  const [data, setData] = useState<{ available: AppDefinition[]; own: OwnApp[] } | null>(null);
  const [pending, setPending] = useState<{ change: PublicAppChange; confirmationToken: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const mounted = useRef(false);
  const request = useCallback(async (body?: unknown) => {
    return requestOwnedAppJson("/api/agent/apps", body, { getToken: getAccessToken, active: () => mounted.current });
  }, [getAccessToken]);
  const refresh = useCallback(async () => { try { const result = await request(); if (mounted.current) { setData(result); setError(false); } } catch { if (mounted.current) setError(true); } }, [request]);
  useEffect(() => { mounted.current = true; queueMicrotask(() => { if (mounted.current) void refresh(); }); return () => { mounted.current = false; }; }, [refresh, accountId]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);
  async function prepare(action: "add" | "remove") {
    setBusy(true); setError(false);
    try { const next = await request({ operation: "prepare", appId: "bazaar", action, idempotencyKey: crypto.randomUUID() }); if (mounted.current) setPending(next); }
    catch { if (mounted.current) setError(true); } finally { if (mounted.current) setBusy(false); }
  }
  async function finish(confirm: boolean) {
    if (!pending || busy) return; setBusy(true);
    try { await request(confirm ? { operation: "confirm", changeId: pending.change.id, confirmationToken: pending.confirmationToken } : { operation: "cancel", changeId: pending.change.id }); if (mounted.current) { setPending(null); await refresh(); } }
    catch { if (mounted.current) setError(true); } finally { if (mounted.current) setBusy(false); }
  }
  const installed = data?.own.find(app => app.appId === "bazaar");
  return <>
    <p className={access.note}>{t.boundary}</p>
    {error && <p role="alert" className={access.error}>{t.error}</p>}
    <div className={styles.sectionHead}><h2>{t.available}</h2><button className={access.secondary} type="button" onClick={() => void refresh()} disabled={busy}>{t.retry}</button></div>
    {!data && !error && <p role="status">{t.loading}</p>}
    {data?.available.map(app => <article className={styles.app} key={app.id}><div className={styles.appIdentity}><span className={styles.appIcon} aria-hidden="true">B</span><div><h3>{app.name}</h3><p>{app.description}</p></div></div><div className={styles.appActions}>
      <span className={access.badge}>{installed?.status === "active" ? t.active : installed?.status === "preparing" ? t.preparing : app.approval === "approved" ? t.available : t.review}</span>
      <button type="button" className={installed && installed.status !== "removed" ? access.secondary : access.primary} disabled={busy || ((!installed || installed.status === "removed") && app.approval !== "approved")} onClick={() => void prepare(installed && installed.status !== "removed" ? "remove" : "add")}>{installed && installed.status !== "removed" ? t.remove : t.add}</button>
      {installed && (installed.status === "preparing" || installed.status === "error" || installed.remoteStatus === "revocation_pending") && <button className={access.secondary} type="button" disabled={busy} onClick={async () => { setBusy(true); try { await request({ operation: "retry", appId: "bazaar" }); if (mounted.current) await refresh(); } catch { if (mounted.current) setError(true); } finally { if (mounted.current) setBusy(false); } }}>{({ en: "Retry connection", es: "Reintentar conexión", pt: "Tentar conexão novamente" })[locale]}</button>}
    </div></article>)}
    <section className={styles.owned} aria-label={t.own}><h2>{t.own}</h2>{!data?.own.length && <p>{t.empty}</p>}{data?.own.map(app => <p key={app.id}>{app.definition.name}: {app.status === "active" ? t.active : app.status === "preparing" ? t.preparing : app.status === "removed" ? t.removed : t.error}{app.remoteStatus === "revocation_pending" && <> · {t.pending}</>}</p>)}</section>
    {installed?.status === "active" && <BazaarPanel accountId={accountId} />}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="app-confirm-title" onCancel={event => { event.preventDefault(); void finish(false); }}>
      {pending && <><h2 id="app-confirm-title">{t.reviewTitle}</h2><p>{pending.change.action === "add" ? t.addText : t.removeText}</p>{error && <p role="alert" className={access.error}>{t.error}</p>}<h3>{t.permission}</h3><ul>{pending.change.definition.permissions.map(permission => <li key={permission}>{permission === "catalog:read" ? ({ en: "Read the Bazaar catalog", es: "Consultar el catálogo Bazaar", pt: "Consultar o catálogo Bazaar" })[locale] : ({ en: "Read your own operations and results", es: "Consultar tus operaciones y resultados", pt: "Consultar suas operações e resultados" })[locale]}</li>)}</ul><div className={access.actions}><button className={access.primary} type="button" autoFocus disabled={busy} onClick={() => void finish(true)}>{busy ? t.busy : t.confirm}</button><button className={access.secondary} type="button" disabled={busy} onClick={() => void finish(false)}>{t.cancel}</button></div></>}
    </dialog>
  </>;
}
