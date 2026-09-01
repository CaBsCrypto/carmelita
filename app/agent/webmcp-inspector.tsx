"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/app/language-toggle";
import {
  detectWebMcpStatus,
  registerCarmelitaWebMcpTools,
  type WebMcpStatus,
} from "@/app/webmcp-client";

const copy = {
  en: {
    title: "WebMCP Protocol Status",
    active: "WebMCP Native Active",
    testingFlag: "Chrome Flag Required",
    instructions: "Enable chrome://flags/#enable-webmcp-testing in Google Chrome to allow browser-native LLM agent discovery.",
    registeredTools: "Registered WebMCP Tools",
    noTools: "No tools registered yet",
    refresh: "Re-check WebMCP",
  },
  es: {
    title: "Estado del Protocolo WebMCP",
    active: "WebMCP Nativo Activo",
    testingFlag: "Requiere Flag en Chrome",
    instructions: "Activa chrome://flags/#enable-webmcp-testing en Google Chrome para permitir el descubrimiento nativo del agente por LLMs en el navegador.",
    registeredTools: "Herramientas WebMCP Registradas",
    noTools: "Sin herramientas registradas aún",
    refresh: "Re-verificar WebMCP",
  },
  pt: {
    title: "Status do Protocolo WebMCP",
    active: "WebMCP Nativo Ativo",
    testingFlag: "Requer Flag no Chrome",
    instructions: "Ative chrome://flags/#enable-webmcp-testing no Google Chrome para permitir a descoberta nativa do agente no navegador.",
    registeredTools: "Ferramentas WebMCP Registradas",
    noTools: "Nenhuma ferramenta registrada ainda",
    refresh: "Re-verificar WebMCP",
  },
};

export default function WebMcpInspector({
  locale,
  getAccessToken,
}: {
  locale: Locale;
  getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const [status, setStatus] = useState<WebMcpStatus>(() => detectWebMcpStatus());

  async function syncRegistration() {
    const nextStatus = await registerCarmelitaWebMcpTools(getAccessToken);
    setStatus(nextStatus);
  }

  useEffect(() => {
    void syncRegistration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="webmcp-inspector-card" style={{
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: "12px",
      padding: "16px 20px",
      background: "rgba(15, 23, 42, 0.6)",
      backdropFilter: "blur(12px)",
      color: "#e2e8f0",
      marginTop: "16px",
    }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚙️</span> {t.title}
        </h4>
        <span style={{
          fontSize: "12px",
          padding: "3px 8px",
          borderRadius: "999px",
          fontWeight: 600,
          background: status.supported ? "rgba(34, 197, 94, 0.2)" : "rgba(234, 179, 8, 0.2)",
          color: status.supported ? "#4ade80" : "#facc15",
          border: status.supported ? "1px solid rgba(74, 222, 128, 0.4)" : "1px solid rgba(250, 204, 21, 0.4)",
        }}>
          {status.supported ? t.active : t.testingFlag}
        </span>
      </header>

      {status.flagInstructionsNeeded && (
        <div style={{
          fontSize: "13px",
          background: "rgba(30, 41, 59, 0.8)",
          borderLeft: "3px solid #facc15",
          padding: "8px 12px",
          borderRadius: "4px",
          marginBottom: "12px",
          color: "#cbd5e1",
        }}>
          💡 <strong>OpenAI / Chrome WebMCP Challenge:</strong> {t.instructions}
        </div>
      )}

      <div>
        <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: "6px" }}>
          {t.registeredTools} ({status.toolsRegistered.length})
        </div>
        {status.toolsRegistered.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#38bdf8" }}>
            {status.toolsRegistered.map((name) => (
              <li key={name} style={{ margin: "2px 0" }}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>{t.noTools}</p>
        )}
      </div>

      <button
        onClick={() => void syncRegistration()}
        style={{
          marginTop: "12px",
          fontSize: "12px",
          padding: "4px 10px",
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "6px",
          color: "#f8fafc",
          cursor: "pointer",
        }}
      >
        {t.refresh}
      </button>
    </aside>
  );
}
