"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { fetchWalletReadings, type WalletReadings } from "./wallet-readings";

const empty: WalletReadings = { wallets: [], networks: [], readings: {}, failedNetworks: [] };

export function useWalletReadings(getAccessToken: () => Promise<string | null>) {
  const { user, authenticated } = usePrivy();
  const owner = authenticated ? user?.id ?? null : null;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState({ ...empty, owner, loading: true, failed: false });
  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ ...empty, owner, loading: true, failed: false });
    try {
      if (!owner) throw new Error("authentication_required");
      const token = await getAccessToken();
      controller.signal.throwIfAborted();
      if (!token) throw new Error("authentication_required");
      const result = await fetchWalletReadings(token, controller.signal);
      if (!controller.signal.aborted) setState({ ...result, owner, loading: false, failed: false });
    } catch {
      if (!controller.signal.aborted) setState({ ...empty, owner, loading: false, failed: true });
    }
  }, [getAccessToken, owner]);
  useEffect(() => {
    const task = window.setTimeout(() => void reload(), 0);
    return () => { window.clearTimeout(task); request.current?.abort(); };
  }, [reload]);
  // A previous identity is never rendered while the next session effect starts.
  const visible = state.owner === owner ? state : { ...empty, owner, loading: true, failed: false };
  return { ...visible, reload };
}
