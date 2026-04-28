import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { SyncErrorPanel } from "@/components/SyncErrorPanel";
import { useShopSettings } from "@/hooks/useShopSettings";
import { MobileDashboardWidget } from "./MobileDashboardWidget";
import { Wallet, TrendingUp, AlertCircle, PiggyBank, Users, CreditCard, ShoppingCart, Award, BarChart3, ChevronUp, ChevronDown } from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { db as localDb } from "@/lib/db";
import { useLiveQuery } from "@/hooks/useLiveQuery";

interface DashboardProps {
  onNavigateToPOS?: () => void;
  onNavigateToProducts?: () => void;
}

export function Dashboard({ onNavigateToPOS, onNavigateToProducts }: DashboardProps = {}) {
  const { settings, logoSrc } = useShopSettings();
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const { containerRef, headerRef, hidden: headerHidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();

  const products = useLiveQuery(() => localDb.products.list(), []);
  const productsLoading = products === undefined;
  const rawSales = useLiveQuery(() => localDb.sales.list(), []);
  const rawSaleItems = useLiveQuery(() => localDb.saleItems.list(), []);
  const salesLoading = rawSales === undefined || rawSaleItems === undefined;
  const customers = useLiveQuery(() => localDb.customers.list(), []);
  const investmentEntries = useLiveQuery(() => localDb.investmentEntries.list(), []);
  const investmentIncomes = useLiveQuery(() => localDb.investmentIncomes.list(), []);

  // Reconstruct sales with sale_items + products(condition,name,cost)
  const sales = useMemo(() => {
    if (salesLoading) return undefined;
    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));
    const itemsBySale = new Map<string, any[]>();
    for (const it of rawSaleItems ?? []) {
      const arr = itemsBySale.get((it as any).sale_id) ?? [];
      const p: any = productMap.get((it as any).product_id);
      arr.push({
        ...it,
        products: p
          ? { condition: p.condition ?? "new", name: p.name, cost: p.cost }
          : null,
      });
      itemsBySale.set((it as any).sale_id, arr);
    }
    return (rawSales ?? []).map((s: any) => ({
      ...s,
      sale_items: itemsBySale.get(s.id) ?? [],
    }));
  }, [salesLoading, rawSales, rawSaleItems, products]);

  // Due sales summary with customer name/phone
  const dueSales = useMemo(() => {
    if (salesLoading || customers === undefined) return undefined;
    const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
    return (rawSales ?? [])
      .filter((s: any) => Number(s.due_amount) > 0)
      .map((s: any) => {
        const c: any = s.customer_id ? customerMap.get(s.customer_id) : null;
        return {
          id: s.id,
          total_amount: s.total_amount,
          paid_amount: s.paid_amount,
          due_amount: s.due_amount,
          customer_id: s.customer_id,
          instant_customer_name: s.instant_customer_name,
          customers: c ? { name: c.name, phone: c.phone ?? null } : null,
        };
      });
  }, [salesLoading, rawSales, customers]);

  const totalProducts = products?.length || 0;
  const outOfStockProducts = products?.filter(p => p.stock_quantity <= 0).length || 0;
  const totalSales = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  
  const today = new Date();
  const todayStr = today.toDateString();
  const todaySalesData = sales?.filter(s => new Date(s.created_at).toDateString() === todayStr) || [];
  const todaySalesCount = todaySalesData.length;
  const todayRevenue = todaySalesData.reduce((s, sale) => s + Number(sale.total_amount), 0);

  // Today's profit calculation
  const todayProfit = useMemo(() => {
    let profit = 0;
    todaySalesData.forEach(sale => {
      sale.sale_items?.forEach((item: any) => {
        const cost = Number(item.products?.cost || 0);
        const revenue = Number(item.total_price);
        profit += revenue - (cost * item.quantity);
      });
    });
    return profit;
  }, [todaySalesData]);

  const newProducts = products?.filter(p => p.condition === 'new').length || 0;
  const usedProducts = products?.filter(p => p.condition === 'used').length || 0;
  const newProductsStock = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  const usedProductsStock = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  
  const newProductsInvestment = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const usedProductsInvestment = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const totalInvestment = newProductsInvestment + usedProductsInvestment;
  
  let newSalesRevenue = 0, usedSalesRevenue = 0, newSalesCount = 0, usedSalesCount = 0;
  sales?.forEach(sale => {
    sale.sale_items?.forEach((item: any) => {
      const condition = item.products?.condition || item.condition;
      if (condition === 'new') { newSalesRevenue += Number(item.total_price); newSalesCount += item.quantity; }
      else if (condition === 'used') { usedSalesRevenue += Number(item.total_price); usedSalesCount += item.quantity; }
    });
  });

  const totalInvDeposit = investmentEntries?.filter(e => e.entry_type === 'deposit').reduce((s, e) => s + Number(e.amount), 0) || 0;
  const totalInvWithdraw = investmentEntries?.filter(e => e.entry_type === 'withdraw').reduce((s, e) => s + Number(e.amount), 0) || 0;
  const netInvestmentAmount = totalInvDeposit - totalInvWithdraw;
  const totalIncomeAmount = investmentIncomes?.reduce((s, i) => s + Number(i.amount), 0) || 0;
  const totalDueAmount = dueSales?.reduce((s, sale) => s + Number(sale.due_amount), 0) || 0;
  const totalDueCount = dueSales?.length || 0;

  // Top debtors
  const topDebtors = useMemo(() => {
    const map: Record<string, { name: string; phone: string; totalDue: number; count: number }> = {};
    dueSales?.forEach(sale => {
      const key = sale.customer_id || sale.instant_customer_name || 'unknown';
      const name = (sale as any).customers?.name || sale.instant_customer_name || 'অজানা';
      const phone = (sale as any).customers?.phone || '';
      if (!map[key]) map[key] = { name, phone, totalDue: 0, count: 0 };
      map[key].totalDue += Number(sale.due_amount);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.totalDue - a.totalDue).slice(0, 5);
  }, [dueSales]);

  // Weekly sales chart data (last 7 days)
  const weeklySalesData = useMemo(() => {
    const days: { date: string; label: string; revenue: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const daySales = sales?.filter(s => new Date(s.created_at).toDateString() === dateStr) || [];
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('bn-BD', { weekday: 'short' }),
        revenue: daySales.reduce((s, sale) => s + Number(sale.total_amount), 0),
        count: daySales.length,
      });
    }
    return days;
  }, [sales]);

  // Monthly comparison (current vs previous month)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthSales = sales?.filter(s => {
      const d = new Date(s.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }) || [];
    const prevMonthSales = sales?.filter(s => {
      const d = new Date(s.created_at);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }) || [];

    // Build daily data for chart
    const daysInCurrent = new Date(currentYear, currentMonth + 1, 0).getDate();
    const result = [];
    for (let day = 1; day <= Math.min(daysInCurrent, 31); day++) {
      const curDaySales = currentMonthSales.filter(s => new Date(s.created_at).getDate() === day);
      const prevDaySales = prevMonthSales.filter(s => new Date(s.created_at).getDate() === day);
      result.push({
        day: `${day}`,
        current: curDaySales.reduce((s, sale) => s + Number(sale.total_amount), 0),
        previous: prevDaySales.reduce((s, sale) => s + Number(sale.total_amount), 0),
      });
    }
    return {
      chartData: result,
      currentTotal: currentMonthSales.reduce((s, sale) => s + Number(sale.total_amount), 0),
      prevTotal: prevMonthSales.reduce((s, sale) => s + Number(sale.total_amount), 0),
      currentCount: currentMonthSales.length,
      prevCount: prevMonthSales.length,
    };
  }, [sales]);

  // Top selling products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    sales?.forEach(sale => {
      sale.sale_items?.forEach((item: any) => {
        const name = item.products?.name || 'Unknown';
        const pid = item.product_id;
        if (!map[pid]) map[pid] = { name, qty: 0, revenue: 0 };
        map[pid].qty += item.quantity;
        map[pid].revenue += Number(item.total_price);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales]);

  // Top customers by purchase
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    sales?.forEach(sale => {
      if (!sale.customer_id) return;
      const cust = customers?.find(c => c.id === sale.customer_id);
      const name = cust?.name || sale.instant_customer_name || 'অজানা';
      if (!map[sale.customer_id]) map[sale.customer_id] = { name, total: 0, count: 0 };
      map[sale.customer_id].total += Number(sale.total_amount);
      map[sale.customer_id].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [sales, customers]);

  const stats = [
    { label: "মোট প্রোডাক্ট", value: totalProducts, icon: "📦", color: "from-amber-500 to-orange-600" },
    { label: "আউট অফ স্টক", value: outOfStockProducts, icon: "🚫", color: "from-rose-500 to-red-600" },
    { label: "মোট বিক্রয়", value: `৳${totalSales.toLocaleString('bn-BD')}`, icon: "💰", color: "from-emerald-500 to-teal-600" },
    { label: "আজকের বিক্রয়", value: todaySalesCount, icon: "📈", color: "from-sky-500 to-indigo-600" },
  ];

  const isLoading = productsLoading || salesLoading;

  const LoadingSkeleton = () => (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-start justify-between">
          <div><Skeleton className="h-9 w-48 mb-2" /><Skeleton className="h-5 w-72" /></div>
          <Skeleton className="w-20 h-20 rounded-lg" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {[1,2,3,4].map(i => <Card key={i} className="p-6"><Skeleton className="h-8 w-32" /></Card>)}
        </div>
      </div>
    </div>
  );

  if (isLoading) return <LoadingSkeleton />;

  const weeklyChartConfig = { revenue: { label: "বিক্রয়", color: "hsl(var(--primary))" } };
  const monthlyChartConfig = { current: { label: "এই মাস", color: "hsl(142, 76%, 36%)" }, previous: { label: "গত মাস", color: "hsl(215, 20%, 65%)" } };

  return (
    <div className="flex flex-col h-screen animate-fade-in overflow-x-hidden w-full max-w-full">
      <div ref={headerRef} style={{ marginBottom: headerHidden ? `-${headerHeight}px` : 0, transition: 'margin-bottom 300ms ease' }} className={`sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50 pb-3 lg:pb-4 transition-transform duration-300 ${headerHidden ? '-translate-y-full lg:translate-y-0 lg:!mb-0' : 'translate-y-0'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">ড্যাশবোর্ড</h1>
              <SyncStatusBadge className="hidden sm:inline-flex" />
              <SyncErrorPanel className="hidden sm:inline-flex" />
              <button
                type="button"
                className="lg:hidden h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted shrink-0"
                onClick={() => setShowHeaderInfo(v => !v)}
                aria-label={showHeaderInfo ? "হেডার লুকান" : "হেডার দেখান"}
              >
                {showHeaderInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-muted-foreground mt-1 text-xs sm:text-sm lg:text-base ${showHeaderInfo ? "block" : "hidden lg:block"}`}>স্বাগতম! আপনার ব্যবসার সারসংক্ষেপ দেখুন।</p>
          </div>
          <img src={logoSrc} alt={settings.shop_name} className={`w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 shrink-0 ${showHeaderInfo ? "block" : "hidden lg:block"}`} />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto pb-20 lg:pb-6 space-y-4 lg:space-y-6">
        <MobileDashboardWidget onNavigateToPOS={onNavigateToPOS} onNavigateToProducts={onNavigateToProducts} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
          {stats.map((stat, index) => (
            <Card key={index} className="p-3 sm:p-4 lg:p-6 card-hover border-border bg-card">
              <div className="flex items-start justify-between">
                <div className="space-y-1 lg:space-y-2 min-w-0">
                  <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-lg sm:text-xl lg:text-3xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-base sm:text-lg lg:text-2xl flex-shrink-0`}>
                  {stat.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Today's Summary: Revenue, Profit, Stock Alert */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
          <Card className="p-3 lg:p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <p className="text-xs lg:text-sm text-muted-foreground">আজকের রেভিনিউ</p>
            </div>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-emerald-600">৳{todayRevenue.toLocaleString('bn-BD')}</p>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">{todaySalesCount}টি বিক্রয়</p>
          </Card>
          <Card className="p-3 lg:p-4 bg-sky-50 dark:bg-sky-950/20 border-sky-200">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <p className="text-xs lg:text-sm text-muted-foreground">আজকের লাভ</p>
            </div>
            <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${todayProfit >= 0 ? 'text-sky-600' : 'text-rose-600'}`}>৳{todayProfit.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className={`p-3 lg:p-4 ${outOfStockProducts > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200' : 'bg-green-50 dark:bg-green-950/20 border-green-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className={`w-4 h-4 ${outOfStockProducts > 0 ? 'text-red-600' : 'text-green-600'}`} />
              <p className="text-xs lg:text-sm text-muted-foreground">স্টক অ্যালার্ট</p>
            </div>
            <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${outOfStockProducts > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {outOfStockProducts > 0 ? `${outOfStockProducts}টি আউট অফ স্টক` : 'সব ঠিক আছে ✓'}
            </p>
          </Card>
        </div>

        {/* Weekly Sales Bar Chart */}
        <Card className="p-4 lg:p-6">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-3 lg:mb-4 text-foreground flex items-center">
            <BarChart3 className="w-5 h-5 lg:w-6 lg:h-6 mr-2 text-primary" />
            এই সপ্তাহের বিক্রয়
          </h2>
          <div className="h-48 lg:h-64">
            <ChartContainer config={weeklyChartConfig} className="w-full h-full">
              <BarChart data={weeklySalesData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} width={50} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </Card>

        {/* Monthly Comparison Line Chart */}
        <Card className="p-4 lg:p-6">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-2 text-foreground flex items-center">
            <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 mr-2 text-emerald-600" />
            মাসিক তুলনামূলক বিক্রয়
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-center">
              <p className="text-[10px] lg:text-xs text-muted-foreground">এই মাস</p>
              <p className="text-sm lg:text-lg font-bold text-emerald-600">৳{monthlyData.currentTotal.toLocaleString('bn-BD')}</p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground">{monthlyData.currentCount}টি বিক্রয়</p>
            </div>
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
              <p className="text-[10px] lg:text-xs text-muted-foreground">গত মাস</p>
              <p className="text-sm lg:text-lg font-bold text-muted-foreground">৳{monthlyData.prevTotal.toLocaleString('bn-BD')}</p>
              <p className="text-[9px] lg:text-[10px] text-muted-foreground">{monthlyData.prevCount}টি বিক্রয়</p>
            </div>
          </div>
          <div className="h-48 lg:h-56">
            <ChartContainer config={monthlyChartConfig} className="w-full h-full">
              <LineChart data={monthlyData.chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} width={50} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="current" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="previous" stroke="hsl(215, 20%, 65%)" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ChartContainer>
          </div>
        </Card>

        {/* Top Products & Top Customers side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Products */}
          <Card className="p-4 lg:p-6 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200/60">
            <h2 className="text-base lg:text-lg font-semibold mb-3 text-foreground flex items-center">
              <Award className="w-5 h-5 mr-2 text-amber-600" />
              টপ বিক্রিত প্রোডাক্ট
            </h2>
            <div className="space-y-2">
              {topProducts.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/70 dark:bg-gray-800/50 border border-amber-100 dark:border-amber-900/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-600 flex-shrink-0">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-xs lg:text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[9px] lg:text-[10px] text-muted-foreground">{p.qty}টি বিক্রিত</p>
                    </div>
                  </div>
                  <p className="text-xs lg:text-sm font-bold text-amber-600 flex-shrink-0 ml-2">৳{p.revenue.toLocaleString('bn-BD')}</p>
                </div>
              ))}
              {topProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">কোনো বিক্রয় ডেটা নেই</p>}
            </div>
          </Card>

          {/* Top Customers */}
          <Card className="p-4 lg:p-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-indigo-200/60">
            <h2 className="text-base lg:text-lg font-semibold mb-3 text-foreground flex items-center">
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
              টপ কাস্টমার
            </h2>
            <div className="space-y-2">
              {topCustomers.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/70 dark:bg-gray-800/50 border border-indigo-100 dark:border-indigo-900/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-xs lg:text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[9px] lg:text-[10px] text-muted-foreground">{c.count}টি ক্রয়</p>
                    </div>
                  </div>
                  <p className="text-xs lg:text-sm font-bold text-indigo-600 flex-shrink-0 ml-2">৳{c.total.toLocaleString('bn-BD')}</p>
                </div>
              ))}
              {topCustomers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">কোনো কাস্টমার ডেটা নেই</p>}
            </div>
          </Card>
        </div>

        {/* Investment & Due Summary */}
        <Card className="p-4 lg:p-6 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200/60">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-3 lg:mb-4 text-foreground flex items-center">
            <Wallet className="w-5 h-5 lg:w-6 lg:h-6 mr-2 text-violet-600" />
            ইনভেস্টমেন্ট ও বাকি আদায় সামারি
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            <Card className="p-3 lg:p-4 bg-violet-50 dark:bg-violet-950/20 border-violet-200">
              <div className="flex items-center gap-2 mb-1 lg:mb-2"><PiggyBank className="w-4 h-4 text-violet-600" /><p className="text-xs lg:text-sm text-muted-foreground">নেট বিনিয়োগ</p></div>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-violet-600">৳{netInvestmentAmount.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-3 lg:p-4 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200">
              <div className="flex items-center gap-2 mb-1 lg:mb-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><p className="text-xs lg:text-sm text-muted-foreground">মোট আয়</p></div>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-emerald-600">৳{totalIncomeAmount.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-3 lg:p-4 bg-rose-50 dark:bg-rose-950/20 border-rose-200">
              <div className="flex items-center gap-2 mb-1 lg:mb-2"><AlertCircle className="w-4 h-4 text-rose-600" /><p className="text-xs lg:text-sm text-muted-foreground">বাকি আদায় বাকি</p></div>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-rose-600">৳{totalDueAmount.toLocaleString('bn-BD')}</p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-1">{totalDueCount}টি বিক্রয়ে বাকি আছে</p>
            </Card>
          </div>
        </Card>

        {/* Top Debtors */}
        {topDebtors.length > 0 && (
          <Card className="p-4 lg:p-6 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/20 dark:to-orange-950/20 border-rose-200/60">
            <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-3 lg:mb-4 text-foreground flex items-center">
              <CreditCard className="w-5 h-5 lg:w-6 lg:h-6 mr-2 text-rose-600" />
              শীর্ষ বাকিদার কাস্টমার
            </h2>
            <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-3 lg:mb-4">
              <Card className="p-2 lg:p-3 bg-rose-50 dark:bg-rose-950/20 border-rose-200 text-center">
                <p className="text-[10px] lg:text-xs text-muted-foreground">মোট বাকি</p>
                <p className="text-sm sm:text-base lg:text-xl font-bold text-rose-600">৳{totalDueAmount.toLocaleString('bn-BD')}</p>
              </Card>
              <Card className="p-2 lg:p-3 bg-orange-50 dark:bg-orange-950/20 border-orange-200 text-center">
                <p className="text-[10px] lg:text-xs text-muted-foreground">বাকি বিক্রয়</p>
                <p className="text-sm sm:text-base lg:text-xl font-bold text-orange-600">{totalDueCount}টি</p>
              </Card>
              <Card className="p-2 lg:p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-center">
                <p className="text-[10px] lg:text-xs text-muted-foreground">বাকিদার সংখ্যা</p>
                <p className="text-sm sm:text-base lg:text-xl font-bold text-amber-600">{topDebtors.length}জন</p>
              </Card>
            </div>
            <div className="space-y-2">
              {topDebtors.map((debtor, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 lg:p-3 rounded-lg bg-white/70 dark:bg-gray-800/50 border border-rose-100 dark:border-rose-900/30">
                  <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-xs lg:text-sm font-bold text-rose-600 flex-shrink-0">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-xs lg:text-sm font-medium text-foreground truncate">{debtor.name}</p>
                      {debtor.phone && <p className="text-[9px] lg:text-[10px] text-muted-foreground">📞 {debtor.phone}</p>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs lg:text-sm font-bold text-rose-600">৳{debtor.totalDue.toLocaleString('bn-BD')}</p>
                    <Badge variant="outline" className="text-[8px] lg:text-[9px] border-rose-300 text-rose-600">{debtor.count}টি বিক্রয়</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Investment Analysis */}
        <Card className="p-4 lg:p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200/60">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4 lg:mb-6 text-foreground flex items-center">
            <span className="text-xl lg:text-2xl mr-2">💰</span>
            মোট বিনিয়োগ বিশ্লেষণ
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-6">
            <Card className="p-3 lg:p-6 bg-green-50 dark:bg-green-950/20 border-green-200">
              <div className="flex items-center space-x-2 mb-2 lg:mb-3"><div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-green-500" /><p className="text-xs lg:text-sm font-medium text-muted-foreground">নতুন প্রোডাক্ট বিনিয়োগ</p></div>
              <p className="text-lg sm:text-xl lg:text-3xl font-bold text-green-600">৳{newProductsInvestment.toLocaleString('bn-BD')}</p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-1 lg:mt-2">{newProducts}টি প্রোডাক্ট • {newProductsStock}টি ইউনিট</p>
            </Card>
            <Card className="p-3 lg:p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
              <div className="flex items-center space-x-2 mb-2 lg:mb-3"><div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-blue-500" /><p className="text-xs lg:text-sm font-medium text-muted-foreground">ব্যবহৃত প্রোডাক্ট বিনিয়োগ</p></div>
              <p className="text-lg sm:text-xl lg:text-3xl font-bold text-blue-600">৳{usedProductsInvestment.toLocaleString('bn-BD')}</p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-1 lg:mt-2">{usedProducts}টি প্রোডাক্ট • {usedProductsStock}টি ইউনিট</p>
            </Card>
            <Card className="p-3 lg:p-6 bg-amber-50 dark:bg-amber-950/20 border-amber-200/60">
              <div className="flex items-center space-x-2 mb-2 lg:mb-3"><div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-amber-500" /><p className="text-xs lg:text-sm font-medium text-muted-foreground">সর্বমোট বিনিয়োগ</p></div>
              <p className="text-lg sm:text-xl lg:text-3xl font-bold text-amber-600">৳{totalInvestment.toLocaleString('bn-BD')}</p>
              <p className="text-[10px] lg:text-xs text-muted-foreground mt-1 lg:mt-2">{newProducts + usedProducts}টি প্রোডাক্ট • {newProductsStock + usedProductsStock}টি ইউনিট</p>
            </Card>
          </div>
          <div className="mt-4 lg:mt-6 grid grid-cols-2 gap-3 lg:gap-4">
            <div className="bg-white dark:bg-gray-800 p-3 lg:p-4 rounded-lg">
              <p className="text-xs lg:text-sm text-muted-foreground mb-1">নতুন প্রোডাক্ট শেয়ার</p>
              <div className="flex items-center space-x-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${totalInvestment > 0 ? (newProductsInvestment / totalInvestment * 100) : 0}%` }} />
                </div>
                <p className="text-xs lg:text-sm font-semibold text-green-600">{totalInvestment > 0 ? ((newProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-3 lg:p-4 rounded-lg">
              <p className="text-xs lg:text-sm text-muted-foreground mb-1">ব্যবহৃত প্রোডাক্ট শেয়ার</p>
              <div className="flex items-center space-x-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${totalInvestment > 0 ? (usedProductsInvestment / totalInvestment * 100) : 0}%` }} />
                </div>
                <p className="text-xs lg:text-sm font-semibold text-blue-600">{totalInvestment > 0 ? ((usedProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Product Condition Analysis */}
        <Card className="p-4 lg:p-6">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold mb-4 lg:mb-6 text-foreground">প্রোডাক্ট অবস্থা বিশ্লেষণ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            <div className="space-y-3 lg:space-y-4">
              <div className="flex items-center space-x-2 mb-3 lg:mb-4"><div className="w-3 h-3 rounded-full bg-green-500" /><h3 className="text-sm lg:text-lg font-semibold text-foreground">নতুন প্রোডাক্ট</h3></div>
              <div className="grid grid-cols-2 gap-2 lg:gap-4">
                <Card className="p-3 lg:p-4 bg-green-50 dark:bg-green-950/20 border-green-200"><p className="text-[10px] lg:text-sm text-muted-foreground">প্রোডাক্ট</p><p className="text-lg lg:text-2xl font-bold text-green-600">{newProducts}</p></Card>
                <Card className="p-3 lg:p-4 bg-green-50 dark:bg-green-950/20 border-green-200"><p className="text-[10px] lg:text-sm text-muted-foreground">মোট স্টক</p><p className="text-lg lg:text-2xl font-bold text-green-600">{newProductsStock}</p></Card>
                <Card className="p-3 lg:p-4 bg-green-50 dark:bg-green-950/20 border-green-200"><p className="text-[10px] lg:text-sm text-muted-foreground">বিক্রয়</p><p className="text-lg lg:text-2xl font-bold text-green-600">{newSalesCount}</p></Card>
                <Card className="p-3 lg:p-4 bg-green-50 dark:bg-green-950/20 border-green-200"><p className="text-[10px] lg:text-sm text-muted-foreground">রেভিনিউ</p><p className="text-lg lg:text-2xl font-bold text-green-600">৳{newSalesRevenue.toLocaleString('bn-BD')}</p></Card>
              </div>
            </div>
            <div className="space-y-3 lg:space-y-4">
              <div className="flex items-center space-x-2 mb-3 lg:mb-4"><div className="w-3 h-3 rounded-full bg-blue-500" /><h3 className="text-sm lg:text-lg font-semibold text-foreground">ব্যবহৃত প্রোডাক্ট</h3></div>
              <div className="grid grid-cols-2 gap-2 lg:gap-4">
                <Card className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200"><p className="text-[10px] lg:text-sm text-muted-foreground">প্রোডাক্ট</p><p className="text-lg lg:text-2xl font-bold text-blue-600">{usedProducts}</p></Card>
                <Card className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200"><p className="text-[10px] lg:text-sm text-muted-foreground">মোট স্টক</p><p className="text-lg lg:text-2xl font-bold text-blue-600">{usedProductsStock}</p></Card>
                <Card className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200"><p className="text-[10px] lg:text-sm text-muted-foreground">বিক্রয়</p><p className="text-lg lg:text-2xl font-bold text-blue-600">{usedSalesCount}</p></Card>
                <Card className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200"><p className="text-[10px] lg:text-sm text-muted-foreground">রেভিনিউ</p><p className="text-lg lg:text-2xl font-bold text-blue-600">৳{usedSalesRevenue.toLocaleString('bn-BD')}</p></Card>
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">সাম্প্রতিক কার্যক্রম</h2>
          <div className="space-y-4">
            {sales?.slice(0, 5).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <p className="font-medium text-foreground">বিক্রয় #{sale.id.slice(0, 8)}</p>
                  <p className="text-sm text-muted-foreground">{new Date(sale.created_at).toLocaleDateString('bn-BD')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">৳{Number(sale.total_amount).toLocaleString('bn-BD')}</p>
                  <p className="text-sm text-muted-foreground">{sale.payment_method === 'cash' ? 'নগদ' : sale.payment_method === 'card' ? 'কার্ড' : 'মোবাইল'}</p>
                </div>
              </div>
            ))}
            {(!sales || sales.length === 0) && <p className="text-center text-muted-foreground py-8">এখনো কোনো বিক্রয় নেই। বিক্রয় শুরু করুন!</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
