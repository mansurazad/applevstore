import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays } from "date-fns";
import { bn } from "date-fns/locale";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { LocalDB } from "@/lib/localdb/adapter";
import { OfflineBanner } from "@/components/OfflineBanner";
import { 
  Activity, 
  Shield, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck, 
  FolderOpen, 
  Settings,
  UserCog,
  Search,
  RefreshCw,
  User,
  Clock,
  LogIn,
  LogOut,
  Calendar,
  BarChart3
} from "lucide-react";

type ActionType = 'auth' | 'sale' | 'product' | 'customer' | 'supplier' | 'category' | 'settings' | 'user_management';

interface ActivityLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  action_type: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface UserActivitySummary {
  email: string;
  userId: string | null;
  totalActions: number;
  lastLogin: string | null;
  lastActivity: string | null;
  loginCount: number;
  logoutCount: number;
  salesCount: number;
  productActions: number;
  todayActions: number;
}

export function ActivityLog() {
  const { isAdmin, isManager, loading: roleLoading } = useUserRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7');
  const [activeTab, setActiveTab] = useState<string>('logs');

  const { data: logs, isLoading, refetch } = useOfflineQuery<ActivityLogEntry[]>(
    ['activity-logs', filterType, dateRange],
    async () => {
      const startDate = subDays(new Date(), parseInt(dateRange));
      let query = supabase
        .from('activity_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);
      if (filterType !== 'all') query = query.eq('action_type', filterType);
      const { data, error } = await query;
      if (error) throw error;
      return data as ActivityLogEntry[];
    },
    async () => {
      const startMs = subDays(new Date(), parseInt(dateRange)).getTime();
      const all = await LocalDB.listAll<any>('activity_logs');
      let filtered = all.filter((l) => {
        const ts = l.created_at ? new Date(l.created_at).getTime() : 0;
        if (ts < startMs) return false;
        if (filterType !== 'all' && l.action_type !== filterType) return false;
        return true;
      });
      filtered.sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      return filtered.slice(0, 500) as ActivityLogEntry[];
    },
    undefined,
    { enabled: isAdmin || isManager }
  );

  // Get unique users from logs
  const uniqueUsers = useMemo(() => {
    if (!logs) return [];
    const users = new Set<string>();
    logs.forEach(log => {
      if (log.user_email) users.add(log.user_email);
    });
    return Array.from(users).sort();
  }, [logs]);

  // Calculate user activity summaries
  const userSummaries = useMemo(() => {
    if (!logs) return [];
    
    const summaryMap = new Map<string, UserActivitySummary>();
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    logs.forEach(log => {
      const email = log.user_email || 'System';
      
      if (!summaryMap.has(email)) {
        summaryMap.set(email, {
          email,
          userId: log.user_id,
          totalActions: 0,
          lastLogin: null,
          lastActivity: null,
          loginCount: 0,
          logoutCount: 0,
          salesCount: 0,
          productActions: 0,
          todayActions: 0,
        });
      }

      const summary = summaryMap.get(email)!;
      summary.totalActions++;

      // Track last activity
      if (!summary.lastActivity || new Date(log.created_at) > new Date(summary.lastActivity)) {
        summary.lastActivity = log.created_at;
      }

      // Track login/logout
      if (log.action_type === 'auth') {
        if (log.action.toLowerCase().includes('logged in') || log.action.toLowerCase().includes('login')) {
          summary.loginCount++;
          if (!summary.lastLogin || new Date(log.created_at) > new Date(summary.lastLogin)) {
            summary.lastLogin = log.created_at;
          }
        }
        if (log.action.toLowerCase().includes('logged out') || log.action.toLowerCase().includes('logout')) {
          summary.logoutCount++;
        }
      }

      // Track sales
      if (log.action_type === 'sale') {
        summary.salesCount++;
      }

      // Track product actions
      if (log.action_type === 'product') {
        summary.productActions++;
      }

      // Track today's actions
      const logDate = new Date(log.created_at);
      if (logDate >= today && logDate <= todayEnd) {
        summary.todayActions++;
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => b.totalActions - a.totalActions);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    
    return logs.filter(log => {
      const matchesSearch = 
        log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesUser = filterUser === 'all' || log.user_email === filterUser;

      return matchesSearch && matchesUser;
    });
  }, [logs, searchTerm, filterUser]);

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'auth': return <Shield className="w-4 h-4" />;
      case 'sale': return <ShoppingCart className="w-4 h-4" />;
      case 'product': return <Package className="w-4 h-4" />;
      case 'customer': return <Users className="w-4 h-4" />;
      case 'supplier': return <Truck className="w-4 h-4" />;
      case 'category': return <FolderOpen className="w-4 h-4" />;
      case 'settings': return <Settings className="w-4 h-4" />;
      case 'user_management': return <UserCog className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getActionBadge = (type: string) => {
    const colors: Record<string, string> = {
      'auth': 'bg-purple-500',
      'sale': 'bg-green-500',
      'product': 'bg-blue-500',
      'customer': 'bg-yellow-500',
      'supplier': 'bg-orange-500',
      'category': 'bg-pink-500',
      'settings': 'bg-red-500',
      'user_management': 'bg-indigo-500',
    };

    return (
      <Badge className={`${colors[type] || 'bg-gray-500'} text-white`}>
        <span className="flex items-center gap-1">
          {getActionIcon(type)}
          {type.replace('_', ' ')}
        </span>
      </Badge>
    );
  };

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
          <p className="text-muted-foreground">শুধুমাত্র এডমিন ও ম্যানেজার অ্যাক্টিভিটি লগ দেখতে পারেন।</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <OfflineBanner message="অফলাইনে স্থানীয়ভাবে সিঙ্ক হওয়া অ্যাক্টিভিটি লগ দেখানো হচ্ছে।" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">📋 অ্যাক্টিভিটি লগ</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          রিফ্রেশ
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            সকল অ্যাক্টিভিটি
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            স্টাফ সামারি
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="অ্যাকশন বা ইউজার খুঁজুন..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="ব্যবহারকারী" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সকল ব্যবহারকারী</SelectItem>
                {uniqueUsers.map(email => (
                  <SelectItem key={email} value={email}>{email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="ধরন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সকল অ্যাকশন</SelectItem>
                <SelectItem value="auth">লগইন/লগআউট</SelectItem>
                <SelectItem value="sale">বিক্রয়</SelectItem>
                <SelectItem value="product">প্রোডাক্ট</SelectItem>
                <SelectItem value="customer">কাস্টমার</SelectItem>
                <SelectItem value="supplier">সাপ্লায়ার</SelectItem>
                <SelectItem value="category">ক্যাটাগরি</SelectItem>
                <SelectItem value="settings">সেটিংস</SelectItem>
                <SelectItem value="user_management">ইউজার ম্যানেজমেন্ট</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="সময়কাল" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">আজ</SelectItem>
                <SelectItem value="7">৭ দিন</SelectItem>
                <SelectItem value="30">৩০ দিন</SelectItem>
                <SelectItem value="90">৯০ দিন</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Logs Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>সময়</TableHead>
                    <TableHead>ব্যবহারকারী</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        কোনো অ্যাক্টিভিটি লগ পাওয়া যায়নি
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(log.created_at), 'dd MMM, HH:mm')}
                          </div>
                          <div className="text-xs text-muted-foreground/70">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: bn })}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-3 h-3 text-primary" />
                            </div>
                            <span className="truncate max-w-[120px]">{log.user_email || 'System'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getActionBadge(log.action_type)}
                        </TableCell>
                        <TableCell className="text-sm text-foreground max-w-xs truncate">
                          {log.action}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Stats */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>মোট: <strong className="text-foreground">{logs?.length || 0}</strong> এন্ট্রি</span>
              <span>দেখাচ্ছে: <strong className="text-foreground">{filteredLogs?.length || 0}</strong></span>
              <span>ব্যবহারকারী: <strong className="text-foreground">{uniqueUsers.length}</strong></span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users">
          {/* User Activity Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {userSummaries.slice(0, 6).map((summary) => (
              <Card key={summary.email} className="p-4 bg-muted/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm truncate max-w-[150px]">
                        {summary.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        আজ: {summary.todayActions} অ্যাকশন
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {summary.totalActions}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <LogIn className="w-3 h-3 text-green-500" />
                      লগইন
                    </span>
                    <span className="font-medium text-foreground">{summary.loginCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="w-3 h-3 text-blue-500" />
                      বিক্রয়
                    </span>
                    <span className="font-medium text-foreground">{summary.salesCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-purple-500" />
                      প্রোডাক্ট
                    </span>
                    <span className="font-medium text-foreground">{summary.productActions}</span>
                  </div>
                  {summary.lastLogin && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-muted-foreground">
                        সর্বশেষ লগইন: {formatDistanceToNow(new Date(summary.lastLogin), { addSuffix: true, locale: bn })}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Detailed User Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ব্যবহারকারী</TableHead>
                  <TableHead className="text-center">মোট অ্যাকশন</TableHead>
                  <TableHead className="text-center">আজকের অ্যাকশন</TableHead>
                  <TableHead className="text-center">লগইন</TableHead>
                  <TableHead className="text-center">বিক্রয়</TableHead>
                  <TableHead className="text-center">প্রোডাক্ট</TableHead>
                  <TableHead>সর্বশেষ অ্যাক্টিভিটি</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      কোনো ব্যবহারকারী অ্যাক্টিভিটি পাওয়া যায়নি
                    </TableCell>
                  </TableRow>
                ) : (
                  userSummaries.map((summary) => (
                    <TableRow key={summary.email}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium text-foreground truncate max-w-[150px]">
                            {summary.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{summary.totalActions}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={summary.todayActions > 0 ? 'bg-green-500' : 'bg-gray-400'}>
                          {summary.todayActions}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {summary.loginCount}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {summary.salesCount}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {summary.productActions}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {summary.lastActivity ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(summary.lastActivity), { addSuffix: true, locale: bn })}
                          </div>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
