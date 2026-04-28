import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { useSync } from "@/lib/sync/SyncProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatRelative(iso: string | null): string {
  if (!iso) return "এখনো sync হয়নি";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "এইমাত্র sync হয়েছে";
  if (sec < 60) return `${sec} সেকেন্ড আগে`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} মিনিট আগে`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ঘন্টা আগে`;
  return new Date(iso).toLocaleString("bn-BD");
}

/**
 * Connectivity + sync indicator. Click to force a sync cycle.
 */
export function SyncStatusBadge({ className }: { className?: string }) {
  const online = useOnlineStatus();
  const { ready, db } = useLocalDB();
  const { syncing, lastSyncedAt, lastResult, syncNow } = useSync();

  const localOk = ready && !!db;

  const handleClick = async () => {
    if (!online) {
      toast.error("অফলাইন — ইন্টারনেট সংযোগ নেই");
      return;
    }
    if (!localOk) {
      toast.error("লোকাল ডেটাবেজ এখনো প্রস্তুত নয়");
      return;
    }
    if (syncing) return;
    const res = await syncNow();
    if (res?.ok) {
      toast.success(
        `Sync সম্পন্ন — ${res.pushed} আপলোড, ${res.pulled} ডাউনলোড`
      );
    } else if (res) {
      toast.error(`Sync ব্যর্থ: ${res.error ?? "অজানা ত্রুটি"}`);
    }
  };

  const tooltip = !online
    ? "অফলাইন — পরিবর্তন লোকাল ডেটাবেজে সংরক্ষিত"
    : syncing
    ? "Sync চলছে…"
    : `সর্বশেষ sync: ${formatRelative(lastSyncedAt)} • ক্লিক করুন এখন sync করতে`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={syncing}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        "hover:bg-current/5 disabled:cursor-wait",
        online
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className
      )}
    >
      {syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : online ? (
        <Wifi className="h-3.5 w-3.5" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" />
      )}
      <span>{syncing ? "Sync হচ্ছে…" : online ? "অনলাইন" : "অফলাইন"}</span>
      {localOk && lastSyncedAt && !syncing && (
        <span className="hidden md:flex items-center gap-1 border-l border-current/20 pl-2 opacity-80">
          <CheckCircle2 className="h-3 w-3" />
          {formatRelative(lastSyncedAt)}
        </span>
      )}
    </button>
  );
}