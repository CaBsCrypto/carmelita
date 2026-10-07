"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type InspectedIdentity = { id: string; email: string };
const errors: Record<string, string> = {
  admin_auth_required: "Tu sesión administrativa venció. Vuelve a iniciar sesión.",
  registered_user_not_found: "Este registro ya no está disponible.",
  registered_user_inactive: "La cuenta está desactivada. No se prepararon wallets.",
  privy_identity_mismatch: "La identidad del proveedor no coincide. Revisa esta cuenta antes de continuar.",
  verified_email_required: "Privy no devuelve un correo para esta identidad. El usuario debe verificarlo al conectarse.",
  recovery_inspection_changed: "El correo cambió. Vuelve a comprobar la cuenta antes de continuar.",
  wallet_identity_conflict: "Hay un conflicto de identidad. Las wallets existentes requieren revisión.",
  oauth_wallet_preparation_incomplete: "La preparación quedó pendiente. Actualiza el registro y reintenta para recuperar las wallets existentes.",
  wallet_persistence_unavailable: "No se pudo confirmar la persistencia. Actualiza el registro antes de reintentar.",
  provider_identity_unavailable: "No se pudo verificar la cuenta en Privy. Puedes reintentar.",
};

export default function WalletRecovery({ privyDid }: { privyDid: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<InspectedIdentity | null>(null);
  const [busy, setBusy] = useState<"inspect" | "prepare" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => { pending.current?.abort(); }, [privyDid]);

  async function request(operation: "inspect" | "prepare") {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    setBusy(operation);
    setMessage(null);
    setFailed(false);
    try {
      const response = await fetch("/api/admin/wallets/recovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation === "inspect" ? { operation, privyDid }
          : { operation, privyDid, expectedEmail: identity?.email, confirmed: true }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (pending.current !== controller || controller.signal.aborted) return;
      if (!response.ok) {
        if (body.error === "recovery_inspection_changed") setIdentity(null);
        throw new Error(errors[body.error] ?? "No se pudo completar la recuperación. Revisa el registro y reintenta.");
      }
      if (body.identity?.id !== privyDid || typeof body.identity?.email !== "string") {
        throw new Error("La respuesta no corresponde a esta cuenta. Vuelve a comprobarla.");
      }
      if (operation === "inspect") setIdentity(body.identity);
      else {
        if (body.registrationComplete !== true) throw new Error("La preparación todavía no está confirmada.");
        setIdentity(null);
        setMessage(body.testnetActivation?.activation === "active"
          ? "Wallets registradas y activación de Stellar Testnet confirmada. Se conserva la misma dirección. El usuario puede consultarlas desde su conexión vigente."
          : body.testnetActivation?.fundsMoved === null
            ? "Wallets registradas. Friendbot podría seguir procesando la solicitud; no se ha confirmado la recepción de XLM Testnet. Actualiza el registro antes de reintentar con la misma dirección."
            : "Wallets registradas. La activación de Stellar Testnet sigue pendiente o no pudo comprobarse. Actualiza el registro y reintenta con la misma dirección.");
      }
    } catch (error) {
      if (pending.current !== controller) return;
      setFailed(true);
      setMessage(controller.signal.aborted
        ? "La solicitud tardó demasiado. Actualiza el registro antes de reintentar; el servidor puede haber guardado avances."
        : error instanceof Error ? error.message : "No se pudo recuperar esta cuenta.");
    } finally {
      window.clearTimeout(timer);
      if (pending.current === controller) {
        pending.current = null;
        setBusy(null);
        if (operation === "prepare") router.refresh();
      }
    }
  }

  return <details className="wallet-recovery" onToggle={event => {
    if (!event.currentTarget.open && !busy) { setIdentity(null); setMessage(null); }
  }}>
    <summary>Recuperar wallets y activación Stellar Testnet</summary>
    <div className="wallet-recovery-content" aria-busy={busy !== null}>
      <p>Comprueba primero el correo verificado de esta identidad. Se conservan sus direcciones existentes. Si falta activar Stellar Testnet, se solicita XLM al Friendbot oficial para la misma wallet. Son fondos de prueba sin valor real; esta acción no autoriza pagos, Mainnet ni financiación en USDC y no cambia los permisos de ChatGPT.</p>
      {identity && <div className="wallet-recovery-identity">
        <strong>{identity.email}</strong><code>{identity.id}</code>
        <span>Cuenta comprobada en Privy. Se completará el registro y, si falta, se intentará activar su misma wallet Stellar Testnet con Friendbot.</span>
      </div>}
      <div className="wallet-recovery-actions">
        <button type="button" disabled={busy !== null} onClick={() => void request(identity ? "prepare" : "inspect")}>
          {busy === "inspect" ? "Comprobando cuenta…" : busy === "prepare" ? "Preparando wallets y Stellar Testnet…" : identity ? "Completar wallets y activar Stellar Testnet" : "Comprobar cuenta"}
        </button>
        {identity && <button type="button" disabled={busy !== null} onClick={() => { setIdentity(null); setMessage(null); }}>Cancelar</button>}
      </div>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "wallet-recovery-error" : "wallet-recovery-result"}>{message}</p>}
    </div>
  </details>;
}
