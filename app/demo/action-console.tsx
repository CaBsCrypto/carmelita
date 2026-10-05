"use client";

import { useEffect, useState } from "react";
import type { Offer } from "../domain";

const pretty = (value: string) => value.replaceAll("_", " ").replaceAll("-", " ");

export default function ActionConsole() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/commerce", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        const result = await response.json() as { offers: Offer[] };
        if (!Array.isArray(result.offers)) throw new Error("catalog_unavailable");
        if (controller.signal.aborted) return;
        setOffers(result.offers);
        setSelectedId(result.offers[0]?.id ?? "");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("The catalog is unavailable. Please reload to try again.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const selected = offers.find((offer) => offer.id === selectedId);
  return (
    <section className="action-console shell" aria-label="Public service catalog">
      <div className="action-workspace">
        <div className="action-builder">
          <header>
            <div><p className="eyebrow">PUBLIC CATALOG</p><h2>{selected?.title ?? (loading ? "Loading offers…" : "Explore services")}</h2></div>
            <span className="sandbox-state">Read-only</span>
          </header>
          <label className="offer-picker">
            <span>Catalog offer</span>
            <select disabled={loading || offers.length === 0} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {offers.map((offer) => <option value={offer.id} key={offer.id}>{offer.merchant} — {offer.title}</option>)}
            </select>
          </label>
          {selected && <div className="offer-summary">
            <div><span>Merchant</span><strong>{selected.merchant}</strong></div>
            <div><span>Listed amount</span><strong>{selected.amount} {selected.currency}</strong></div>
            <div><span>Network</span><strong>{pretty(selected.network)}</strong></div>
            <div><span>Availability</span><strong>{pretty(selected.availability)}</strong></div>
            <p>{selected.description}</p>
          </div>}
          {!loading && !error && offers.length === 0 && <p>No offers are published.</p>}
          {error && <p className="action-error" role="alert">{error}</p>}
          <small className="action-disclosure">Catalog listings may be demos or pending provider acceptance. Purchase availability must be verified separately.</small>
        </div>
        <aside className="receipt-panel">
          <header><span>OPERATIONS</span><b>UNAVAILABLE</b></header>
          <div className="receipt-empty">
            <strong>Public demo operations are disabled</strong>
            <p>This catalog cannot prepare, authorize or execute operations, or retrieve private receipts.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
