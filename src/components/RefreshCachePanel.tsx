import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Database, Wifi, WifiOff, FileText } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { pullAllDetailed, type PullDetail } from "@/lib/sync/pull";
import { cacheReplace } from "@/hooks/useOfflineQuery";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAMP_KEY = "applestore.lastCacheRefresh.v1";

/** Bengali display names for sync tables shown in the result summary. */
const TABLE_LABELS: Record<string, string> = {
  categories: "ক্যাটাগরি",
  suppliers: "সরবরাহকারী",
  customers: "গ্রাহক",
  products: "পণ্য",
  investment_sectors: "বিনিয়োগ সেক্টর",
  shop_settings: "শপ সেটিংস",
  sales: "বিক্রয়",
  sale_items: "বিক্রয় আইটেম",
  due_payments: "বাকি পরিশোধ",
  returns: "রিটার্ন",
  investment_entries: "বিনিয়োগ এন্ট্রি",
  investment_incomes: "বিনিয়োগ আয়",
  activity_logs: "এক্টিভিটি লগ",
};

type ExtraSummary = {
  profiles: number;
  user_roles: number;
  role_permissions: number;
};

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
  const [resultOpen, setResultOpen] = useState(false);
  const [pullResult, setPullResult] = useState<PullDetail | null>(null);
  const [extraResult, setExtraResult] = useState<ExtraSummary | null>(null);
  const [resultStartedAt, setResultStartedAt] = useState<string | null>(null);
  const [resultDurationMs, setResultDurationMs] = useState<number>(0);

  const handleRefresh = async () => {
    if (!online) {
      toast.error("অফলাইন — ক্যাশ রিফ্রেশের জন্য ইন্টারনেট প্রয়োজন");
      return;
    }
    setBusy(true);
    const startedAt = Date.now();
    try {
      // 1. Pull all two-way synced tables
      const detail = await pullAllDetailed();

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

      // Stash detailed summary and open result dialog
      setPullResult(detail);
      setExtraResult({
        profiles: profilesRes.data?.length ?? 0,
        user_roles: rolesRes.data?.length ?? 0,
        role_permissions: permsRes.data?.length ?? 0,
      });
      setResultStartedAt(stamp);
      setResultDurationMs(Date.now() - startedAt);
      setResultOpen(true);

      toast.success(
        `অফলাইন ক্যাশ রিফ্রেশ সম্পন্ন: ${detail.total} সিঙ্ক রেকর্ড + ব্যবহারকারী/পারমিশন তথ্য`
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
        {pullResult && !busy && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setResultOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            সর্বশেষ ফলাফল দেখুন
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">সর্বশেষ রিফ্রেশ:</span>{" "}
          {lastRefresh
            ? format(new Date(lastRefresh), "PPpp", { locale: bn })
            : "এখনো হয়নি"}
        </p>
      </div>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>ক্যাশ রিফ্রেশের বিস্তারিত ফলাফল</DialogTitle>
            <DialogDescription>
              {resultStartedAt &&
                `সময়: ${format(new Date(resultStartedAt), "PPpp", {
                  locale: bn,
                })} · ${(resultDurationMs / 1000).toFixed(2)} সেকেন্ড`}
            </DialogDescription>
          </DialogHeader>

          {pullResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">মোট সিঙ্ক রেকর্ড</p>
                  <p className="text-2xl font-bold text-primary">{pullResult.total}</p>
                </div>
                <div className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">টেবিল আপডেট</p>
                  <p className="text-2xl font-bold text-primary">
                    {pullResult.perTable.filter((t) => t.rows > 0).length}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">ব্যর্থ টেবিল</p>
                  <p className="text-2xl font-bold text-destructive">
                    {pullResult.perTable.filter((t) => t.error).length}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">সময়</p>
                  <p className="text-2xl font-bold text-primary">
                    {(resultDurationMs / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>টেবিল</TableHead>
                      <TableHead className="text-right">আপডেটেড রেকর্ড</TableHead>
                      <TableHead>স্ট্যাটাস</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pullResult.perTable.map((t) => (
                      <TableRow key={t.table}>
                        <TableCell className="font-medium">
                          {TABLE_LABELS[t.table] ?? t.table}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({t.table})
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.rows}
                        </TableCell>
                        <TableCell>
                          {t.error ? (
                            <Badge variant="destructive" className="text-xs">
                              ত্রুটি: {t.error}
                            </Badge>
                          ) : t.rows > 0 ? (
                            <Badge className="text-xs">আপডেটেড</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              পরিবর্তন নেই
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {extraResult && (
                      <>
                        <TableRow>
                          <TableCell className="font-medium">
                            ব্যবহারকারী প্রোফাইল
                            <span className="ml-2 text-xs text-muted-foreground">
                              (profiles)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {extraResult.profiles}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              মিরর রিফ্রেশড
                            </Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            ব্যবহারকারী রোল
                            <span className="ml-2 text-xs text-muted-foreground">
                              (user_roles)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {extraResult.user_roles}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              মিরর রিফ্রেশড
                            </Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">
                            রোল পারমিশন
                            <span className="ml-2 text-xs text-muted-foreground">
                              (role_permissions)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {extraResult.role_permissions}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              মিরর রিফ্রেশড
                            </Badge>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>বন্ধ করুন</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}