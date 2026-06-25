"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentStatus, subscribe as subscribeConnectivity } from "@/features/offline/connectivity";
import { getOfflineSyncEngine } from "@/features/offline/sync-engine";

type OfflineContextValue = {
  online: boolean;
  syncing: boolean;
  pendingCaptures: number;
  lastError: string | null;
  syncNow: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(() => getCurrentStatus().online);
  const [syncing, setSyncing] = useState(false);
  const [pendingCaptures, setPendingCaptures] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeConnectivity = subscribeConnectivity((status) => {
      setOnline(status.online);
    });

    const engine = getOfflineSyncEngine();
    const unsubscribeEngine = engine.subscribe((state) => {
      setSyncing(state.syncing);
      setPendingCaptures(state.pendingCount);
      setLastError(state.lastError);
    });

    engine.start();

    return () => {
      unsubscribeConnectivity();
      unsubscribeEngine();
      engine.stop();
    };
  }, []);

  const syncNow = useCallback(async () => {
    await getOfflineSyncEngine().syncNow();
  }, []);

  const value = useMemo(
    () => ({
      online,
      syncing,
      pendingCaptures,
      lastError,
      syncNow,
    }),
    [lastError, online, pendingCaptures, syncNow, syncing],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);

  if (!context) {
    return {
      online: true,
      syncing: false,
      pendingCaptures: 0,
      lastError: null,
      syncNow: async () => {},
    };
  }

  return context;
}
