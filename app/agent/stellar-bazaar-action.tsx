"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/app/language-toggle";

export type StellarBazaarAction = { query: string };

type BazaarOffer = {
  id: string;
  name: string;
  description: string;
  provider: string;
  kind: string;
  network: string;
  scheme: string;
  assetSymbol: string;
  amountDisplay: string;
  url: string;
  input: { name: string; type: string; required: boolean }[];
  tags: string[];
  consumable: boolean;
  unavailableReason: string | null;
};

type BazaarSearch = {
  query: string;
  rankingVersion: string;
  offers: BazaarOffer[];
  partialResults: boolean;
  dynamicRegistry: string;
  source: "stellar-bazaar";
};

const copy = {
  en: {
    searching: "Searching the public catalog...", retry: "Search again",
    results: (n: number) => `${n} listed service${n === 1 ? "" : "s"}`,
    empty: "Stellar Bazaar returned no match for this query.",
    provider: "Provider", price: "Price", network: "Network", kind: "Kind",
    input: "Input", tags: "Tags", consumable: "Delivery contract listed",
    notConsumable: "Not consumable", reason: "Why",
    partial: "The dynamic registry was unavailable: the catalog may be incomplete. This is not an empty result.",
    boundary: "Discovery only: no preparation, approval, signature or payment runs from this card.",
    failed: "The Bazaar search failed. No provider was contacted.",
  },
  es: {
    searching: "Buscando en el catálogo público...", retry: "Buscar otra vez",
    results: (n: number) => `${n} servicio${n === 1 ? "" : "s"} listado${n === 1 ? "" : "s"}`,
    empty: "Stellar Bazaar no devolvió coincidencias para esta consulta.",
    provider: "Proveedor", price: "Precio", network: "Red", kind: "Tipo",
    input: "Entrada", tags: "Etiquetas", consumable: "Contrato de entrega publicado",
    notConsumable: "No consumible", reason: "Motivo",
    partial: "El registro dinámico no estuvo disponible: el catálogo puede estar incompleto. No es un resultado vacío.",
    boundary: "Solo descubrimiento: esta ficha no prepara, aprueba, firma ni paga nada.",
    failed: "La búsqueda en Bazaar falló. No se contactó ningún proveedor.",
  },
  pt: {
    searching: "Pesquisando no catálogo público...", retry: "Pesquisar novamente",
    results: (n: number) => `${n} serviço${n === 1 ? "" : "s"} listado${n === 1 ? "" : "s"}`,
    empty: "A Stellar Bazaar não retornou correspondências para esta consulta.",
    provider: "Provedor", price: "Preço", network: "Rede", kind: "Tipo",
    input: "Entrada", tags: "Tags", consumable: "Contrato de entrega publicado",
    notConsumable: "Não consumível", reason: "Motivo",
    partial: "O registro dinâmico estava indisponível: o catálogo pode estar incompleto. Não é um resultado vazio.",
    boundary: "Somente descoberta: este cartão não prepara, aprova, assina nem paga nada.",
    failed: "A pesquisa na Bazaar falhou. Nenhum provedor foi contatado.",
  },
};

export default function StellarBazaarActionCard({
  action,
  locale,
  getAccessToken,
}: {
  action: StellarBazaarAction;
  locale: Locale;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<BazaarSearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  async function search() {
    setState("loading");
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("stellar_bazaar_authorization_required");
      const response = await fetch(
        "/api/agent/stellar-bazaar?query=" + encodeURIComponent(action.query),
        { headers: { Authorization: "Bearer " + token } },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "stellar_bazaar_request_failed");
      setResult(body as BazaarSearch);
      setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "stellar_bazaar_request_failed");
      setState("error");
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="defindex-approval" aria-label="Stellar Bazaar discovery">
      <span>STELLAR BAZAAR · {t.results(result?.offers.length ?? 0).toUpperCase()}</span>
      {state === "loading" && <p>{t.searching}</p>}
      {state === "error" && (
        <>
          <p role="status">{t.failed} ({error})</p>
          <button type="button" onClick={() => void search()}>{t.retry}</button>
        </>
      )}
      {result && (
        <>
          {result.partialResults && <p className="agent-chat-error">{t.partial}</p>}
          {result.offers.length === 0 && <p>{t.empty}</p>}
          <ul className="agent-bazaar-offers">
            {result.offers.map((offer) => (
              <li key={offer.id}>
                <strong>{offer.name}</strong>
                <dl>
                  <div><dt>{t.provider}</dt><dd>{offer.provider}</dd></div>
                  <div><dt>{t.price}</dt><dd>{offer.amountDisplay} {offer.assetSymbol}</dd></div>
                  <div><dt>{t.network}</dt><dd>{offer.network}</dd></div>
                  <div><dt>{t.kind}</dt><dd>{offer.kind}</dd></div>
                  <div>
                    <dt>{t.input}</dt>
                    <dd>{offer.input.map((field) => `${field.name}:${field.type}${field.required ? "" : "?"}`).join(", ") || "—"}</dd>
                  </div>
                  <div><dt>{t.tags}</dt><dd>{offer.tags.join(", ") || "—"}</dd></div>
                </dl>
                <span>
                  {offer.consumable
                    ? `✓ ${t.consumable}`
                    : `✗ ${t.notConsumable}${offer.unavailableReason ? ` (${offer.unavailableReason})` : ""}`}
                </span>
              </li>
            ))}
          </ul>
          <p>{t.boundary}</p>
        </>
      )}
    </section>
  );
}
