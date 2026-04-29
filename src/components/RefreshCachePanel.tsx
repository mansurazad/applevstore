import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { pullAll } from "@/lib/sync/pull";
import { cacheReplace } from "@/hooks/useOfflineQuery";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";

const STAMP_KEY = "applestore.lastCacheRefresh.v1";

/**
 * Manual "Refresh cache" control. Triggers an immediate offline cache
 * update so the user can verify data freshness without waiting for the
 * automatic 60s sync loop. Refreshes:
 *   - Two-way synced tables (products, sales, etc.) via pullAll()
 *   - Read-only mirrors (profiles, user_roles, role_permissions)
 *   - Invalidates React Query cache so UI re-reads fresh local data
 */
export function RefreshCachePanel() {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STAMP_KEY);
    } catch {
      return null;
    }
  });

  const handleRefresh = async () => {
    if (!online) {
      toast.error("অফলাইন — ক্যাশ রিফ্রেশের জন্য ইন্টারনেট প্রয়োজন");
      return;
    }
    setBusy(true);
    try {
      // 1. Pull all two-way synced tables
      const pulled = await pullAll();

      // 2. Refresh read-only mirrors used by Settings
      const [profilesRes, rolesRes, permsRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("role_permissions").select("*"),
      ]);

      if (profilesRes.data) {
        await cacheReplace("profiles_cache", profilesRes.data);
      }
      if (rolesRes.data) {
        await cacheReplace(
          "user_roles_cache",
          rolesRes.data.map((r: any) => ({
            id: r.user_id,
            user_id: r.user_id,
            role: r.role,
          }))
        );
      }
      if (permsRes.data) {
        await cacheReplace(
          "role_permissions_cache",
          permsRes.data.map((r: any) => ({ ...r, id: r.role }))
        );
      }

      // 3. Refresh React Query so visible UI re-renders from new cache
      await qc.invalidateQueries();

      const stamp = new Date().toISOString();
      try {
        localStorage.setItem(STAMP_KEY, stamp);
      } catch {
        /* ignore */
      }
      setLastRefresh(stamp);
      toast.success(
        `অফলাইন ক্যাশ রিফ্রেশ সম্পন্ন: ${pulled} সিঙ্ক রেকর্ড + ব্যবহারকারী/পারমিশন তথ্য`
      );
    } catch (e: any) {
      toast.error("ক্যাশ রিফ্রেশ ব্যর্থ: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">অফলাইন ক্যাশ</h2>
        </div>
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
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        অফলাইনে ব্যবহারের জন্য সমস্ত ডেটা স্থানীয় ডিভাইসে সংরক্ষিত থাকে। নিচের বোতামে ক্লিক করে এখনই
        সর্বশেষ সার্ভার ডেটা টেনে আনুন এবং ক্যাশের সতেজতা যাচাই করুন।
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleRefresh} disabled={busy || !online} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          ক্যাশ রিফ্রেশ করুন
        </Button>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">সর্বশেষ রিফ্রেশ:</span>{" "}
          {lastRefresh
            ? format(new Date(lastRefresh), "PPpp", { locale: bn })
            : "এখনো হয়নি"}
        </p>
      </div>
    </Card>
  );
}