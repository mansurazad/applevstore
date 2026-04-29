import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, CloudUpload, CheckCircle2 } from "lucide-react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { useSync } from "@/lib/sync/SyncProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { format } from "date-fns";
import { bn } from "date-fns/locale";

const STAMP_KEY = "applestore.lastActivityLogSync.v1";

/**
 * Small floating indicator that appears when offline-recorded activity
 * logs are being uploaded to the server. Shows the last successful
 * upload timestamp once the queue is empty.
 *
 * Behavior:
 *  - While online + sync engine running + dirty activity_logs > 0
 *      → "অফলাইন এক্টিভিটি লগ সিঙ্ক হচ্ছে…"
 *  - When the dirty queue drops to 0 we stamp "last synced" and show a
 *      brief confirmation badge.
 */
export function OfflineActivitySyncIndicator() {
  const { db, ready } = useLocalDB();
  const { syncing } = useSync();
  const online = useOnlineStatus();

  const dirtyCount = useLiveQuery(async () => {
    if (!db) return 0;
    return await db.activity_logs.filter((r: any) => r._dirty === 1).count();
  }, [ready]);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STAMP_KEY);
    } catch {
      return null;
    }
  });
  const [justFinished, setJustFinished] = useState(false);

  // When dirty queue empties (and we had pending work), stamp the time.
  const wasDirty = (dirtyCount ?? 0) > 0;
  useEffect(() => {
    if (!ready) return;
    if (!wasDirty && online) {
      // Only stamp if a sync just happened — checked via syncing transition.
      // We stamp opportunistically whenever queue is empty and we were online.
      const stamp = new Date().toISOString();
      try {
        localStorage.setItem(STAMP_KEY, stamp);
      } catch {
        /* ignore */
      }
      setLastSyncedAt(stamp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasDirty, online, ready]);

  // Show "synced" confirmation for 4s after a sync completes
  useEffect(() => {
    if (!syncing && wasDirty === false && online) {
      setJustFinished(true);
      const t = window.setTimeout(() => setJustFinished(false), 4000);
      return () => window.clearTimeout(t);
    }
  }, [syncing, wasDirty, online]);

  if (!ready) return null;

  // Active upload state — visible whenever there are pending offline logs
  if (wasDirty && online) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
        <Badge
          variant="secondary"
          className="gap-2 py-2 px-3 shadow-lg border-primary/30 bg-background/95 backdrop-blur"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs">
            অফলাইন এক্টিভিটি লগ সিঙ্ক হচ্ছে… ({dirtyCount})
          </span>
        </Badge>
      </div>
    );
  }

  // Brief "just synced" confirmation
  if (justFinished && lastSyncedAt) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
        <Badge
          variant="secondary"
          className="gap-2 py-2 px-3 shadow-lg border-green-500/40 bg-background/95 backdrop-blur"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs">
            এক্টিভিটি লগ সিঙ্ক সম্পন্ন · {format(new Date(lastSyncedAt), "p", { locale: bn })}
          </span>
        </Badge>
      </div>
    );
  }

  return null;
}

/**
 * Compact inline variant for the Activity Log header — always shows the
 * last successful sync time, plus a spinner when an upload is in flight.
 */
export function OfflineActivitySyncInline() {
  const { db, ready } = useLocalDB();
  const online = useOnlineStatus();
  const dirtyCount = useLiveQuery(async () => {
    if (!db) return 0;
    return await db.activity_logs.filter((r: any) => r._dirty === 1).count();
  }, [ready]);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STAMP_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onStorage = () => {
      try {
        setLastSyncedAt(localStorage.getItem(STAMP_KEY));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(onStorage, 5000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  if (!ready) return null;
  const pending = (dirtyCount ?? 0) > 0;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending && online ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>অফলাইন এক্টিভিটি লগ সিঙ্ক হচ্ছে… ({dirtyCount})</span>
        </>
      ) : pending && !online ? (
        <>
          <CloudUpload className="h-3 w-3" />
          <span>{dirtyCount} টি লগ অনলাইনে ফিরলে আপলোড হবে</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          <span>
            সর্বশেষ এক্টিভিটি লগ সিঙ্ক:{" "}
            {lastSyncedAt
              ? format(new Date(lastSyncedAt), "PPp", { locale: bn })
              : "এখনো হয়নি"}
          </span>
        </>
      )}
    </div>
  );
}