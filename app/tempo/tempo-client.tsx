"use client";

import { usePrivy } from "@privy-io/react-auth";
import RegistryWalletPanel from "@/app/agent/registry-wallet-panel";

/** This entry point never mounts the workspace or its automatic bootstrap. */
export default function TempoClient() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  if (!ready) return <p role="status">Comprobando tu sesión…</p>;
  if (!authenticated || !user) return <section aria-label="Acceso a Tempo">
    <p>Inicia sesión con la cuenta que ya tiene tu wallet EVM para consultar o conectar Tempo.</p>
    <button type="button" className="agent-primary" onClick={() => login()}>Iniciar sesión</button>
  </section>;
  return <section aria-label="Wallets registradas y lectura de Tempo">
    <RegistryWalletPanel key={user.id} locale="es" getAccessToken={getAccessToken} />
  </section>;
}
