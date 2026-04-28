import { Wifi, WifiOff, Database } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { cn } from "@/lib/utils";

/**
 * Small badge showing connectivity + local-DB readiness.
 * Drop into any header. Bengali-localised.
 */
export function SyncStatusBadge({ className }: { className?: string }) {
  const online = useOnlineStatus();
  const { ready, db } = useLocalDB();

  const localOk = ready && !!db;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        online
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className
      )}
      title={
        online
          ? "অনলাইন — সার্ভারের সাথে সংযুক্ত"
          : "অফলাইন — লোকাল ডেটাবেজে সংরক্ষিত হচ্ছে"
      }
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{online ? "অনলাইন" : "অফলাইন"}</span>
      {localOk && (
        <span className="flex items-center gap-1 border-l border-current/20 pl-2 opacity-80">
          <Database className="h-3 w-3" />
          লোকাল
        </span>
      )}
    </div>
  );
}