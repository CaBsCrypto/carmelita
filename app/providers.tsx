"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { avalancheFuji, baseSepolia, bscTestnet, tempoModerato } from "viem/chains";

export default function Providers({
  children,
  appId,
  clientId,
  evmExpansionEnabled = false,
  tempoTestnetEnabled = false,
  existingWalletsOnly = false,
}: {
  children: React.ReactNode;
  appId?: string;
  clientId?: string;
  evmExpansionEnabled?: boolean;
  tempoTestnetEnabled?: boolean;
  existingWalletsOnly?: boolean;
}) {
  if (!appId) return children;

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        loginMethods: ["email", "google", "passkey"],
        ...(existingWalletsOnly ? { embeddedWallets: {
          ethereum: { createOnLogin: "off" as const },
          solana: { createOnLogin: "off" as const },
          disableAutomaticMigration: true,
        } } : {}),
        defaultChain: avalancheFuji,
        supportedChains: [
          avalancheFuji,
          ...(evmExpansionEnabled ? [bscTestnet, baseSepolia] : []),
          ...(tempoTestnetEnabled ? [tempoModerato] : []),
        ],
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
