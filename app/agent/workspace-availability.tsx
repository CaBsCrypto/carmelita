"use client";

import { useEffect, useState } from "react";
import type { GatewayCapability } from "../agent-gateway/types";
import type { Locale } from "../language-toggle";
import { readWorkspaceQuery } from "./workspace-queries";

const ids = ["personal.wallets", "personal.wallets.balances", "offchain.market.quote", "offchain.defillama.chains", "personal.watchlist", "personal.connections", "offchain.notion.search", "offchain.travala.hotel_search"];
const copy = {
  es: { title: "Estado de las consultas", loading: "Consultando el catálogo…", error: "El catálogo no está disponible. Reintenta al abrir este panel.", historical: "Validación previa", pending: "Validación pendiente", connection: "Requiere conexión personal", channel: "Carmelita y ChatGPT", note: "La validación previa es histórica. Cada consulta comprueba su fuente y devuelve la disponibilidad actual.", names: ["Billeteras", "Saldos Testnet", "Precios Mainnet", "TVL de redes", "Watchlist", "Conexiones", "Buscar en Notion", "Buscar hoteles"] },
  en: { title: "Query status", loading: "Reading the catalog…", error: "The catalog is unavailable. Reopen this panel to retry.", historical: "Previously validated", pending: "Validation pending", connection: "Needs a personal connection", channel: "Carmelita and ChatGPT", note: "Previous validation is historical. Each query checks its source and reports current availability.", names: ["Wallets", "Testnet balances", "Mainnet prices", "Network TVL", "Watchlist", "Connections", "Search Notion", "Search hotels"] },
  pt: { title: "Estado das consultas", loading: "Consultando o catálogo…", error: "O catálogo está indisponível. Reabra este painel para tentar novamente.", historical: "Validação anterior", pending: "Validação pendente", connection: "Requer conexão pessoal", channel: "Carmelita e ChatGPT", note: "A validação anterior é histórica. Cada consulta verifica a fonte e informa a disponibilidade atual.", names: ["Carteiras", "Saldos Testnet", "Preços Mainnet", "TVL das redes", "Watchlist", "Conexões", "Buscar no Notion", "Buscar hotéis"] },
};

export default function WorkspaceAvailability({ locale, getAccessToken }: { locale: Locale; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const [capabilities, setCapabilities] = useState<GatewayCapability[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readWorkspaceQuery<{ capabilities: GatewayCapability[] }>("offchain.capabilities.list", getAccessToken, locale, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setCapabilities(result.capabilities); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [getAccessToken, locale]);
  return <details className="workspace-availability">
    <summary>{t.title}</summary><p>{t.note}</p>
    {error ? <p role="alert">{t.error}</p> : capabilities === null ? <p role="status">{t.loading}</p> : <ul>
      {ids.map((id, index) => {
        const capability = capabilities.find(item => item.id === id);
        if (!capability?.availability) return null;
        return <li key={id}><strong>{t.names[index]}</strong><span>{capability.availability.acceptance === "accepted" ? t.historical : t.pending}</span>
          {capability.channels?.carmelita && capability.channels.chatgpt && <small>{t.channel}</small>}
          {capability.availability.connection === "required" && <small>{t.connection}</small>}
        </li>;
      })}
    </ul>}
  </details>;
}
