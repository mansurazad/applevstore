import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { runSyncCycle, type SyncResult } from "./engine";

type Ctx = {
  syncing: boolean;
  lastResult: SyncResult | null;
  lastSyncedAt: string | null;
  syncNow: () => Promise<SyncResult | null>;
};

const SyncContext = createContext<Ctx>({
  syncing: false,
  lastResult: null,
  lastSyncedAt: null,
  syncNow: async () => null,
});

const AUTO_SYNC_INTERVAL_MS = 60_000;

/**
 * Drives automatic sync:
 *  - On login (db ready) → initial pull+push
 *  - When the device comes online → sync
 *  - Every 60s while online → sync
 *  - Manual via `syncNow()` returned from `useSync()`
 *
 * Invalidates React Query cache after each successful cycle so all
 * existing components automatically reflect the freshly merged data.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { db, ready } = useLocalDB();
  const online = useOnlineStatus();
  const qc = useQueryClient();

  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const initialDoneRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (!db || !online) return null;
    setSyncing(true);
    try {
      const res = await runSyncCycle();
      setLastResult(res);
      if (res.ok) {
        setLastSyncedAt(res.finishedAt);
        // Refresh anything React Query is showing
        qc.invalidateQueries();
      }
      return res;
    } finally {
      setSyncing(false);
    }
  }, [db, online, qc]);

  // Initial sync on login
  useEffect(() => {
    if (!ready || !db || !online) return;
    if (initialDoneRef.current) return;
    initialDoneRef.current = true;
    void syncNow();
  }, [ready, db, online, syncNow]);

  // Reset initial flag when user logs out
  useEffect(() => {
    if (!db) initialDoneRef.current = false;
  }, [db]);

  // Sync when coming back online
  useEffect(() => {
    if (online && db) void syncNow();
  }, [online, db, syncNow]);

  // Periodic background sync
  useEffect(() => {
    if (!online || !db) return;
    const id = window.setInterval(() => void syncNow(), AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [online, db, syncNow]);

  return (
    <SyncContext.Provider value={{ syncing, lastResult, lastSyncedAt, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}