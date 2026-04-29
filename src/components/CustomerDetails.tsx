import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LocalDB } from "@/lib/localdb/adapter";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { 
  Users, Wallet, TrendingUp, AlertTriangle, Phone, Mail, MapPin, FileText, 
  ChevronDown, ChevronUp, Search, ArrowUpDown, Filter
} from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { DueCollection } from "./DueCollection";
import { CustomerPDFReport } from "./CustomerPDFReport";

export function CustomerDetails() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesSort, setSalesSort] = useState<"newest" | "oldest" | "amount_high" | "amount_low" | "due_high">("newest");
  const [showDueSection, setShowDueSection] = useState(true);
  const [showPaymentHistory, setShowPaymentHistory] = useState(true);
  const [showSalesHistory, setShowSalesHistory] = useState(true);
  const [showCustomerInfo, setShowCustomerInfo] = useState(true);
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const { headerRef, hidden: headerHidden, headerHeight } = useAutoHideHeader();
  const [salesFilter, setSalesFilter] = useState<"all" | "due" | "paid">("all");
  const queryClient = useQueryClient();
  const { ready } = useLocalDB();

  // Local-first reads — work fully offline, automatically refresh after sync.
  const customers = useLiveQuery(
    async () => {
      const all = await LocalDB.listAll<any>("customers");
      return all.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    },
    [ready]
  );

  const customerSales = useLiveQuery(
    async () => {
      if (!selectedCustomerId) return [];
      const sales = await LocalDB.listWhere<any>(
        "sales",
        (r) => r.customer_id === selectedCustomerId
      );
      sales.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      // Hydrate sale_items + product info from local DB
      const allItems = await LocalDB.listAll<any>("sale_items");
      const products = await LocalDB.listAll<any>("products");
      const productMap = new Map(products.map((p) => [p.id, p]));
      return sales.map((s) => ({
        ...s,
        sale_items: allItems
          .filter((it) => it.sale_id === s.id)
          .map((it) => {
            const p = productMap.get(it.product_id);
            return {
              ...it,
              products: p
                ? {
                    name: p.name,
                    sku: p.sku,
                    imei: p.imei,
                    brand: p.brand,
                    model: p.model,
                    condition: p.condition,
                    cost: p.cost,
                  }
                : null,
            };
          }),
      }));
    },
    [ready, selectedCustomerId]
  );

  const duePayments = useLiveQuery(
    async () => {
      if (!customerSales?.length) return [];
      const saleIds = new Set(customerSales.map((s: any) => s.id));
      const all = await LocalDB.listWhere<any>(
        "due_payments",
        (r) => saleIds.has(r.sale_id)
      );
      return all.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    [ready, customerSales]
  );

  const selectedCustomer = useMemo(() => {
    return customers?.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const summary = useMemo(() => {
    if (!customerSales) return { totalPurchases: 0, totalPaid: 0, totalDue: 0, salesCount: 0, totalProfit: 0 };
    let totalPurchases = 0, totalPaid = 0, totalDue = 0, totalProfit = 0;
    customerSales.forEach(sale => {
      totalPurchases += Number(sale.total_amount);
      totalPaid += Number(sale.paid_amount);
      totalDue += Number(sale.due_amount);
      sale.sale_items?.forEach((item: any) => {
        const cost = Number(item.products?.cost || 0);
        totalProfit += Number(item.total_price) - (cost * item.quantity);
      });
    });
    return { totalPurchases, totalPaid, totalDue, salesCount: customerSales.length, totalProfit };
  }, [customerSales]);

  const dueSales = useMemo(() => {
    return customerSales?.filter(s => Number(s.due_amount) > 0) || [];
  }, [customerSales]);

  // Filtered & sorted sales
  const processedSales = useMemo(() => {
    if (!customerSales) return [];
    let filtered = [...customerSales];

    // Filter
    if (salesFilter === "due") filtered = filtered.filter(s => Number(s.due_amount) > 0);
    else if (salesFilter === "paid") filtered = filtered.filter(s => Number(s.due_amount) <= 0);

    // Search
    if (salesSearch) {
      const term = salesSearch.toLowerCase();
      filtered = filtered.filter(s =>
        s.id.toLowerCase().includes(term) ||
        s.sale_items?.some((item: any) =>
          item.products?.name?.toLowerCase().includes(term) ||
          item.products?.imei?.toLowerCase().includes(term)
        )
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (salesSort) {
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "amount_high": return Number(b.total_amount) - Number(a.total_amount);
        case "amount_low": return Number(a.total_amount) - Number(b.total_amount);
        case "due_high": return Number(b.due_amount) - Number(a.due_amount);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  }, [customerSales, salesSearch, salesSort, salesFilter]);

  const dueMap = useMemo(() => {
    if (!selectedCustomer || !customerSales) return {};
    return {
      [selectedCustomer.id]: {
        totalDue: summary.totalDue,
        totalPurchases: summary.totalPurchases,
        salesCount: summary.salesCount,
        dueSales,
      }
    };
  }, [selectedCustomer, customerSales, summary, dueSales]);

  const SectionToggle = ({ open, onToggle, label, count, icon: Icon, color = "text-foreground" }: any) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 group"
    >
      <h3 className={`text-sm lg:text-base font-bold ${color} flex items-center gap-2`}>
        <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
        {label} {count !== undefined && `(${count.toLocaleString('bn-BD')} টি)`}
      </h3>
      <div className="p-1 rounded-md bg-muted/50 group-hover:bg-muted transition-colors">
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>
    </button>
  );

  return (
    <div className="space-y-3 lg:space-y-5 pb-20 overflow-x-hidden w-full max-w-full">
      {/* Header */}
      <div ref={headerRef} style={{ marginBottom: headerHidden ? `-${headerHeight}px` : 0, transition: 'margin-bottom 300ms ease' }} className={`sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 border-b border-border transition-transform duration-300 ${headerHidden ? '-translate-y-full lg:translate-y-0 lg:!mb-0' : 'translate-y-0'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg lg:text-2xl font-bold text-foreground flex items-center gap-2 truncate">
                <Users className="w-5 h-5 lg:w-6 lg:h-6 text-primary shrink-0" />
                কাস্টমার ডিটেইলস
              </h1>
              <button
                type="button"
                className="lg:hidden h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted shrink-0"
                onClick={() => setShowHeaderInfo(v => !v)}
                aria-label={showHeaderInfo ? "হেডার লুকান" : "হেডার দেখান"}
              >
                {showHeaderInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-[11px] lg:text-sm text-muted-foreground mt-0.5 ${showHeaderInfo ? "block" : "hidden lg:block"}`}>কাস্টমার নির্বাচন করে সম্পূর্ণ লেনদেন ও বাকি হিসাব দেখুন</p>
          </div>
          {selectedCustomer && (
            <div className={showHeaderInfo ? "block" : "hidden lg:block"}>
              <CustomerPDFReport customer={selectedCustomer} dueMap={dueMap} allSales={customerSales || []} />
            </div>
          )}
        </div>

        <div className="mt-3">
          <Select value={selectedCustomerId} onValueChange={(val) => {
            setSelectedCustomerId(val);
            queryClient.invalidateQueries({ queryKey: ["customer-sales", val] });
          }}>
            <SelectTrigger className="h-10 lg:h-11 text-sm lg:text-base">
              <SelectValue placeholder="🔍 কাস্টমার নির্বাচন করুন..." />
            </SelectTrigger>
            <SelectContent>
              {customers?.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{customer.name}</span>
                    {customer.phone && <span className="text-muted-foreground text-xs">({customer.phone})</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state */}
      {!selectedCustomerId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-14 h-14 text-muted-foreground/30 mb-3" />
          <h3 className="text-base font-semibold text-muted-foreground">কাস্টমার নির্বাচন করুন</h3>
          <p className="text-xs text-muted-foreground/70 mt-1">উপরের ড্রপডাউন থেকে একজন কাস্টমার নির্বাচন করুন</p>
        </div>
      )}

      {selectedCustomer && (
        <>
          {/* Customer Info - Collapsible */}
          <div>
            <SectionToggle open={showCustomerInfo} onToggle={() => setShowCustomerInfo(!showCustomerInfo)} label="কাস্টমার তথ্য" icon={Users} color="text-primary" />
            {showCustomerInfo && (
              <Card className="border-primary/20 mt-1">
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
                      {selectedCustomer.name.charAt(0)}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <h2 className="text-base lg:text-lg font-bold text-foreground">{selectedCustomer.name}</h2>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs lg:text-sm text-muted-foreground">
                        {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedCustomer.phone}</span>}
                        {selectedCustomer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selectedCustomer.email}</span>}
                        {selectedCustomer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedCustomer.address}</span>}
                      </div>
                      {selectedCustomer.notes && (
                        <p className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded-lg">{selectedCustomer.notes}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3">
            {[
              { icon: TrendingUp, label: "মোট লেনদেন", value: `৳${summary.totalPurchases.toLocaleString('bn-BD')}`, sub: `${summary.salesCount.toLocaleString('bn-BD')} টি বিক্রয়`, color: "text-primary", iconColor: "text-primary" },
              { icon: Wallet, label: "মোট পরিশোধ", value: `৳${summary.totalPaid.toLocaleString('bn-BD')}`, color: "text-green-600", iconColor: "text-green-500" },
              { icon: AlertTriangle, label: "মোট বাকি", value: `৳${summary.totalDue.toLocaleString('bn-BD')}`, color: summary.totalDue > 0 ? "text-destructive" : "text-green-600", iconColor: "text-destructive", border: summary.totalDue > 0 ? "border-destructive/30" : "" },
              { icon: TrendingUp, label: "মোট লাভ", value: `৳${summary.totalProfit.toLocaleString('bn-BD')}`, color: "text-accent", iconColor: "text-accent" },
              { icon: FileText, label: "বাকি বিক্রয়", value: `${dueSales.length.toLocaleString('bn-BD')} টি`, color: "text-foreground", iconColor: "text-blue-500" },
            ].map((card, i) => (
              <Card key={i} className={card.border || ""}>
                <CardContent className="pt-3 pb-2 px-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <card.icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
                    <span className="text-[10px] lg:text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <p className={`text-base lg:text-lg font-bold ${card.color}`}>{card.value}</p>
                  {card.sub && <p className="text-[10px] text-muted-foreground">{card.sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Due Sales - Collapsible */}
          {dueSales.length > 0 && (
            <div>
              <SectionToggle open={showDueSection} onToggle={() => setShowDueSection(!showDueSection)} label="বাকি বিক্রয় ও আদায়" count={dueSales.length} icon={AlertTriangle} color="text-destructive" />
              {showDueSection && (
                <div className="space-y-2 mt-1">
                  {dueSales.map(sale => (
                    <Card key={sale.id} className="border-destructive/20">
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                          <div>
                            <p className="text-xs lg:text-sm font-semibold text-foreground">বিক্রয় #{sale.id.slice(0, 8)}</p>
                            <p className="text-[10px] lg:text-xs text-muted-foreground">
                              {format(new Date(sale.created_at), 'dd MMMM yyyy, hh:mm a', { locale: bn })}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">মোট: ৳{Number(sale.total_amount).toLocaleString('bn-BD')}</Badge>
                            <Badge variant="secondary" className="text-[10px]">পরিশোধ: ৳{Number(sale.paid_amount).toLocaleString('bn-BD')}</Badge>
                            <Badge variant="destructive" className="text-[10px]">বাকি: ৳{Number(sale.due_amount).toLocaleString('bn-BD')}</Badge>
                          </div>
                        </div>
                        {sale.sale_items?.length > 0 && (
                          <div className="bg-muted/30 rounded-lg p-2">
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">পণ্যসমূহ:</p>
                            {sale.sale_items.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-[11px] py-0.5">
                                <span className="text-foreground">
                                  {item.products?.name || 'পণ্য'}
                                  {item.products?.imei && <span className="text-muted-foreground ml-1">(IMEI: {item.products.imei})</span>}
                                  <span className="text-muted-foreground"> x{item.quantity}</span>
                                </span>
                                <span className="font-medium">৳{Number(item.total_price).toLocaleString('bn-BD')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <Separator />
                        <DueCollection saleId={sale.id} currentDue={Number(sale.due_amount)} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Payment History - Collapsible */}
          {duePayments && duePayments.length > 0 && (
            <div>
              <SectionToggle open={showPaymentHistory} onToggle={() => setShowPaymentHistory(!showPaymentHistory)} label="বাকি আদায়ের ইতিহাস" count={duePayments.length} icon={Wallet} color="text-primary" />
              {showPaymentHistory && (
                <Card className="mt-1">
                  <CardContent className="pt-3">
                    <div className="space-y-1.5">
                      {duePayments.map(payment => {
                        const relatedSale = customerSales?.find(s => s.id === payment.sale_id);
                        return (
                          <div key={payment.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 border-b border-border last:border-0 gap-1">
                            <div>
                              <p className="text-xs lg:text-sm font-medium text-foreground">
                                ৳{Number(payment.amount).toLocaleString('bn-BD')}
                                <span className="text-[10px] lg:text-xs text-muted-foreground ml-1.5">
                                  ({payment.payment_method === 'cash' ? 'নগদ' : payment.payment_method === 'card' ? 'কার্ড' : 'মোবাইল'})
                                </span>
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                বিক্রয় #{payment.sale_id.slice(0, 8)}
                                {relatedSale && ` • মোট: ৳${Number(relatedSale.total_amount).toLocaleString('bn-BD')}`}
                              </p>
                              {payment.notes && <p className="text-[10px] text-muted-foreground/70 italic">{payment.notes}</p>}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(payment.created_at), 'dd MMM yyyy, hh:mm a', { locale: bn })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* All Sales History - Collapsible with search/sort/filter */}
          <div>
            <SectionToggle open={showSalesHistory} onToggle={() => setShowSalesHistory(!showSalesHistory)} label="সম্পূর্ণ বিক্রয় ইতিহাস" count={customerSales?.length || 0} icon={TrendingUp} color="text-foreground" />
            {showSalesHistory && (
              <div className="space-y-2 mt-1">
                {/* Search/Sort/Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="বিক্রয় ID, পণ্য, IMEI দিয়ে খুঁজুন..."
                      value={salesSearch}
                      onChange={e => setSalesSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Select value={salesFilter} onValueChange={(v: any) => setSalesFilter(v)}>
                      <SelectTrigger className="h-8 w-24 text-[11px]">
                        <Filter className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">সকল</SelectItem>
                        <SelectItem value="due">বাকি</SelectItem>
                        <SelectItem value="paid">পরিশোধিত</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={salesSort} onValueChange={(v: any) => setSalesSort(v)}>
                      <SelectTrigger className="h-8 w-28 text-[11px]">
                        <ArrowUpDown className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">নতুন আগে</SelectItem>
                        <SelectItem value="oldest">পুরানো আগে</SelectItem>
                        <SelectItem value="amount_high">বেশি টাকা</SelectItem>
                        <SelectItem value="amount_low">কম টাকা</SelectItem>
                        <SelectItem value="due_high">বেশি বাকি</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Results count */}
                {(salesSearch || salesFilter !== "all") && (
                  <p className="text-[10px] text-muted-foreground">
                    {processedSales.length.toLocaleString('bn-BD')} টি ফলাফল পাওয়া গেছে
                    {salesSearch && <Button variant="link" size="sm" className="text-[10px] h-auto p-0 ml-2" onClick={() => { setSalesSearch(""); setSalesFilter("all"); }}>ফিল্টার মুছুন</Button>}
                  </p>
                )}

                {processedSales.length > 0 ? (
                  <div className="space-y-1.5">
                    {processedSales.map(sale => (
                      <Card key={sale.id} className={Number(sale.due_amount) > 0 ? "border-destructive/10" : ""}>
                        <CardContent className="py-2.5 px-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                #{sale.id.slice(0, 8)}
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  {format(new Date(sale.created_at), 'dd MMM yyyy, hh:mm a', { locale: bn })}
                                </span>
                              </p>
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {sale.sale_items?.map((item: any, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] py-0 h-4">
                                    {item.products?.name || 'পণ্য'} x{item.quantity}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-primary">৳{Number(sale.total_amount).toLocaleString('bn-BD')}</span>
                              {Number(sale.due_amount) > 0 ? (
                                <Badge variant="destructive" className="text-[9px]">বাকি: ৳{Number(sale.due_amount).toLocaleString('bn-BD')}</Badge>
                              ) : (
                                <Badge className="text-[9px] bg-green-500/10 text-green-600 border-green-500/20">পরিশোধিত</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">কোনো বিক্রয় পাওয়া যায়নি</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
