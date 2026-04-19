import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { Search, Users, Wallet, AlertTriangle, Eye, Pencil, Trash2, Plus, ChevronDown, ChevronUp, ArrowUpDown, Filter } from "lucide-react";
import { DueCollection } from "./DueCollection";
import { CustomerPDFReport } from "./CustomerPDFReport";
import { CloudinaryUpload } from "./CloudinaryUpload";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { AutoHideSticky } from "@/components/AutoHideSticky";

export function Customers() {
  const { containerRef, headerRef, hidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDue, setFilterDue] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "due_high" | "purchases" | "newest">("name");
  const [showFilters, setShowFilters] = useState(true);
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", address: "", notes: "", image_url: "",
  });

  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all sales with dues for customers
  const { data: customerDues } = useQuery({
    queryKey: ["customer-dues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_id, total_amount, paid_amount, due_amount, created_at, instant_customer_name, instant_customer_phone, payment_method")
        .gt("due_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all sales for customer purchase history
  const { data: allSales } = useQuery({
    queryKey: ["customer-all-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_id, total_amount, paid_amount, due_amount, created_at, payment_method, status")
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("customers").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার যোগ হয়েছে!");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message || "কাস্টমার যোগ করতে ব্যর্থ"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("customers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার আপডেট হয়েছে!");
      setEditingCustomer(null);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message || "আপডেট করতে ব্যর্থ"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার মুছে ফেলা হয়েছে!");
    },
    onError: (error: any) => toast.error(error.message || "মুছতে ব্যর্থ"),
  });

  const resetForm = () => setFormData({ name: "", email: "", phone: "", address: "", notes: "", image_url: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const startEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "", email: customer.email || "",
      phone: customer.phone || "", address: customer.address || "", notes: customer.notes || "",
      image_url: customer.image_url || "",
    });
  };

  // Calculate per-customer due totals
  const customerDueMap = useMemo(() => {
    const map: Record<string, { totalDue: number; totalPurchases: number; salesCount: number; dueSales: any[] }> = {};
    allSales?.forEach(sale => {
      if (!sale.customer_id) return;
      if (!map[sale.customer_id]) map[sale.customer_id] = { totalDue: 0, totalPurchases: 0, salesCount: 0, dueSales: [] };
      map[sale.customer_id].totalPurchases += Number(sale.total_amount);
      map[sale.customer_id].salesCount += 1;
    });
    customerDues?.forEach(sale => {
      if (!sale.customer_id) return;
      if (!map[sale.customer_id]) map[sale.customer_id] = { totalDue: 0, totalPurchases: 0, salesCount: 0, dueSales: [] };
      map[sale.customer_id].totalDue += Number(sale.due_amount);
      map[sale.customer_id].dueSales.push(sale);
    });
    return map;
  }, [customerDues, allSales]);

  const totalDueAll = Object.values(customerDueMap).reduce((s, c) => s + c.totalDue, 0);
  const customersWithDue = Object.keys(customerDueMap).filter(id => customerDueMap[id].totalDue > 0).length;

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    let filtered = customers;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
      );
    }
    if (filterDue === "due") {
      filtered = filtered.filter(c => customerDueMap[c.id]?.totalDue > 0);
    } else if (filterDue === "clear") {
      filtered = filtered.filter(c => !customerDueMap[c.id]?.totalDue);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "due_high": return (customerDueMap[b.id]?.totalDue || 0) - (customerDueMap[a.id]?.totalDue || 0);
        case "purchases": return (customerDueMap[b.id]?.totalPurchases || 0) - (customerDueMap[a.id]?.totalPurchases || 0);
        case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [customers, searchTerm, filterDue, customerDueMap, sortBy]);

  return (
    <div ref={containerRef} className="flex flex-col h-screen overflow-y-auto animate-fade-in">
      <AutoHideSticky hidden={hidden} headerHeight={headerHeight} headerRef={headerRef} className="px-1 pb-3 pt-1 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">👥 কাস্টমার ম্যানেজমেন্ট</h1>
            <p className="text-sm text-muted-foreground">কাস্টমার তথ্য ও বাকি হিসাব</p>
          </div>
          <Dialog open={isAddDialogOpen || !!editingCustomer} onOpenChange={(open) => {
            if (!open) { setIsAddDialogOpen(false); setEditingCustomer(null); resetForm(); }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsAddDialogOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1" /> কাস্টমার যোগ
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "কাস্টমার সম্পাদনা" : "নতুন কাস্টমার"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">নাম *</label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ইমেইল</label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ফোন</label>
                  <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ঠিকানা</label>
                  <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">নোটস</label>
                  <Input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                </div>
                <CloudinaryUpload
                  currentImageUrl={formData.image_url}
                  onUpload={(url) => setFormData({ ...formData, image_url: url })}
                  folder="apple-store/customers"
                  label="📸 কাস্টমারের ছবি"
                />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingCustomer(null); resetForm(); }}>
                    বাতিল
                  </Button>
                  <Button type="submit">{editingCustomer ? "আপডেট" : "যোগ"} করুন</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 text-center">
              <Users className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">মোট কাস্টমার</p>
              <p className="text-lg font-bold text-primary">{customers?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-3 text-center">
              <AlertTriangle className="w-5 h-5 mx-auto text-destructive mb-1" />
              <p className="text-xs text-muted-foreground">বাকিদার</p>
              <p className="text-lg font-bold text-destructive">{customersWithDue}</p>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-3 text-center">
              <Wallet className="w-5 h-5 mx-auto text-accent mb-1" />
              <p className="text-xs text-muted-foreground">মোট বাকি</p>
              <p className="text-lg font-bold text-accent">৳{totalDueAll.toLocaleString('bn-BD')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search, Filter & Sort - Collapsible */}
        <div>
          <button onClick={() => setShowFilters(!showFilters)} className="w-full flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="w-4 h-4 text-primary" />
              ফিল্টার ও সার্চ
            </span>
            <div className="p-1 rounded-md bg-muted/50 hover:bg-muted transition-colors">
              {showFilters ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="নাম, ফোন, ইমেইল খুঁজুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
              </div>
              <select value={filterDue} onChange={e => setFilterDue(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="all">সকল</option>
                <option value="due">বাকিদার</option>
                <option value="clear">বাকি নেই</option>
              </select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">নাম (A-Z)</SelectItem>
                  <SelectItem value="due_high">বেশি বাকি</SelectItem>
                  <SelectItem value="purchases">বেশি ক্রয়</SelectItem>
                  <SelectItem value="newest">সর্বশেষ যুক্ত</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </AutoHideSticky>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => { if (!open) setSelectedCustomer(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>👤 {selectedCustomer?.name}</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {selectedCustomer.phone && <p>📞 {selectedCustomer.phone}</p>}
                {selectedCustomer.email && <p>📧 {selectedCustomer.email}</p>}
                {selectedCustomer.address && <p className="col-span-2">📍 {selectedCustomer.address}</p>}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-primary/5 text-center">
                  <p className="text-[10px] text-muted-foreground">মোট ক্রয়</p>
                  <p className="text-sm font-bold text-primary">{customerDueMap[selectedCustomer.id]?.salesCount || 0} বার</p>
                </div>
                <div className="p-2 rounded-lg bg-accent/5 text-center">
                  <p className="text-[10px] text-muted-foreground">মোট পরিমাণ</p>
                  <p className="text-sm font-bold text-accent">৳{(customerDueMap[selectedCustomer.id]?.totalPurchases || 0).toLocaleString('bn-BD')}</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/5 text-center">
                  <p className="text-[10px] text-muted-foreground">বাকি</p>
                  <p className="text-sm font-bold text-destructive">৳{(customerDueMap[selectedCustomer.id]?.totalDue || 0).toLocaleString('bn-BD')}</p>
                </div>
              </div>

              {/* Due Sales with Collection */}
              {customerDueMap[selectedCustomer.id]?.dueSales?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-destructive">📋 বাকি থাকা বিক্রয়সমূহ:</h4>
                  {customerDueMap[selectedCustomer.id].dueSales.map((sale: any) => (
                    <Card key={sale.id} className="border-destructive/20">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">{format(new Date(sale.created_at), 'dd MMM yyyy', { locale: bn })}</span>
                          <Badge variant="destructive" className="text-[10px]">বাকি: ৳{Number(sale.due_amount).toLocaleString('bn-BD')}</Badge>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>মোট: ৳{Number(sale.total_amount).toLocaleString('bn-BD')}</span>
                          <span>পরিশোধিত: ৳{Number(sale.paid_amount).toLocaleString('bn-BD')}</span>
                        </div>
                        <DueCollection saleId={sale.id} currentDue={Number(sale.due_amount)} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Purchase History */}
              {allSales?.filter(s => s.customer_id === selectedCustomer.id).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">🧾 ক্রয়ের ইতিহাস:</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {allSales?.filter(s => s.customer_id === selectedCustomer.id).slice(0, 20).map(sale => (
                      <div key={sale.id} className="flex justify-between items-center text-xs p-2 rounded bg-muted/30">
                        <span>{format(new Date(sale.created_at), 'dd MMM yyyy', { locale: bn })}</span>
                        <span className="font-medium">৳{Number(sale.total_amount).toLocaleString('bn-BD')}</span>
                        {Number(sale.due_amount) > 0 ? (
                          <Badge variant="destructive" className="text-[9px]">বাকি</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">সম্পূর্ণ</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer List */}
      <div className="flex-1 overflow-y-auto pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
          {filteredCustomers.map((customer) => {
            const due = customerDueMap[customer.id]?.totalDue || 0;
            return (
              <Card key={customer.id} className={`card-hover ${due > 0 ? 'border-destructive/30' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{customer.name}</h3>
                      {customer.phone && <p className="text-xs text-muted-foreground">📞 {customer.phone}</p>}
                    </div>
                    {due > 0 && (
                      <Badge variant="destructive" className="text-[10px]">বাকি: ৳{due.toLocaleString('bn-BD')}</Badge>
                    )}
                  </div>
                  {customer.email && <p className="text-xs text-muted-foreground">📧 {customer.email}</p>}
                  <div className="flex gap-1 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setSelectedCustomer(customer)}>
                      <Eye className="w-3 h-3 mr-1" /> বিস্তারিত
                    </Button>
                    <CustomerPDFReport customer={customer} dueMap={customerDueMap} allSales={allSales || []} />
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => startEdit(customer)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => {
                      if (confirm("এই কাস্টমার মুছে ফেলতে চান?")) deleteMutation.mutate(customer.id);
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredCustomers.length === 0 && (
            <Card className="p-8 text-center col-span-full">
              <div className="text-4xl mb-3">👥</div>
              <h3 className="text-lg font-semibold mb-1 text-foreground">কোনো কাস্টমার নেই</h3>
              <p className="text-sm text-muted-foreground">নতুন কাস্টমার যোগ করুন!</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
