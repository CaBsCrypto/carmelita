"use client";

import { createContext, useContext } from "react";

export type ConnectionEnvironment = { mcpUrl: string | null; environment: "production" | "qa" | "unavailable"; signInAvailable: boolean };
const context = createContext<ConnectionEnvironment>({ mcpUrl: null, environment: "unavailable", signInAvailable: false });
export function ConnectionEnvironmentProvider({ value, children }: { value: ConnectionEnvironment; children: React.ReactNode }) {
  return <context.Provider value={value}>{children}</context.Provider>;
}
export function useConnectionEnvironment() { return useContext(context); }
