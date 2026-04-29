import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Small inline banner shown above sections that fall back to local
 * cached data while the device is offline.
 */
export function OfflineBanner({ message }: { message?: string }) {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 mb-3">
      <WifiOff className="w-4 h-4" />
      <span>{message ?? "অফলাইন মোড — সর্বশেষ ক্যাশ করা ডেটা দেখানো হচ্ছে। পরিবর্তন করতে অনলাইনে আসুন।"}</span>
    </div>
  );
}