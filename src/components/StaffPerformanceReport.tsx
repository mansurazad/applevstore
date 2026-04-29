import { useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";
import { useOfflineQuery, readLocalTable } from "@/hooks/useOfflineQuery";
import { LocalDB } from "@/lib/localdb/adapter";
import { OfflineBanner } from "@/components/OfflineBanner";
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  subDays,
  subWeeks,
  subMonths
} from "date-fns";
import { bn } from "date-fns/locale";
import { 
  FileText, 
  Download, 
  Shield,
  User,
  ShoppingCart,
  Package,
  LogIn,
  BarChart3,
  TrendingUp,
  Clock
} from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import shopLogo from "@/assets/big-boss-logo.png";

interface StaffPerformance {
  email: string;
  userId: string | null;
  totalActions: number;
  loginCount: number;
  logoutCount: number;
  salesCount: number;
  salesAmount: number;
  productActions: number;
  productAdded: number;
  productUpdated: number;
  productDeleted: number;
  customerActions: number;
  averageActionsPerDay: number;
}

type ReportPeriod = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

export function StaffPerformanceReport() {
  const { isAdmin, isManager, loading: roleLoading } = useUserRole();
  const [period, setPeriod] = useState<ReportPeriod>('thisWeek');
  const printRef = useRef<HTMLDivElement>(null);

  const getDateRange = (p: ReportPeriod) => {
    const now = new Date();
    switch (p) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now), label: 'আজ', days: 1 };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday), label: 'গতকাল', days: 1 };
      case 'thisWeek':
        return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }), label: 'এই সপ্তাহ', days: 7 };
      case 'lastWeek':
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 0 }), end: endOfWeek(lastWeek, { weekStartsOn: 0 }), label: 'গত সপ্তাহ', days: 7 };
      case 'thisMonth':
        return { start: startOfMonth(now), end: endOfMonth(now), label: 'এই মাস', days: 30 };
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth), label: 'গত মাস', days: 30 };
      default:
        return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }), label: 'এই সপ্তাহ', days: 7 };
    }
  };

  const dateRange = getDateRange(period);

  // Fetch activity logs for the period (offline-aware)
  const { data: logs, isLoading: logsLoading } = useOfflineQuery<any[]>(
    ['staff-performance-logs', period],
    async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async () => {
      const all = await LocalDB.listAll<any>('activity_logs');
      const startMs = dateRange.start.getTime();
      const endMs = dateRange.end.getTime();
      return all
        .filter((l) => {
          const ts = l.created_at ? new Date(l.created_at).getTime() : 0;
          return ts >= startMs && ts <= endMs;
        })
        .sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
    },
    undefined,
    { enabled: isAdmin || isManager }
  );

  // Fetch sales for the period (offline-aware)
  const { data: sales, isLoading: salesLoading } = useOfflineQuery<any[]>(
    ['staff-performance-sales', period],
    async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('user_id, total_amount, created_at')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
      if (error) throw error;
      return data || [];
    },
    async () => {
      const all = await LocalDB.listAll<any>('sales');
      const startMs = dateRange.start.getTime();
      const endMs = dateRange.end.getTime();
      return all
        .filter((s) => {
          const ts = s.created_at ? new Date(s.created_at).getTime() : 0;
          return ts >= startMs && ts <= endMs;
        })
        .map((s) => ({ user_id: s.user_id, total_amount: s.total_amount, created_at: s.created_at }));
    },
    undefined,
    { enabled: isAdmin || isManager }
  );

  // Fetch profiles to map user_id to email (offline-aware via cache)
  const { data: profiles } = useOfflineQuery<any[]>(
    ['profiles'],
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name');
      if (error) throw error;
      return data || [];
    },
    async () => readLocalTable<any>('profiles_cache'),
    undefined,
    { enabled: isAdmin || isManager }
  );

  // Calculate staff performance
  const staffPerformance = useMemo(() => {
    if (!logs) return [];

    const performanceMap = new Map<string, StaffPerformance>();

    // Process activity logs
    logs.forEach(log => {
      const email = log.user_email || 'System';
      
      if (!performanceMap.has(email)) {
        performanceMap.set(email, {
          email,
          userId: log.user_id,
          totalActions: 0,
          loginCount: 0,
          logoutCount: 0,
          salesCount: 0,
          salesAmount: 0,
          productActions: 0,
          productAdded: 0,
          productUpdated: 0,
          productDeleted: 0,
          customerActions: 0,
          averageActionsPerDay: 0,
        });
      }

      const perf = performanceMap.get(email)!;
      perf.totalActions++;

      // Track by action type
      if (log.action_type === 'auth') {
        if (log.action.toLowerCase().includes('logged in') || log.action.toLowerCase().includes('login')) {
          perf.loginCount++;
        }
        if (log.action.toLowerCase().includes('logged out') || log.action.toLowerCase().includes('logout')) {
          perf.logoutCount++;
        }
      }

      if (log.action_type === 'sale') {
        perf.salesCount++;
      }

      if (log.action_type === 'product') {
        perf.productActions++;
        if (log.action.toLowerCase().includes('added') || log.action.toLowerCase().includes('created')) {
          perf.productAdded++;
        }
        if (log.action.toLowerCase().includes('updated')) {
          perf.productUpdated++;
        }
        if (log.action.toLowerCase().includes('deleted')) {
          perf.productDeleted++;
        }
      }

      if (log.action_type === 'customer') {
        perf.customerActions++;
      }
    });

    // Add sales amounts from sales table
    if (sales && profiles) {
      const profileMap = new Map(profiles.map(p => [p.id, p.email]));
      
      sales.forEach(sale => {
        const email = profileMap.get(sale.user_id) || 'Unknown';
        const perf = performanceMap.get(email);
        if (perf) {
          perf.salesAmount += Number(sale.total_amount) || 0;
        }
      });
    }

    // Calculate average actions per day
    performanceMap.forEach(perf => {
      perf.averageActionsPerDay = Math.round(perf.totalActions / dateRange.days);
    });

    return Array.from(performanceMap.values())
      .filter(p => p.email !== 'System')
      .sort((a, b) => b.salesAmount - a.salesAmount);
  }, [logs, sales, profiles, dateRange.days]);

  // Summary stats
  const summaryStats = useMemo(() => {
    return {
      totalStaff: staffPerformance.length,
      totalSales: staffPerformance.reduce((sum, p) => sum + p.salesCount, 0),
      totalRevenue: staffPerformance.reduce((sum, p) => sum + p.salesAmount, 0),
      totalProducts: staffPerformance.reduce((sum, p) => sum + p.productActions, 0),
      totalLogins: staffPerformance.reduce((sum, p) => sum + p.loginCount, 0),
      topPerformer: staffPerformance[0]?.email || 'N/A',
    };
  }, [staffPerformance]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Staff-Performance-Report-${format(new Date(), 'yyyy-MM-dd')}`,
    onAfterPrint: () => toast.success("রিপোর্ট PDF হিসেবে সেভ হয়েছে"),
  });

  if (roleLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (!isAdmin && !isManager) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">অ্যাক্সেস সীমাবদ্ধ</h3>
          <p className="text-muted-foreground">শুধুমাত্র এডমিন ও ম্যানেজার এই রিপোর্ট দেখতে পারেন।</p>
        </div>
      </Card>
    );
  }

  const isLoading = logsLoading || salesLoading;

  return (
    <Card className="p-6">
      <OfflineBanner message="অফলাইনে স্থানীয় সিঙ্ক ডেটার ভিত্তিতে স্টাফ পারফরম্যান্স দেখানো হচ্ছে।" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">📊 স্টাফ পারফরম্যান্স রিপোর্ট</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">আজ</SelectItem>
              <SelectItem value="yesterday">গতকাল</SelectItem>
              <SelectItem value="thisWeek">এই সপ্তাহ</SelectItem>
              <SelectItem value="lastWeek">গত সপ্তাহ</SelectItem>
              <SelectItem value="thisMonth">এই মাস</SelectItem>
              <SelectItem value="lastMonth">গত মাস</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => handlePrint()} disabled={isLoading || staffPerformance.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            PDF ডাউনলোড
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-3 bg-blue-50 dark:bg-blue-950">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-muted-foreground">স্টাফ সংখ্যা</span>
          </div>
          <p className="text-xl font-bold text-blue-600">{summaryStats.totalStaff}</p>
        </Card>
        <Card className="p-3 bg-green-50 dark:bg-green-950">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-green-600" />
            <span className="text-xs text-muted-foreground">মোট বিক্রয়</span>
          </div>
          <p className="text-xl font-bold text-green-600">{summaryStats.totalSales}</p>
        </Card>
        <Card className="p-3 bg-purple-50 dark:bg-purple-950">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-muted-foreground">মোট আয়</span>
          </div>
          <p className="text-lg font-bold text-purple-600">৳{summaryStats.totalRevenue.toLocaleString('bn-BD')}</p>
        </Card>
        <Card className="p-3 bg-orange-50 dark:bg-orange-950">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-orange-600" />
            <span className="text-xs text-muted-foreground">প্রোডাক্ট</span>
          </div>
          <p className="text-xl font-bold text-orange-600">{summaryStats.totalProducts}</p>
        </Card>
        <Card className="p-3 bg-cyan-50 dark:bg-cyan-950">
          <div className="flex items-center gap-2 mb-1">
            <LogIn className="w-4 h-4 text-cyan-600" />
            <span className="text-xs text-muted-foreground">মোট লগইন</span>
          </div>
          <p className="text-xl font-bold text-cyan-600">{summaryStats.totalLogins}</p>
        </Card>
        <Card className="p-3 bg-pink-50 dark:bg-pink-950">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-pink-600" />
            <span className="text-xs text-muted-foreground">টপ পারফর্মার</span>
          </div>
          <p className="text-sm font-bold text-pink-600 truncate">{summaryStats.topPerformer}</p>
        </Card>
      </div>

      {/* Performance Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>স্টাফ</TableHead>
                <TableHead className="text-center">বিক্রয়</TableHead>
                <TableHead className="text-center">বিক্রয় মূল্য</TableHead>
                <TableHead className="text-center">প্রোডাক্ট</TableHead>
                <TableHead className="text-center">লগইন</TableHead>
                <TableHead className="text-center">মোট অ্যাকশন</TableHead>
                <TableHead className="text-center">গড়/দিন</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffPerformance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    এই সময়কালে কোনো কার্যকলাপ পাওয়া যায়নি
                  </TableCell>
                </TableRow>
              ) : (
                staffPerformance.map((staff, index) => (
                  <TableRow key={staff.email}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                          index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-primary/50'
                        }`}>
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium truncate max-w-[150px]">{staff.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold text-green-600">{staff.salesCount}</TableCell>
                    <TableCell className="text-center font-semibold text-purple-600">৳{staff.salesAmount.toLocaleString('bn-BD')}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm">
                        +{staff.productAdded} / ✎{staff.productUpdated} / ×{staff.productDeleted}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{staff.loginCount}</TableCell>
                    <TableCell className="text-center font-semibold">{staff.totalActions}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{staff.averageActionsPerDay}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Print Template */}
      <div className="hidden">
        <div ref={printRef} className="p-8 bg-white">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 border-b pb-4">
            <div className="flex items-center gap-3">
              <img src={shopLogo} alt="Apple Store" className="w-16 h-16" />
              <div>
                <h1 className="text-2xl font-bold">👑 Apple Store</h1>
                <p className="text-gray-600">স্টাফ পারফরম্যান্স রিপোর্ট</p>
              </div>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p>সময়কাল: {dateRange.label}</p>
              <p>{format(dateRange.start, 'dd MMM yyyy', { locale: bn })} - {format(dateRange.end, 'dd MMM yyyy', { locale: bn })}</p>
              <p className="mt-1">প্রিন্ট: {format(new Date(), 'dd MMM yyyy, hh:mm a', { locale: bn })}</p>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded p-3 text-center">
              <p className="text-gray-600 text-sm">মোট স্টাফ</p>
              <p className="text-2xl font-bold">{summaryStats.totalStaff}</p>
            </div>
            <div className="border rounded p-3 text-center">
              <p className="text-gray-600 text-sm">মোট বিক্রয়</p>
              <p className="text-2xl font-bold text-green-600">{summaryStats.totalSales}</p>
            </div>
            <div className="border rounded p-3 text-center">
              <p className="text-gray-600 text-sm">মোট আয়</p>
              <p className="text-2xl font-bold text-purple-600">৳{summaryStats.totalRevenue.toLocaleString('bn-BD')}</p>
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-collapse border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">র‍্যাংক</th>
                <th className="border p-2 text-left">স্টাফ ইমেইল</th>
                <th className="border p-2 text-center">বিক্রয়</th>
                <th className="border p-2 text-center">বিক্রয় মূল্য</th>
                <th className="border p-2 text-center">প্রোডাক্ট যোগ</th>
                <th className="border p-2 text-center">লগইন</th>
                <th className="border p-2 text-center">মোট অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.map((staff, index) => (
                <tr key={staff.email}>
                  <td className="border p-2">{index + 1}</td>
                  <td className="border p-2">{staff.email}</td>
                  <td className="border p-2 text-center font-semibold">{staff.salesCount}</td>
                  <td className="border p-2 text-center">৳{staff.salesAmount.toLocaleString('bn-BD')}</td>
                  <td className="border p-2 text-center">{staff.productAdded}</td>
                  <td className="border p-2 text-center">{staff.loginCount}</td>
                  <td className="border p-2 text-center">{staff.totalActions}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center text-xs text-gray-500">
            <p>এই রিপোর্টটি Apple Store সিস্টেম থেকে স্বয়ংক্রিয়ভাবে তৈরি হয়েছে</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
