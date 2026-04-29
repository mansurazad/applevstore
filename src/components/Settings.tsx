import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { LocalDB } from "@/lib/localdb/adapter";
import { useShopSettings } from "@/hooks/useShopSettings";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, Printer } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserManagement } from "@/components/UserManagement";
import { ActivityLog } from "@/components/ActivityLog";
import { StockSyncCheck } from "@/components/StockSyncCheck";
import { StaffPerformanceReport } from "@/components/StaffPerformanceReport";
import { useUserRole } from "@/hooks/useUserRole";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { BrandingSettings } from "@/components/BrandingSettings";
import { SyncSettingsPanel } from "@/components/SyncSettingsPanel";
import { RefreshCachePanel } from "@/components/RefreshCachePanel";
import { CachedLoginPanel } from "@/components/CachedLoginPanel";
import { DesktopBuildWizard } from "@/components/DesktopBuildWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function Settings() {
  const navigate = useNavigate();
  const { settings, logoSrc } = useShopSettings();
  const { isAdmin } = useUserRole();
  const isOnline = useOnlineStatus();
  // Branding settings now directly visible for admin users

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingSales, setIsClearingSales] = useState(false);
  // ---- Backup / Restore preview state ----
  type TableCount = { table: string; count: number };
  const [backupPreview, setBackupPreview] = useState<{
    counts: TableCount[];
    payload: any;
    total: number;
  } | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    fileName: string;
    counts: TableCount[];
    payload: any;
    total: number;
    version?: string;
    timestamp?: string;
    missingTables: string[];
  } | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    perTable: { table: string; tried: number; ok: number; failed: number; error?: string }[];
    durationMs: number;
  } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [resetStats, setResetStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    purchases: number;
    purchaseItems: number;
    products: number;
    customers: number;
    suppliers: number;
    categories: number;
    totalRevenue: number;
  } | null>(null);
  const [salesStats, setSalesStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    totalRevenue: number;
  } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showClearSalesDialog, setShowClearSalesDialog] = useState(false);
  const [profitDateFrom, setProfitDateFrom] = useState<Date | undefined>(undefined);
  const [profitDateTo, setProfitDateTo] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<string>("all");
  const dbStatsPrintRef = useRef<HTMLDivElement>(null);
  const handlePrintStats = useReactToPrint({
    contentRef: dbStatsPrintRef,
    documentTitle: `database-statistics-${format(new Date(), "yyyy-MM-dd")}`,
  });

  // Get database stats (counts only) – offline-aware
  const { data: stats } = useOfflineQuery(
    ["database-stats"],
    async () => {
      const [products, categories, customers, suppliers, sales, purchases, saleItems, purchaseItems, returns] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("sales").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);
      return {
        products: products.count || 0,
        categories: categories.count || 0,
        customers: customers.count || 0,
        suppliers: suppliers.count || 0,
        sales: sales.count || 0,
        purchases: purchases.count || 0,
        saleItems: saleItems.count || 0,
        purchaseItems: purchaseItems.count || 0,
        returns: returns.count || 0,
      };
    },
    async () => {
      const [products, categories, customers, suppliers, sales, saleItems, returns] = await Promise.all([
        LocalDB.listAll("products"),
        LocalDB.listAll("categories"),
        LocalDB.listAll("customers"),
        LocalDB.listAll("suppliers"),
        LocalDB.listAll("sales"),
        LocalDB.listAll("sale_items"),
        LocalDB.listAll("returns"),
      ]);
      return {
        products: products.length,
        categories: categories.length,
        customers: customers.length,
        suppliers: suppliers.length,
        sales: sales.length,
        purchases: 0,
        saleItems: saleItems.length,
        purchaseItems: 0,
        returns: returns.length,
      };
    }
  );

  // Get profit stats with date filtering – offline-aware
  const { data: profitStats } = useOfflineQuery(
    ["profit-stats", profitDateFrom?.toISOString(), profitDateTo?.toISOString()],
    async () => {
      let query = supabase.from("sale_items").select("unit_price, quantity, created_at, products(cost, condition)");
      if (profitDateFrom) query = query.gte("created_at", startOfDay(profitDateFrom).toISOString());
      if (profitDateTo) query = query.lte("created_at", endOfDay(profitDateTo).toISOString());
      const { data } = await query;
      let newMobileProfit = 0;
      let usedMobileProfit = 0;
      data?.forEach((item: any) => {
        const salePrice = Number(item.unit_price || 0);
        const costPrice = Number(item.products?.cost || 0);
        const quantity = Number(item.quantity || 1);
        const profit = (salePrice - costPrice) * quantity;
        const productCondition = item.products?.condition || 'new';
        if (productCondition === 'new') newMobileProfit += profit;
        else usedMobileProfit += profit;
      });
      return { newMobileProfit, usedMobileProfit, totalProfit: newMobileProfit + usedMobileProfit };
    },
    async () => {
      const [items, products] = await Promise.all([
        LocalDB.listAll<any>("sale_items"),
        LocalDB.listAll<any>("products"),
      ]);
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      const fromMs = profitDateFrom ? startOfDay(profitDateFrom).getTime() : -Infinity;
      const toMs = profitDateTo ? endOfDay(profitDateTo).getTime() : Infinity;
      let newMobileProfit = 0;
      let usedMobileProfit = 0;
      items.forEach((item: any) => {
        const ts = item.created_at ? new Date(item.created_at).getTime() : 0;
        if (ts < fromMs || ts > toMs) return;
        const product: any = productMap.get(item.product_id);
        const salePrice = Number(item.unit_price || 0);
        const costPrice = Number(product?.cost || 0);
        const quantity = Number(item.quantity || 1);
        const profit = (salePrice - costPrice) * quantity;
        const productCondition = product?.condition || 'new';
        if (productCondition === 'new') newMobileProfit += profit;
        else usedMobileProfit += profit;
      });
      return { newMobileProfit, usedMobileProfit, totalProfit: newMobileProfit + usedMobileProfit };
    }
  );

  const setPeriod = (period: string) => {
    setActivePeriod(period);
    const today = new Date();
    
    switch (period) {
      case "today":
        setProfitDateFrom(startOfDay(today));
        setProfitDateTo(endOfDay(today));
        break;
      case "week":
        setProfitDateFrom(startOfWeek(today, { weekStartsOn: 0 }));
        setProfitDateTo(endOfWeek(today, { weekStartsOn: 0 }));
        break;
      case "month":
        setProfitDateFrom(startOfMonth(today));
        setProfitDateTo(endOfMonth(today));
        break;
      case "all":
      default:
        setProfitDateFrom(undefined);
        setProfitDateTo(undefined);
        break;
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  // ---- Tables we back up, in dependency order (parents first) ----
  const BACKUP_TABLES = [
    "categories",
    "suppliers",
    "customers",
    "products",
    "sales",
    "purchases",
    "sale_items",
    "purchase_items",
    "returns",
  ] as const;
  type BackupTable = typeof BACKUP_TABLES[number];

  /**
   * STEP 1 of backup: pull every table from the server and open the
   * preview dialog. Nothing is downloaded until the user confirms.
   */
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      toast.info("ব্যাকআপ প্রিভিউ তৈরি হচ্ছে…");

      const data: Record<string, any[]> = {};
      const counts: TableCount[] = [];
      let total = 0;
      for (const t of BACKUP_TABLES) {
        const { data: rows, error } = await supabase.from(t).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        data[t] = rows || [];
        counts.push({ table: t, count: rows?.length || 0 });
        total += rows?.length || 0;
      }

      const payload = {
        version: "1.1",
        timestamp: new Date().toISOString(),
        data,
      };
      setBackupPreview({ counts, payload, total });
    } catch (error: any) {
      toast.error("Backup ব্যর্থ: " + error.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  /**
   * STEP 2 of backup: actually download the JSON the user just previewed.
   */
  const confirmBackupDownload = async () => {
    if (!backupPreview) return;
    try {
      const blob = new Blob([JSON.stringify(backupPreview.payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `applestore-backup-${new Date()
        .toISOString()
        .split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("ব্যাকআপ ডাউনলোড হয়েছে");
      await ActivityLogger.dataBackup();
      setBackupPreview(null);
    } catch (e: any) {
      toast.error("Download ব্যর্থ: " + e.message);
    }
  };

  /**
   * STEP 1 of restore: parse the file and show a preview of what's
   * inside. NOTHING is written to the database until the user clicks
   * "Restore" inside the preview dialog.
   */
  const handleRestoreFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.data || typeof backup.data !== "object") {
        throw new Error("ফাইলটি বৈধ ব্যাকআপ নয় (data অংশ নেই)");
      }
      const counts: TableCount[] = [];
      const missing: string[] = [];
      let total = 0;
      for (const t of BACKUP_TABLES) {
        const arr = backup.data[t];
        if (!Array.isArray(arr)) {
          missing.push(t);
          continue;
        }
        counts.push({ table: t, count: arr.length });
        total += arr.length;
      }
      setRestorePreview({
        fileName: file.name,
        counts,
        payload: backup,
        total,
        version: backup.version,
        timestamp: backup.timestamp,
        missingTables: missing,
      });
    } catch (e: any) {
      toast.error("Restore প্রিভিউ ব্যর্থ: " + e.message);
    } finally {
      event.target.value = "";
    }
  };

  /**
   * Upsert rows in batches so a single duplicate doesn't kill the whole
   * table. Returns per-row success/fail counts.
   */
  const upsertBatch = async (
    table: string,
    rows: any[],
  ): Promise<{ ok: number; failed: number; error?: string }> => {
    const BATCH = 200;
    let ok = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await (supabase.from as any)(table)
        .upsert(slice, { onConflict: "id" });
      if (error) {
        // Try one-by-one to recover individual rows
        for (const row of slice) {
          const { error: e2 } = await (supabase.from as any)(table)
            .upsert(row, { onConflict: "id" });
          if (e2) {
            failed++;
            if (!firstError) firstError = e2.message;
          } else {
            ok++;
          }
        }
      } else {
        ok += slice.length;
      }
    }
    return { ok, failed, error: firstError };
  };

  /**
   * STEP 2 of restore: perform the actual upsert. Uses upsert+batching
   * so existing rows are merged instead of erroring, and a single bad
   * row never wipes out the rest of the file.
   */
  const confirmRestore = async () => {
    if (!restorePreview) return;
    setIsRestoring(true);
    setRestoreResult(null);
    const startedAt = Date.now();
    const perTable: {
      table: string;
      tried: number;
      ok: number;
      failed: number;
      error?: string;
    }[] = [];
    try {
      toast.info("Restore শুরু হয়েছে — অপেক্ষা করুন…");
      for (const t of BACKUP_TABLES) {
        const rows = (restorePreview.payload.data?.[t] as any[]) || [];
        if (!rows.length) {
          perTable.push({ table: t, tried: 0, ok: 0, failed: 0 });
          continue;
        }
        const res = await upsertBatch(t, rows);
        perTable.push({
          table: t,
          tried: rows.length,
          ok: res.ok,
          failed: res.failed,
          error: res.error,
        });
      }

      const totalOk = perTable.reduce((s, r) => s + r.ok, 0);
      const totalFail = perTable.reduce((s, r) => s + r.failed, 0);
      setRestoreResult({ perTable, durationMs: Date.now() - startedAt });
      if (totalFail === 0) {
        toast.success(`Restore সম্পন্ন — ${totalOk} টি রেকর্ড যুক্ত হয়েছে`);
      } else {
        toast.warning(
          `Restore আংশিক সফল — ${totalOk} সফল, ${totalFail} ব্যর্থ`,
        );
      }
      await ActivityLogger.dataRestore();
      setRestorePreview(null);
    } catch (error: any) {
      toast.error("Restore ব্যর্থ: " + error.message);
      setRestoreResult({ perTable, durationMs: Date.now() - startedAt });
    } finally {
      setIsRestoring(false);
    }
  };

  const fetchResetStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes, purchasesRes, purchaseItemsRes, productsRes, customersRes, suppliersRes, categoriesRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setResetStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        purchases: purchasesRes.count || 0,
        purchaseItems: purchaseItemsRes.count || 0,
        products: productsRes.count || 0,
        customers: customersRes.count || 0,
        suppliers: suppliersRes.count || 0,
        categories: categoriesRes.count || 0,
        totalRevenue,
      });
      setShowResetDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch statistics: " + error.message);
    }
  };

  const fetchSalesStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setSalesStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        totalRevenue,
      });
      setShowClearSalesDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch sales statistics: " + error.message);
    }
  };

  const handleClearSalesData = async () => {
    setIsClearingSales(true);
    setShowClearSalesDialog(false);
    try {
      toast.info("Clearing sales data...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items
      toast.info("Clearing sale items...");
      const saleItemsResult = await supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (saleItemsResult.error) throw saleItemsResult.error;
      
      // 3. Delete sales
      toast.info("Clearing sales records...");
      const salesResult = await supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (salesResult.error) throw salesResult.error;

      toast.success("Sales data cleared successfully! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Clear sales failed: " + error.message);
      console.error("Clear sales error:", error);
    } finally {
      setIsClearingSales(false);
      setSalesStats(null);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setShowResetDialog(false);
    try {
      toast.info("Resetting database...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items and purchase_items (all transaction details)
      toast.info("Clearing sale items and purchase items...");
      const [saleItemsResult, purchaseItemsResult] = await Promise.all([
        supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchase_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (saleItemsResult.error) throw saleItemsResult.error;
      if (purchaseItemsResult.error) throw purchaseItemsResult.error;
      
      // 3. Delete sales and purchases (all sales reports data)
      toast.info("Clearing all sales and purchase records...");
      const [salesResult, purchasesResult] = await Promise.all([
        supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchases").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (salesResult.error) throw salesResult.error;
      if (purchasesResult.error) throw purchasesResult.error;

      // 4. Delete products (references categories)
      toast.info("Clearing products...");
      const productsResult = await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (productsResult.error) throw productsResult.error;

      // 5. Delete base tables (customers, suppliers, categories)
      toast.info("Clearing customers, suppliers, and categories...");
      const [customersResult, suppliersResult, categoriesResult] = await Promise.all([
        supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("suppliers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (customersResult.error) throw customersResult.error;
      if (suppliersResult.error) throw suppliersResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      toast.success("All data including sales reports completely reset! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Reset failed: " + error.message);
      console.error("Reset error:", error);
    } finally {
      setIsResetting(false);
      setResetStats(null);
    }
  };

  const totalRecords = stats
    ? stats.products + stats.categories + stats.customers + stats.suppliers + stats.sales + stats.purchases + stats.saleItems + stats.purchaseItems + stats.returns
    : 0;

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">সেটিংস</h1>
            <p className="text-muted-foreground mt-1">অ্যাকাউন্ট ও সিস্টেম ডেটা ব্যবস্থাপনা</p>
          </div>
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center shadow-lg">
            <img src={logoSrc} alt={settings.shop_name} className="w-14 h-14 object-contain" />
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        <OfflineBanner message="অফলাইন মোডে আছেন — পরিসংখ্যান ক্যাশ থেকে দেখানো হচ্ছে। ব্যাকআপ, রিস্টোর, রিসেট এবং ব্যাকএন্ড সিঙ্ক অনলাইনে ফিরলে চালু হবে।" />

        {/* Cloud sync controls */}
        <SyncSettingsPanel />

        {/* Manual offline cache refresh */}
        <RefreshCachePanel />

        {/* Manage cached offline login credentials (admin only) */}
        {isAdmin && <CachedLoginPanel />}

        {/* Database Statistics */}
        <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-xl font-semibold text-foreground">📊 Database Statistics</h2>
          <Button
            onClick={() => handlePrintStats()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            PDF এক্সপোর্ট
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            <p className="text-2xl font-bold text-primary">{stats?.products || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-accent">{stats?.categories || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Customers</p>
            <p className="text-2xl font-bold text-primary">{stats?.customers || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Suppliers</p>
            <p className="text-2xl font-bold text-accent">{stats?.suppliers || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Sales</p>
            <p className="text-2xl font-bold text-primary">{stats?.sales || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Purchases</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchases || 0}</p>
          </div>
        </div>

        {/* Profit Statistics with Date Filter */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-foreground">💰 Profit Statistics</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activePeriod === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("all")}
              >
                All Time
              </Button>
              <Button
                variant={activePeriod === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("today")}
              >
                Today
              </Button>
              <Button
                variant={activePeriod === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("week")}
              >
                This Week
              </Button>
              <Button
                variant={activePeriod === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("month")}
              >
                This Month
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateFrom ? format(profitDateFrom, "PPP") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateFrom}
                  onSelect={(date) => { setProfitDateFrom(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateTo ? format(profitDateTo, "PPP") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateTo}
                  onSelect={(date) => { setProfitDateTo(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {(profitDateFrom || profitDateTo) && (
              <Button variant="ghost" size="sm" onClick={() => setPeriod("all")}>
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">নতুন মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-green-600">৳{(profitStats?.newMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">ব্যবহৃত মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-blue-600">৳{(profitStats?.usedMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">মোট লাভ</p>
              <p className="text-2xl font-bold text-emerald-600">৳{(profitStats?.totalProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">বিক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-primary">{stats?.saleItems || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">ক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchaseItems || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">রিটার্ন</p>
            <p className="text-2xl font-bold text-primary">{stats?.returns || 0}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            মোট রেকর্ড: <span className="font-bold text-foreground">{totalRecords}</span>
          </p>
          <StockSyncCheck />
        </div>
        </Card>

        {/* Hidden printable Database Statistics report (offline-capable PDF) */}
        <div className="hidden">
          <div ref={dbStatsPrintRef} className="p-8 bg-white text-black">
            <div className="flex items-center justify-between border-b border-gray-300 pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold">{settings.shop_name}</h1>
                <p className="text-sm text-gray-600">{settings.shop_subtitle}</p>
                {settings.shop_address && (
                  <p className="text-xs text-gray-500 mt-1">{settings.shop_address}</p>
                )}
              </div>
              <img src={logoSrc} alt="logo" className="w-16 h-16 object-contain" />
            </div>

            <h2 className="text-xl font-semibold mb-1">Database Statistics Report</h2>
            <p className="text-xs text-gray-500 mb-4">
              Generated: {format(new Date(), "PPpp")}
              {!isOnline && " (Offline — local cache)"}
            </p>

            <table className="w-full text-sm border-collapse mb-6">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 text-left p-2">Metric</th>
                  <th className="border border-gray-300 text-right p-2">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border border-gray-300 p-2">Products</td><td className="border border-gray-300 p-2 text-right">{stats?.products || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Categories</td><td className="border border-gray-300 p-2 text-right">{stats?.categories || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Customers</td><td className="border border-gray-300 p-2 text-right">{stats?.customers || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Suppliers</td><td className="border border-gray-300 p-2 text-right">{stats?.suppliers || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Sales</td><td className="border border-gray-300 p-2 text-right">{stats?.sales || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Purchases</td><td className="border border-gray-300 p-2 text-right">{stats?.purchases || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Sale items</td><td className="border border-gray-300 p-2 text-right">{stats?.saleItems || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Purchase items</td><td className="border border-gray-300 p-2 text-right">{stats?.purchaseItems || 0}</td></tr>
                <tr><td className="border border-gray-300 p-2">Returns</td><td className="border border-gray-300 p-2 text-right">{stats?.returns || 0}</td></tr>
                <tr className="font-bold bg-gray-50"><td className="border border-gray-300 p-2">Total records</td><td className="border border-gray-300 p-2 text-right">{totalRecords}</td></tr>
              </tbody>
            </table>

            <h3 className="text-lg font-semibold mb-2">Profit Statistics</h3>
            <p className="text-xs text-gray-500 mb-2">
              Period: {activePeriod === "all" ? "All time" : activePeriod}
              {profitDateFrom && ` — from ${format(profitDateFrom, "PP")}`}
              {profitDateTo && ` to ${format(profitDateTo, "PP")}`}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 text-left p-2">Category</th>
                  <th className="border border-gray-300 text-right p-2">Profit (৳)</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border border-gray-300 p-2">New mobile profit</td><td className="border border-gray-300 p-2 text-right">{(profitStats?.newMobileProfit || 0).toLocaleString()}</td></tr>
                <tr><td className="border border-gray-300 p-2">Used mobile profit</td><td className="border border-gray-300 p-2 text-right">{(profitStats?.usedMobileProfit || 0).toLocaleString()}</td></tr>
                <tr className="font-bold bg-gray-50"><td className="border border-gray-300 p-2">Total profit</td><td className="border border-gray-300 p-2 text-right">{(profitStats?.totalProfit || 0).toLocaleString()}</td></tr>
              </tbody>
            </table>

            <p className="text-xs text-gray-400 mt-8 text-center">
              {settings.shop_name} — Database Statistics Report
            </p>
          </div>
        </div>

        {/* Staff Performance Report */}
        <StaffPerformanceReport />

        {/* User Management */}
        <UserManagement />

        {/* Activity Log */}
        <ActivityLog />

      {/* Backup & Restore */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">💾 Backup & Restore</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Backup Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Export all your data to a JSON file. This includes products, categories, customers, suppliers, sales, purchases, returns, and all transaction details.
            </p>
            <Button
              onClick={handleBackup}
              disabled={isBackingUp || !isOnline}
              title={!isOnline ? "ব্যাকআপের জন্য ইন্টারনেট প্রয়োজন" : undefined}
              className="w-full md:w-auto"
            >
              {isBackingUp ? "⏳ Creating Backup..." : "📥 Download Backup"}
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="font-medium mb-2">Restore Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Upload a backup file to restore your data. ⚠️ Warning: This will replace all existing data!
            </p>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreFile}
                disabled={isRestoring}
                className="hidden"
                id="restore-file"
                ref={restoreInputRef}
              />
              <Button
                onClick={() => document.getElementById("restore-file")?.click()}
                disabled={isRestoring || !isOnline}
                title={!isOnline ? "রিস্টোরের জন্য ইন্টারনেট প্রয়োজন" : undefined}
                variant="outline"
                className="w-full md:w-auto"
              >
                {isRestoring ? "⏳ Restoring..." : "📤 Upload Backup File"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Desktop App Build */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-2 text-foreground">🖥️ ডেস্কটপ অ্যাপ</h2>
        <p className="text-sm text-muted-foreground mb-4">
          এই সফটওয়্যারটি Windows, macOS, এবং Linux-এর জন্য নেটিভ ডেস্কটপ অ্যাপ হিসেবে
          ইনস্টল করতে পারেন। উইজার্ড আপনার সিস্টেম অনুযায়ী প্রয়োজনীয়তা ও কমান্ড দেখাবে।
        </p>
        <DesktopBuildWizard />
      </Card>

      {/* Reset Database */}
      <Card className="p-6 border-destructive/50">
        <h2 className="text-xl font-semibold mb-4 text-destructive">⚠️ Danger Zone</h2>
        <div className="space-y-4">
          {/* Clear Sales Data Only */}
          <div>
            <h3 className="font-medium mb-2">Clear Sales Data Only</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Delete only sales records, sale items, and returns. Products, customers, suppliers, and categories will be kept intact.
            </p>
            <Button 
              variant="outline" 
              disabled={isClearingSales || !isOnline} 
              title={!isOnline ? "ডেটা পরিবর্তনের জন্য ইন্টারনেট প্রয়োজন" : undefined}
              className="w-full md:w-auto border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={() => { if (!isOnline) { toast.error("অফলাইনে এই কাজটি করা যাবে না"); return; } fetchSalesStats(); }}
            >
              {isClearingSales ? "⏳ Clearing..." : "🧹 Clear Sales Data"}
            </Button>
            
            <AlertDialog open={showClearSalesDialog} onOpenChange={setShowClearSalesDialog}>
              <AlertDialogContent className="max-w-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Clear Sales Data</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following sales data will be permanently deleted:
                    </p>
                    
                    {salesStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Sales Records:</span>
                              <span className="font-semibold text-destructive">{salesStats.sales}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Sale Items:</span>
                              <span className="font-semibold text-destructive">{salesStats.saleItems}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Total Revenue:</span>
                              <span className="font-semibold text-destructive">৳{salesStats.totalRevenue.toLocaleString()}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Returns:</span>
                              <span className="font-semibold text-destructive">{salesStats.returns}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                      <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                        ✅ Products, Customers, Suppliers, and Categories will remain unchanged
                      </p>
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
                      <p className="text-sm text-orange-700 dark:text-orange-400 font-semibold">
                        ⚠️ This action cannot be undone. Make sure you have a backup if needed.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSalesData} className="bg-orange-600 text-white hover:bg-orange-700">
                    Clear Sales Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-medium mb-2">Reset Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Permanently delete ALL data from the database. This action cannot be undone!
            </p>
            <Button 
              variant="destructive" 
              disabled={isResetting || !isOnline} 
              title={!isOnline ? "ডেটা পরিবর্তনের জন্য ইন্টারনেট প্রয়োজন" : undefined}
              className="w-full md:w-auto"
              onClick={() => { if (!isOnline) { toast.error("অফলাইনে এই কাজটি করা যাবে না"); return; } fetchResetStats(); }}
            >
              {isResetting ? "⏳ Resetting..." : "🗑️ Reset All Data"}
            </Button>
            
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Confirm Database Reset</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following data will be permanently deleted:
                    </p>
                    
                    {resetStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Sales Records:</span>
                                <span className="font-semibold text-destructive">{resetStats.sales}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Sale Items:</span>
                                <span className="font-semibold text-destructive">{resetStats.saleItems}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Total Revenue:</span>
                                <span className="font-semibold text-destructive">৳{resetStats.totalRevenue.toLocaleString()}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Returns:</span>
                                <span className="font-semibold text-destructive">{resetStats.returns}</span>
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Inventory & Data</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Products:</span>
                                <span className="font-semibold text-destructive">{resetStats.products}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Customers:</span>
                                <span className="font-semibold text-destructive">{resetStats.customers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Suppliers:</span>
                                <span className="font-semibold text-destructive">{resetStats.suppliers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Categories:</span>
                                <span className="font-semibold text-destructive">{resetStats.categories}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border">
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Purchases:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchases}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Purchase Items:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchaseItems}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-destructive/10 border border-destructive/30 p-3 rounded-lg">
                      <p className="text-sm text-destructive font-semibold">
                        ⚠️ This action cannot be undone! Make sure you have a backup before proceeding.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">👤 Account</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">You are currently signed in</p>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="w-full md:w-auto"
            >
              🚪 Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">ℹ️ About</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-lg text-foreground">{settings.shop_name}</p>
          <p>Shop Management System v1.0</p>
          <p>A comprehensive shop management solution for mobile phone businesses</p>
          <p className="pt-2 text-xs">
            Features: Products, Categories, POS, Customers, Suppliers, Purchase Orders, Reports, Backup & Restore
          </p>
        </div>
      </Card>

      {/* Branding Settings - visible for admin users */}
      {isAdmin && <BrandingSettings />}
      </div>
    </div>
  );
}
