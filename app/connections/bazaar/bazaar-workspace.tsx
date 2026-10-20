"use client";
import { useEffect, useRef, useState } from "react";
import { requestWorkspaceRead, type WorkspaceValues } from "./workspace-request";
import type { WorkspaceReadInput } from "@/app/bazaar/workspace-read-web";
import styles from "./link.module.css";
const copy = {
  en: {title: "Explore Bazaar", intro: "Use your existing connection to browse services and your private purchases and sales.", identity: "Check my connection", catalog: "Browse services", history: "My purchases and sales", working: "Reading Bazaar…", verified: "Your agent identity was verified.", note: "Reviews are read only. No orders, signatures or payments are created. Commission stays off until the treasury is verified.", review: "Review service terms", reviewed: "Service terms · review only", next: "Next page", partial: "This is a partial result. It does not represent your complete history or catalogue.", empty: "No entries on this page.", complete: "End of the returned list.", fee: "Bazaar commission: 0% (disabled)", amount: "Total / seller receives", recipient: "Seller destination", hash: "Service card hash", network: "Stellar Testnet · USDC", admission: "Budget, buyer quota and seller capacity still need verification before a purchase can be authorized.", paused: "Bazaar reports purchases paused.", payment: "Payment recorded by Bazaar", noPayment: "Payment not confirmed by this record", delivery: "Delivered", noDelivery: "Delivery not confirmed", error: "The read could not be confirmed. No automatic retry was made.", auth: "Sign in to your usual Carmelita account again.", link: "Connect your existing Bazaar agent using the form above.", limited: "Bazaar is limiting requests. Try again later.", changed: "The service card changed. Reload the catalogue before reviewing it again.", commission: "This service cannot be reviewed with commission disabled.", yes: "Yes", no: "No" },
  es: {title: "Explora Bazaar", intro: "Usa tu conexión existente para consultar servicios y tus compras y ventas privadas.", identity: "Comprobar mi conexión", catalog: "Consultar servicios", history: "Mis compras y ventas", working: "Consultando Bazaar…", verified: "La identidad de tu agente fue verificada.", note: "Las revisiones son de solo lectura. No se crean pedidos, firmas ni pagos. La comisión sigue desactivada hasta verificar la tesorería.", review: "Revisar condiciones del servicio", reviewed: "Condiciones · solo revisión", next: "Página siguiente", partial: "El resultado es parcial. No representa todo tu historial o catálogo.", empty: "No hay registros en esta página.", complete: "Fin de la lista devuelta.", fee: "Comisión de Bazaar: 0% (desactivada)", amount: "Total / importe para el vendedor", recipient: "Destino del vendedor", hash: "Hash de la ficha", network: "Stellar Testnet · USDC", admission: "Falta verificar presupuesto, cuota del comprador y capacidad del vendedor antes de autorizar una compra.", paused: "Bazaar indica que las compras están pausadas.", payment: "Pago registrado por Bazaar", noPayment: "Este registro no confirma el pago", delivery: "Entregado", noDelivery: "Entrega sin confirmar", error: "No se pudo confirmar la consulta. No hubo reintento automático.", auth: "Vuelve a ingresar a tu cuenta habitual de Carmelita.", link: "Conecta tu agente existente de Bazaar usando el formulario de arriba.", limited: "Bazaar limita las consultas. Inténtalo más tarde.", changed: "La ficha cambió. Actualiza el catálogo antes de revisarla otra vez.", commission: "No se puede revisar este servicio con la comisión desactivada.", yes: "Sí", no: "No" },
};
export function BazaarWorkspace({language, getAccessToken}: {language: "en" | "es"; getAccessToken(): Promise<string | null>}) {
  const t = copy[language], active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [identity, setIdentity] = useState<WorkspaceValues["identity"] | null>(null);
  const [catalog, setCatalog] = useState<WorkspaceValues["catalog"] | null>(null);
  const [history, setHistory] = useState<WorkspaceValues["history"] | null>(null);
  const [catalogCursor, setCatalogCursor] = useState<string | undefined>();
  const [review, setReview] = useState<WorkspaceValues["review"] | null>(null);
  useEffect(() => {
    const clear = () => { active.current?.abort(); active.current = null; setIdentity(null); setCatalog(null); setHistory(null); setReview(null); setError(""); setBusy(false); };
    window.addEventListener("pagehide", clear);
    return () => { active.current?.abort(); window.removeEventListener("pagehide", clear); };
  }, []);
  async function read(input: WorkspaceReadInput) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError("");
    // Clear prior owner-bound data on every new read; failed identity checks
    // must never leave an old success or previously read private page visible.
    setIdentity(null); setReview(null); if (input.action !== "review") { setCatalog(null); setHistory(null); }
    try {
      const deps = {pageOrigin: window.location.origin, getAccessToken, signal: controller.signal};
      if (input.action === "identity") { const v = await requestWorkspaceRead(input, deps); if (!controller.signal.aborted) setIdentity(v); }
      if (input.action === "catalog") { const v = await requestWorkspaceRead(input, deps); if (!controller.signal.aborted) { setCatalog(v); setCatalogCursor(input.cursor); } }
      if (input.action === "history") { const v = await requestWorkspaceRead(input, deps); if (!controller.signal.aborted) setHistory(v); }
      if (input.action === "review") { const v = await requestWorkspaceRead(input, deps); if (!controller.signal.aborted) setReview(v); }
    } catch (e) { if (!controller.signal.aborted) { setIdentity(null); setCatalog(null); setHistory(null); setReview(null); setError(e instanceof Error ? e.message : "unconfirmed"); } }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  const message = error === "authentication_required" ? t.auth : error === "bazaar_native_link_required" ? t.link : error === "bazaar_native_capacity_limited" ? t.limited : error === "bazaar_native_card_changed" ? t.changed : error === "bazaar_native_commission_disabled" ? t.commission : t.error;
  return <section className={styles.workspace} aria-label={t.title} aria-busy={busy}>
    <h2>{t.title}</h2><p>{t.intro}</p><p className={styles.note}>{t.note}</p>
    <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void read({action: "identity"})}>{t.identity}</button><button type="button" disabled={busy} onClick={() => void read({action: "catalog"})}>{t.catalog}</button><button type="button" disabled={busy} onClick={() => void read({action: "history"})}>{t.history}</button></div>
    <p role="status" aria-live="polite">{busy ? t.working : error ? message : identity ? t.verified : ""}</p>
    {catalog && <div><h3>{t.catalog}</h3>{catalog.paused && <p>{t.paused}</p>}{catalog.services.map(service => <article className={styles.entry} key={service.id}><h4>{service.name}</h4><p>{service.provider}</p><p>{service.description}</p><button type="button" disabled={busy || catalog.paused} onClick={() => void read({action: "review", serviceId: service.id, cardHash: service.cardHash, ...(catalogCursor ? {catalogCursor} : {})})}>{t.review}</button></article>)}{!catalog.services.length && <p>{t.empty}</p>}{catalog.partialResults && <p>{t.partial}</p>}{catalog.nextCursor ? <button type="button" disabled={busy} onClick={() => void read({action: "catalog", cursor: catalog.nextCursor as string})}>{t.next}</button> : !catalog.partialResults && <p>{t.complete}</p>}</div>}
    {review && <section className={styles.entry} aria-label={t.reviewed}><h3>{t.reviewed}</h3><h4>{review.name}</h4><p>{t.network}</p><p>{t.amount}: {review.amount} USDC</p><p>{t.fee}</p><dl><dt>{t.recipient}</dt><dd>{review.recipient}</dd><dt>{t.hash}</dt><dd>{review.cardHash}</dd></dl><p>{t.admission}</p></section>}
    {history && <div><h3>{t.history}</h3>{history.orders.map(order => <article className={styles.entry} key={order.operationId}><h4>{order.serviceId}</h4><p>{order.perspective === "purchase" ? (language === "es" ? "Compra" : "Purchase") : (language === "es" ? "Venta" : "Sale")} · {order.phase}</p><p>{order.operationId}</p><p>{order.paymentVerifiedByBazaar ? t.payment : t.noPayment}</p><p>{order.delivered ? t.delivery : t.noDelivery}</p></article>)}{!history.orders.length && <p>{t.empty}</p>}{history.partialResults && <p>{t.partial}</p>}{history.nextCursor ? <button type="button" disabled={busy} onClick={() => void read({action: "history", cursor: history.nextCursor!})}>{t.next}</button> : !history.partialResults && <p>{t.complete}</p>}</div>}
  </section>;
}
