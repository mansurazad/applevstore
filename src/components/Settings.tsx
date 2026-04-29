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

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      toast.info("Starting backup...");

      // Fetch all data from all tables
      const [products, categories, customers, suppliers, sales, saleItems, purchases, purchaseItems, returns] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("suppliers").select("*"),
        supabase.from("sales").select("*"),
        supabase.from("sale_items").select("*"),
        supabase.from("purchases").select("*"),
        supabase.from("purchase_items").select("*"),
        supabase.from("returns").select("*"),
      ]);

      const backup = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        data: {
          products: products.data || [],
          categories: categories.data || [],
          customers: customers.data || [],
          suppliers: suppliers.data || [],
          sales: sales.data || [],
          sale_items: saleItems.data || [],
          purchases: purchases.data || [],
          purchase_items: purchaseItems.data || [],
          returns: returns.data || [],
        },
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stockpro-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Backup completed successfully!");
      await ActivityLogger.dataBackup();
    } catch (error: any) {
      toast.error("Backup failed: " + error.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    try {
      toast.info("Starting restore...");

      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error("Invalid backup file format");
      }

      // Clear existing data first (in correct order respecting foreign keys)
      // 1. Delete returns first (references sale_items)
      await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // 2. Delete sale_items and purchase_items
      await Promise.all([
        supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchase_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);

      // 3. Delete sales and purchases
      await Promise.all([
        supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchases").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);

      // 4. Delete products (references categories)
      await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      // 5. Delete base tables
      await Promise.all([
        supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("suppliers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);

      // Insert restored data
      const insertPromises = [];

      if (backup.data.categories?.length) {
        insertPromises.push(supabase.from("categories").insert(backup.data.categories));
      }
      if (backup.data.suppliers?.length) {
        insertPromises.push(supabase.from("suppliers").insert(backup.data.suppliers));
      }
      if (backup.data.customers?.length) {
        insertPromises.push(supabase.from("customers").insert(backup.data.customers));
      }
      if (backup.data.products?.length) {
        insertPromises.push(supabase.from("products").insert(backup.data.products));
      }

      await Promise.all(insertPromises);

      // Insert sales and purchases
      const transactionPromises = [];
      if (backup.data.sales?.length) {
        transactionPromises.push(supabase.from("sales").insert(backup.data.sales));
      }
      if (backup.data.purchases?.length) {
        transactionPromises.push(supabase.from("purchases").insert(backup.data.purchases));
      }

      await Promise.all(transactionPromises);

      // Insert related items
      const itemPromises = [];
      if (backup.data.sale_items?.length) {
        itemPromises.push(supabase.from("sale_items").insert(backup.data.sale_items));
      }
      if (backup.data.purchase_items?.length) {
        itemPromises.push(supabase.from("purchase_items").insert(backup.data.purchase_items));
      }

      await Promise.all(itemPromises);

      // Insert returns last
      if (backup.data.returns?.length) {
        await supabase.from("returns").insert(backup.data.returns);
      }

      toast.success("Data restored successfully! Refreshing...");
      await ActivityLogger.dataRestore();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Restore failed: " + error.message);
    } finally {
      setIsRestoring(false);
      event.target.value = "";
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

        {/* Database Statistics */}
        <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">📊 Database Statistics</h2>
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
                onChange={handleRestore}
                disabled={isRestoring}
                className="hidden"
                id="restore-file"
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
