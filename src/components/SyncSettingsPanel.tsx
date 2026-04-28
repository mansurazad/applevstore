import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cloud, CloudDownload, CloudUpload, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useSync } from "@/lib/sync/SyncProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { pullAll } from "@/lib/sync/pull";
import { pushAll } from "@/lib/sync/push";
import { ConflictResolutionPanel } from "@/components/ConflictResolutionPanel";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";

/**
 * Manual sync controls for the Settings page:
 *  - Sync now (push then pull)
 *  - Download latest (pull only)
 *  - Push local changes (push only)
 * Also surfaces unresolved conflicts via the ConflictResolutionPanel.
 */
export function SyncSettingsPanel() {
  const online = useOnlineStatus();
  const { syncing, syncNow, lastSyncedAt, lastResult } = useSync();
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  const busy = syncing || pulling || pushing;

  const handleSyncNow = async () => {
    if (!online) {
      toast.error("অফলাইন — সিঙ্কের জন্য ইন্টারনেট প্রয়োজন");
      return;
    }
    const res = await syncNow();
    if (res?.ok) {
      toast.success(
        `সিঙ্ক সম্পন্ন: ${res.pushed} আপলোড, ${res.pulled} ডাউনলোড`
      );
    } else if (res) {
      toast.error("সিঙ্ক ব্যর্থ: " + (res.error ?? "অজানা ত্রুটি"));
    }
  };

  const handlePullOnly = async () => {
    if (!online) {
      toast.error("অফলাইন — সর্বশেষ ডাউনলোডের জন্য ইন্টারনেট প্রয়োজন");
      return;
    }
    setPulling(true);
    try {
      const n = await pullAll();
      toast.success(`সর্বশেষ ডাউনলোড সম্পন্ন: ${n} টি রেকর্ড`);
    } catch (e: any) {
      toast.error("ডাউনলোড ব্যর্থ: " + (e?.message ?? String(e)));
    } finally {
      setPulling(false);
    }
  };

  const handlePushOnly = async () => {
    if (!online) {
      toast.error("অফলাইন — আপলোডের জন্য ইন্টারনেট প্রয়োজন");
      return;
    }
    setPushing(true);
    try {
      const n = await pushAll();
      toast.success(`স্থানীয় পরিবর্তন আপলোড সম্পন্ন: ${n} টি রেকর্ড`);
    } catch (e: any) {
      toast.error("আপলোড ব্যর্থ: " + (e?.message ?? String(e)));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">ক্লাউড সিঙ্ক</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "destructive"} className="gap-1">
            {online ? (
              <>
                <Wifi className="h-3 w-3" /> অনলাইন
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" /> অফলাইন
              </>
            )}
          </Badge>
          <ConflictResolutionPanel />
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        স্বয়ংক্রিয় সিঙ্ক প্রতি ৬০ সেকেন্ডে চলে। নিচের বোতামগুলি থেকে এখনই সিঙ্ক চালান বা শুধুমাত্র
        ডাউনলোড/আপলোড করুন।
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button
          onClick={handleSyncNow}
          disabled={busy || !online}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          এখনই সিঙ্ক করুন
        </Button>
        <Button
          onClick={handlePullOnly}
          disabled={busy || !online}
          variant="outline"
          className="gap-2"
        >
          <CloudDownload className={`h-4 w-4 ${pulling ? "animate-pulse" : ""}`} />
          সর্বশেষ ডাউনলোড করুন
        </Button>
        <Button
          onClick={handlePushOnly}
          disabled={busy || !online}
          variant="outline"
          className="gap-2"
        >
          <CloudUpload className={`h-4 w-4 ${pushing ? "animate-pulse" : ""}`} />
          স্থানীয় পরিবর্তন আপলোড
        </Button>
      </div>

      <div className="mt-4 pt-4 border-t border-border text-sm text-muted-foreground space-y-1">
        <p>
          <span className="font-medium text-foreground">সর্বশেষ সিঙ্ক:</span>{" "}
          {lastSyncedAt
            ? format(new Date(lastSyncedAt), "PPpp", { locale: bn })
            : "এখনো হয়নি"}
        </p>
        {lastResult && (
          <p>
            <span className="font-medium text-foreground">শেষ ফলাফল:</span>{" "}
            {lastResult.ok
              ? `✅ ${lastResult.pushed} আপলোড, ${lastResult.pulled} ডাউনলোড`
              : `❌ ${lastResult.error ?? "ত্রুটি"}`}
          </p>
        )}
      </div>
    </Card>
  );
}