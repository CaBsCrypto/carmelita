"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { avalancheFuji, baseSepolia, bscTestnet } from "viem/chains";

export default function Providers({
  children,
  appId,
  clientId,
  evmExpansionEnabled = false,
}: {
  children: React.ReactNode;
  appId?: string;
  clientId?: string;
  evmExpansionEnabled?: boolean;
}) {
  if (!appId) return children;

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        loginMethods: ["email", "google", "passkey"],
        defaultChain: avalancheFuji,
        supportedChains: evmExpansionEnabled ? [avalancheFuji, bscTestnet, baseSepolia] : [avalancheFuji],
        appearance: {
          theme: "light",
          accentColor: "#ff5b3a",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
