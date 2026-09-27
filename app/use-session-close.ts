"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { closeSessions } from "./session-close";
import type { Locale } from "./locale-store";

export const sessionCloseCopy = {
  en: { closing: "Closing sessions…", failed: "Both sessions could not be confirmed closed. Retry before changing accounts.", closed: "Administrator and Privy sessions closed.", retry: "Retry closing sessions" },
  es: { closing: "Cerrando sesiones…", failed: "No se pudo confirmar el cierre de ambas sesiones. Reintenta antes de cambiar de cuenta.", closed: "Sesiones de administrador y Privy cerradas.", retry: "Reintentar cierre de sesiones" },
  pt: { closing: "Encerrando sessões…", failed: "Não foi possível confirmar o encerramento das duas sessões. Tente novamente antes de trocar de conta.", closed: "Sessões de administrador e Privy encerradas.", retry: "Tentar encerrar as sessões novamente" },
} satisfies Record<Locale, Record<string, string>>;

export function useSessionClose() {
  const { ready, authenticated, logout } = usePrivy();
  const observed = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const [state, setState] = useState<"idle" | "closing" | "failed" | "closed">("idle");
  useEffect(() => { observed.current = ready && !authenticated; }, [ready, authenticated]);
  async function close() {
    if (pending.current) return pending.current;
    setState("closing");
    const operation = (async () => {
      try {
        await closeSessions({ logoutPrivy: logout, observePrivySignedOut: async () => {
          const deadline = Date.now() + 5000;
          while (!observed.current && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
          if (!observed.current) throw new Error("privy_state_not_observed");
        } });
        setState("closed");
        return true;
      } catch { setState("failed"); return false; }
      finally { pending.current = null; }
    })();
    pending.current = operation;
    return operation;
  }
  return { state, closing: state === "closing", close };
}
