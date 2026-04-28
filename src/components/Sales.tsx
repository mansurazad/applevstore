import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Search, Calendar, User, CreditCard, Package, Filter, X, FileDown, FileSpreadsheet, ImageIcon, ChevronUp, ChevronDown } from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { getOptimizedUrl, isCloudinaryUrl } from "@/lib/cloudinary";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";
import { DueCollection } from "./DueCollection";
import { db as localDb } from "@/lib/db";
import { useLiveQuery } from "@/hooks/useLiveQuery";

interface SaleDetail {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
  customer_id: string | null;
  instant_customer_name: string | null;
  instant_customer_phone: string | null;
  paid_amount: number;
  due_amount: number;
  image_url: string | null;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  sale_items: Array<{
    quantity: number;
    unit_price: number;
    total_price: number;
    condition: string;
    products: {
      name: string;
      sku: string | null;
      imei: string | null;
      brand: string | null;
      model: string | null;
      image_url: string | null;
    };
  }>;
}

export function Sales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);
  const { containerRef, headerRef, hidden: headerHidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const itemsPerPage = 10;
  const printRef = useRef<HTMLDivElement>(null);

  // Offline-first reads from local DB (auto-synced in background).
  const rawSales = useLiveQuery(() => localDb.sales.list(), []);
  const rawSaleItems = useLiveQuery(() => localDb.saleItems.list(), []);
  const rawCustomers = useLiveQuery(() => localDb.customers.list(), []);
  const rawProducts = useLiveQuery(() => localDb.products.list(), []);

  const isLoading =
    rawSales === undefined ||
    rawSaleItems === undefined ||
    rawCustomers === undefined ||
    rawProducts === undefined;

  const customers = useMemo(() => {
    return [...(rawCustomers ?? [])].sort((a: any, b: any) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
  }, [rawCustomers]);

  const sales: SaleDetail[] = useMemo(() => {
    if (isLoading) return [];
    const customerMap = new Map((rawCustomers ?? []).map((c: any) => [c.id, c]));
    const productMap = new Map((rawProducts ?? []).map((p: any) => [p.id, p]));
    const itemsBySale = new Map<string, any[]>();
    for (const it of rawSaleItems ?? []) {
      const arr = itemsBySale.get((it as any).sale_id) ?? [];
      arr.push(it);
      itemsBySale.set((it as any).sale_id, arr);
    }
    return [...(rawSales ?? [])]
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .map((s: any) => {
        const cust = s.customer_id ? customerMap.get(s.customer_id) : null;
        const items = (itemsBySale.get(s.id) ?? []).map((it: any) => {
          const p: any = productMap.get(it.product_id) ?? {};
          return {
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
            condition: it.condition ?? p.condition ?? "new",
            products: {
              name: p.name ?? "N/A",
              sku: p.sku ?? null,
              imei: p.imei ?? null,
              brand: p.brand ?? null,
              model: p.model ?? null,
              image_url: p.image_url ?? null,
            },
          };
        });
        return {
          ...s,
          customers: cust
            ? { name: (cust as any).name, phone: (cust as any).phone ?? null, email: (cust as any).email ?? null }
            : null,
          sale_items: items,
        } as SaleDetail;
      });
  }, [isLoading, rawSales, rawSaleItems, rawCustomers, rawProducts]);

  // Filter and search logic
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        sale.id.toLowerCase().includes(searchLower) ||
        sale.customers?.name.toLowerCase().includes(searchLower) ||
        (sale.sale_items || []).some(
          (item) =>
            item?.products?.name?.toLowerCase().includes(searchLower) ||
            item?.products?.imei?.toLowerCase().includes(searchLower) ||
            item?.products?.brand?.toLowerCase().includes(searchLower)
        );

      // Payment method filter
      const matchesPaymentMethod =
        filterPaymentMethod === "all" || sale.payment_method === filterPaymentMethod;

      // Customer filter
      const matchesCustomer =
        filterCustomer === "all" || sale.customer_id === filterCustomer;

      // Date filters
      const saleDate = new Date(sale.created_at);
      const matchesDateFrom =
        !filterDateFrom || saleDate >= new Date(filterDateFrom);
      const matchesDateTo =
        !filterDateTo || saleDate <= new Date(filterDateTo + "T23:59:59");

      return (
        matchesSearch &&
        matchesPaymentMethod &&
        matchesCustomer &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [sales, searchTerm, filterPaymentMethod, filterCustomer, filterDateFrom, filterDateTo]);

  // Pagination
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Stats
  const totalSales = filteredSales.length;
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPaymentMethod("all");
    setFilterCustomer("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm ||
    filterPaymentMethod !== "all" ||
    filterCustomer !== "all" ||
    filterDateFrom ||
    filterDateTo;

  // PDF Export
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Sales_Report_${format(new Date(), "yyyy-MM-dd")}`,
  });

  // Excel Export
  const handleExportExcel = () => {
    const exportData = filteredSales.map((sale) => {
      const items = (sale.sale_items || []).map((item) => ({
        "Sale ID": sale.id.slice(0, 8),
        "Date": format(new Date(sale.created_at), "dd MMM yyyy"),
        "Time": format(new Date(sale.created_at), "hh:mm a"),
        "Customer": sale.customers?.name || "Walk-in",
        "Product": item?.products?.name || "N/A",
        "Brand": item?.products?.brand || "N/A",
        "Model": item?.products?.model || "N/A",
        "IMEI": item?.products?.imei || "N/A",
        "Condition": item?.condition || "N/A",
        "Quantity": item?.quantity || 0,
        "Unit Price": item?.unit_price || 0,
        "Total Price": item?.total_price || 0,
        "Payment Method": sale.payment_method,
        "Sale Total": sale.total_amount,
      }));
      return items;
    }).flat();

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");

    // Auto-size columns
    const maxWidth = 20;
    const columns = Object.keys(exportData[0] || {});
    worksheet["!cols"] = columns.map(() => ({ wch: maxWidth }));

    XLSX.writeFile(workbook, `Sales_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading sales data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in overflow-x-hidden w-full max-w-full">
      {/* Fixed Header */}
      <div ref={headerRef} style={{ marginBottom: headerHidden ? `-${headerHeight}px` : 0, transition: 'margin-bottom 300ms ease' }} className={`sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4 space-y-4 transition-transform duration-300 ${headerHidden ? '-translate-y-full lg:translate-y-0 lg:!mb-0' : 'translate-y-0'}`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">বিক্রয় ইতিহাস</h1>
              <button
                type="button"
                className="lg:hidden h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted shrink-0"
                onClick={() => setShowHeaderInfo(v => !v)}
                aria-label={showHeaderInfo ? "হেডার লুকান" : "হেডার দেখান"}
              >
                {showHeaderInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-sm md:text-base text-muted-foreground mt-1 ${showHeaderInfo ? "block" : "hidden lg:block"}`}>সকল বিক্রয় লেনদেন দেখুন ও পরিচালনা করুন</p>
          </div>
        <div className={`flex-wrap gap-2 ${showHeaderInfo ? "flex" : "hidden lg:flex"}`}>
          <Button
            onClick={handlePrint}
            variant="outline"
            className="gap-2 text-sm md:text-base"
            disabled={filteredSales.length === 0}
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="gap-2 text-sm md:text-base"
            disabled={filteredSales.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <Card className="card-hover">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">মোট বিক্রয়</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-primary">{totalSales}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">মোট আয়</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-accent">৳{totalRevenue.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">গড় বিক্রয়</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-secondary">৳{averageSale.toFixed(0)}</CardTitle>
          </CardHeader>
        </Card>
        </div>

        {/* Filters */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-left"
            >
              <Filter className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              <CardTitle className="text-base md:text-lg">ফিল্টার ও সার্চ</CardTitle>
              <span className="text-sm text-muted-foreground ml-2">
                {showFilters ? "▼" : "▶"}
              </span>
            </button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-destructive hover:text-destructive text-sm self-start sm:self-auto"
              >
                <X className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Clear Filters</span>
                <span className="sm:hidden">Clear</span>
              </Button>
            )}
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="আইডি, কাস্টমার, পণ্য দিয়ে সার্চ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm md:text-base"
                />
              </div>
            </div>

            {/* Date From */}
            <div>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Date To */}
            <div>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Customer Filter */}
            <div>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল কাস্টমার</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method Filter */}
            <div>
              <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Payment Methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল পদ্ধতি</SelectItem>
                  <SelectItem value="cash">নগদ</SelectItem>
                  <SelectItem value="card">কার্ড</SelectItem>
                  <SelectItem value="mobile">মোবাইল ব্যাংকিং</SelectItem>
                  <SelectItem value="other">অন্যান্য</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        )}
        </Card>
      </div>

      {/* Scrollable Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto pb-6 space-y-4 md:space-y-6">
        {/* Sales List */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            বিক্রয় তালিকা ({filteredSales.length} টি)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {paginatedSales.length === 0 ? (
            <div className="text-center py-8 md:py-12 text-muted-foreground">
              <Package className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 md:mb-4 opacity-50" />
              <p className="text-sm md:text-base">কোনো বিক্রয় পাওয়া যায়নি</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2 text-sm md:text-base">
                  সকল বিক্রয় দেখতে ফিল্টার মুছুন
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 md:space-y-3">
              {paginatedSales.map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="border border-border rounded-lg p-3 md:p-4 hover:border-primary hover:bg-accent/5 cursor-pointer transition-all card-hover"
                >
                  <div className="flex gap-3">
                    {/* Sale Image Thumbnail */}
                    {sale.image_url && (
                      <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border border-border bg-muted">
                        <img
                          src={getOptimizedUrl(sale.image_url, { width: 100, height: 100 })}
                          alt="বিক্রয়ের ছবি"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {/* Product thumbnail if no sale image */}
                    {!sale.image_url && (sale.sale_items || [])[0]?.products?.image_url && (
                      <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border border-border bg-muted">
                        <img
                          src={getOptimizedUrl((sale.sale_items || [])[0].products.image_url!, { width: 100, height: 100 })}
                          alt="পণ্যের ছবি"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <span className="font-mono text-xs md:text-sm font-semibold text-primary">
                          #{sale.id.slice(0, 8)}
                        </span>
                        <Badge variant={sale.status === "completed" ? "default" : "secondary"} className="text-xs">
                          {sale.status === "completed" ? "সম্পন্ন" : sale.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-xs">
                          {sale.payment_method === "cash" ? "নগদ" : sale.payment_method === "card" ? "কার্ড" : sale.payment_method === "mobile" ? "মোবাইল" : sale.payment_method}
                        </Badge>
                        {sale.image_url && (
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                          <span className="hidden sm:inline">{format(new Date(sale.created_at), "dd MMM yyyy, hh:mm a")}</span>
                          <span className="sm:hidden">{format(new Date(sale.created_at), "dd MMM yyyy")}</span>
                        </div>
                        {(sale.customers || sale.instant_customer_name) && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 md:h-3.5 md:w-3.5" />
                            {sale.customers?.name || sale.instant_customer_name}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3 md:h-3.5 md:w-3.5" />
                          {(sale.sale_items || []).length} টি পণ্য
                        </div>
                      </div>

                      {/* Product names preview */}
                      <div className="text-xs text-muted-foreground truncate">
                        {(sale.sale_items || []).map(i => i.products?.name).filter(Boolean).join(", ")}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-lg md:text-xl font-bold text-accent">
                        ৳{Number(sale.total_amount).toLocaleString()}
                      </div>
                      {Number(sale.due_amount) > 0 && (
                        <div className="text-xs font-semibold text-destructive">
                          বাকি: ৳{Number(sale.due_amount).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 md:mt-6 pt-4 md:pt-6 border-t">
              <div className="text-xs md:text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-xs md:text-sm"
                >
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-xs md:text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-2xl">বিক্রয়ের বিবরণ</DialogTitle>
            <DialogDescription className="text-sm">
              এই লেনদেনের সম্পূর্ণ তথ্য
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4 md:space-y-6">
              {/* Sale Image */}
              {selectedSale.image_url && (
                <Card>
                  <CardHeader className="p-3 md:p-6 pb-2">
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 md:h-5 md:w-5" />
                      বিক্রয়ের ছবি
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    <div className="w-full max-w-xs rounded-lg overflow-hidden border border-border">
                      <img
                        src={getOptimizedUrl(selectedSale.image_url, { width: 400 })}
                        alt="বিক্রয়ের ছবি"
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">সেল আইডি</CardDescription>
                    <CardTitle className="text-sm md:text-base font-mono break-all">#{selectedSale.id.slice(0, 8)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">তারিখ ও সময়</CardDescription>
                    <CardTitle className="text-sm md:text-base">
                      {format(new Date(selectedSale.created_at), "dd MMM yyyy, hh:mm a")}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">পেমেন্ট পদ্ধতি</CardDescription>
                    <CardTitle className="text-sm md:text-base capitalize">
                      {selectedSale.payment_method === "cash" ? "নগদ" : selectedSale.payment_method === "card" ? "কার্ড" : selectedSale.payment_method === "mobile" ? "মোবাইল" : selectedSale.payment_method}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">স্ট্যাটাস</CardDescription>
                    <CardTitle className="text-sm md:text-base">
                      <Badge variant={selectedSale.status === "completed" ? "default" : "secondary"} className="text-xs">
                        {selectedSale.status === "completed" ? "সম্পন্ন" : selectedSale.status}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Customer Info */}
              {(selectedSale.customers || selectedSale.instant_customer_name) && (
                <Card>
                  <CardHeader className="p-3 md:p-6">
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                      <User className="h-4 w-4 md:h-5 md:w-5" />
                      ক্রেতার তথ্য
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3 md:p-6 pt-0">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-xs md:text-sm text-muted-foreground">নাম:</span>
                      <span className="text-sm md:text-base font-semibold">
                        {selectedSale.customers?.name || selectedSale.instant_customer_name}
                      </span>
                    </div>
                    {(selectedSale.customers?.phone || selectedSale.instant_customer_phone) && (
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-xs md:text-sm text-muted-foreground">ফোন:</span>
                        <span className="text-sm md:text-base">
                          {selectedSale.customers?.phone || selectedSale.instant_customer_phone}
                        </span>
                      </div>
                    )}
                    {selectedSale.customers?.email && (
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                        <span className="text-xs md:text-sm text-muted-foreground">ইমেইল:</span>
                        <span className="text-sm md:text-base">{selectedSale.customers.email}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Package className="h-4 w-4 md:h-5 md:w-5" />
                    বিক্রিত পণ্য
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6 pt-0">
                  <div className="space-y-3 md:space-y-4">
                    {(selectedSale.sale_items || []).map((item, index) => (
                      <div key={index}>
                        <div className="flex gap-3">
                          {/* Product Image */}
                          {item.products.image_url && (
                            <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden border border-border bg-muted">
                              <img
                                src={getOptimizedUrl(item.products.image_url, { width: 120, height: 120 })}
                                alt={item.products.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                            <div className="flex-1 space-y-1">
                              <div className="text-sm md:text-base font-semibold">{item.products.name}</div>
                              <div className="text-xs md:text-sm text-muted-foreground space-y-0.5">
                                {item.products.brand && <div>ব্র্যান্ড: {item.products.brand}</div>}
                                {item.products.model && <div>মডেল: {item.products.model}</div>}
                                {item.products.imei && <div className="break-all">IMEI: {item.products.imei}</div>}
                                {item.products.sku && <div className="break-all">SKU: {item.products.sku}</div>}
                                <div>অবস্থা: <Badge variant="outline" className="capitalize text-xs">{item.condition === "new" ? "নতুন" : item.condition === "used" ? "ব্যবহৃত" : item.condition}</Badge></div>
                              </div>
                            </div>
                            <div className="text-right space-y-1 border-t sm:border-0 pt-2 sm:pt-0">
                              <div className="text-xs md:text-sm text-muted-foreground">
                                {item.quantity} × ৳{Number(item.unit_price).toLocaleString()}
                              </div>
                              <div className="text-sm md:text-base font-semibold text-accent">
                                ৳{Number(item.total_price).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                        {index < (selectedSale.sale_items || []).length - 1 && (
                          <Separator className="mt-3 md:mt-4" />
                        )}
                      </div>
                    ))}
                  </div>

                  <Separator className="my-3 md:my-4" />

                  {/* Total */}
                  <div className="flex justify-between items-center">
                    <span className="text-base md:text-lg font-semibold">মোট:</span>
                    <span className="text-xl md:text-2xl font-bold text-accent">
                      ৳{Number(selectedSale.total_amount).toLocaleString()}
                    </span>
                  </div>
                  {Number(selectedSale.paid_amount) > 0 && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm text-muted-foreground">প্রদত্ত:</span>
                      <span className="text-sm">৳{Number(selectedSale.paid_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {Number(selectedSale.due_amount) > 0 && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-semibold text-destructive">বাকি:</span>
                      <span className="text-sm font-bold text-destructive">৳{Number(selectedSale.due_amount).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Due Collection */}
              {Number(selectedSale.due_amount) > 0 && (
                <DueCollection
                  saleId={selectedSale.id}
                  currentDue={Number(selectedSale.due_amount)}
                />
              )}

              {/* Notes */}
              {selectedSale.notes && (
                <Card>
                  <CardHeader className="p-3 md:p-6">
                    <CardTitle className="text-base md:text-lg">নোট</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    <p className="text-xs md:text-sm text-muted-foreground">{selectedSale.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Print Component */}
      <div className="hidden">
        <div ref={printRef} className="p-8 bg-white text-black">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Sales Report</h1>
            <p className="text-gray-600">Generated on {format(new Date(), "dd MMMM yyyy, hh:mm a")}</p>
            {hasActiveFilters && (
              <div className="mt-4 text-sm text-gray-600">
                <p className="font-semibold">Applied Filters:</p>
                {searchTerm && <p>Search: {searchTerm}</p>}
                {filterPaymentMethod !== "all" && <p>Payment Method: {filterPaymentMethod}</p>}
                {filterCustomer !== "all" && <p>Customer: {customers.find(c => c.id === filterCustomer)?.name}</p>}
                {filterDateFrom && <p>From: {format(new Date(filterDateFrom), "dd MMM yyyy")}</p>}
                {filterDateTo && <p>To: {format(new Date(filterDateTo), "dd MMM yyyy")}</p>}
              </div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8 pb-4 border-b-2 border-gray-300">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Sales</p>
              <p className="text-2xl font-bold">{totalSales}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold">৳{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">Average Sale</p>
              <p className="text-2xl font-bold">৳{averageSale.toFixed(0)}</p>
            </div>
          </div>

          {/* Sales Table */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 text-sm font-semibold">Date</th>
                <th className="text-left p-2 text-sm font-semibold">Sale ID</th>
                <th className="text-left p-2 text-sm font-semibold">Customer</th>
                <th className="text-left p-2 text-sm font-semibold">Products</th>
                <th className="text-left p-2 text-sm font-semibold">Payment</th>
                <th className="text-right p-2 text-sm font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-200">
                  <td className="p-2 text-xs">{format(new Date(sale.created_at), "dd MMM yyyy")}</td>
                  <td className="p-2 text-xs font-mono">#{sale.id.slice(0, 8)}</td>
                  <td className="p-2 text-xs">{sale.customers?.name || "Walk-in"}</td>
                  <td className="p-2 text-xs">
                    {(sale.sale_items || []).map((item, idx) => (
                      <div key={idx}>
                        {item?.products?.name} ({item?.quantity}x)
                        {item?.products?.imei && <span className="text-gray-500"> - {item.products.imei}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="p-2 text-xs capitalize">{sale.payment_method}</td>
                  <td className="p-2 text-xs text-right font-semibold">৳{Number(sale.total_amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 pt-4 border-t-2 border-gray-300 text-right">
            <p className="text-lg font-bold">Total: ৳{totalRevenue.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
