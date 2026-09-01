"use client";

export type WebMcpToolContent = {
  type: "text" | "json";
  text?: string;
  json?: unknown;
};

export type WebMcpToolResponse = {
  content: WebMcpToolContent[];
  isError?: boolean;
};

export type WebMcpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<WebMcpToolResponse>;
};

export type WebMcpModelContext = {
  registerTool?: (tool: WebMcpToolDefinition) => Promise<void>;
  unregisterTool?: (name: string) => Promise<void>;
  getTools?: () => Promise<WebMcpToolDefinition[]>;
  clearTools?: () => Promise<void>;
};

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }
  interface Navigator {
    modelContext?: WebMcpModelContext;
  }
}

export type WebMcpStatus = {
  supported: boolean;
  source: "document.modelContext" | "navigator.modelContext" | "polyfill" | "none";
  toolsRegistered: string[];
  flagInstructionsNeeded: boolean;
};

export function getBrowserModelContext(): WebMcpModelContext | null {
  const g = globalThis as unknown as { document?: Document; navigator?: Navigator };

  if (g.document && g.document.modelContext) {
    return g.document.modelContext;
  }
  if (g.navigator && g.navigator.modelContext) {
    return g.navigator.modelContext;
  }

  return null;
}

export function detectWebMcpStatus(): WebMcpStatus {
  const g = globalThis as unknown as { document?: Document; navigator?: Navigator; window?: unknown };
  const context = getBrowserModelContext();

  if (context?.registerTool) {
    const source = g.document?.modelContext ? "document.modelContext" : "navigator.modelContext";
    return { supported: true, source, toolsRegistered: [], flagInstructionsNeeded: false };
  }

  return {
    supported: false,
    source: "none",
    toolsRegistered: [],
    flagInstructionsNeeded: true,
  };
}

export async function registerCarmelitaWebMcpTools(
  getAccessToken: () => Promise<string | null>,
): Promise<WebMcpStatus> {
  const status = detectWebMcpStatus();
  const context = getBrowserModelContext();

  if (!context?.registerTool) {
    return status;
  }

  const registeredNames: string[] = [];

  try {
    // Tool 1: Get Multichain Wallets (Stellar + Avalanche + Solana)
    await context.registerTool({
      name: "carmelita_get_multichain_wallets",
      description: "Returns active user wallets and balances across Stellar, Avalanche, and Solana",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const token = await getAccessToken();
        if (!token) return { content: [{ type: "text", text: "authentication_required" }], isError: true };
        const response = await fetch("/api/agent/wallets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(json) }] };
      },
    });
    registeredNames.push("carmelita_get_multichain_wallets");

    // Tool 2: Fund Solana Devnet Wallet
    await context.registerTool({
      name: "carmelita_fund_solana_devnet",
      description: "Requests a 1 SOL Devnet airdrop faucet to the user's active Solana wallet",
      inputSchema: {
        type: "object",
        properties: {
          solAmount: { type: "number", description: "SOL amount to request (default 1)" },
        },
      },
      execute: async (args) => {
        const token = await getAccessToken();
        if (!token) return { content: [{ type: "text", text: "authentication_required" }], isError: true };
        const response = await fetch("/api/agent/wallets/solana/fund", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            explicitUserConfirmation: true,
            solAmount: Number(args.solAmount ?? 1),
          }),
        });
        const json = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(json) }] };
      },
    });
    registeredNames.push("carmelita_fund_solana_devnet");

    // Tool 3: Get Solana Devnet Balance & Status
    await context.registerTool({
      name: "carmelita_get_solana_status",
      description: "Returns Solana Devnet address, SOL balance, and explorer link",
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        const token = await getAccessToken();
        if (!token) return { content: [{ type: "text", text: "authentication_required" }], isError: true };
        const response = await fetch("/api/agent/wallets/solana", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(json) }] };
      },
    });
    registeredNames.push("carmelita_get_solana_status");
  } catch (error) {
    console.warn("WebMCP registration warning:", error);
  }

  return {
    ...status,
    toolsRegistered: registeredNames,
  };
}
