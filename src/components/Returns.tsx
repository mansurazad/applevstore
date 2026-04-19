import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { RotateCcw, Search, Package, Calendar, User, CheckCircle, XCircle, Clock } from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { AutoHideSticky } from "@/components/AutoHideSticky";

export function Returns() {
  const { containerRef, headerRef, hidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchSaleId, setSearchSaleId] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState("defective");
  const [reasonNotes, setReasonNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const queryClient = useQueryClient();

  // Fetch returns
  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("returns")
        .select(`
          *,
          sales (
            id,
            total_amount,
            created_at,
            customers (name, phone)
          ),
          sale_items (
            quantity,
            unit_price,
            total_price
          ),
          products (
            name,
            imei,
            brand
          )
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Search for sale
  const searchSale = async () => {
    if (!searchSaleId.trim()) {
      toast.error("বিক্রয় আইডি লিখুন");
      return;
    }

    const { data, error } = await supabase
      .from("sales")
      .select(`
        *,
        customers (name, phone),
        sale_items (
          *,
          products (name, imei, brand)
        )
      `)
      .ilike("id", `%${searchSaleId}%`)
      .maybeSingle();

    if (error) {
      toast.error("বিক্রয় খুঁজতে সমস্যা হয়েছে");
      return;
    }

    if (!data) {
      toast.error("বিক্রয় পাওয়া যায়নি");
      return;
    }

    setSelectedSale(data);
    setIsAddDialogOpen(true);
  };

  // Create return mutation
  const createReturnMutation = useMutation({
    mutationFn: async (returnData: any) => {
      const { error } = await supabase.from("returns").insert([returnData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast.success("রিটার্ন সফলভাবে তৈরি হয়েছে!");
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "রিটার্ন তৈরি করতে ব্যর্থ");
    },
  });

  // Process return mutation (update inventory)
  const processReturnMutation = useMutation({
    mutationFn: async ({ returnId, status }: { returnId: string; status: string }) => {
      // Get return details
      const { data: returnData, error: fetchError } = await supabase
        .from("returns")
        .select("*, products(stock_quantity)")
        .eq("id", returnId)
        .single();

      if (fetchError) throw fetchError;

      // Update return status
      const { error: updateError } = await supabase
        .from("returns")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", returnId);

      if (updateError) throw updateError;

      // If approved, update product inventory
      if (status === "completed") {
        const newStock = (returnData.products?.stock_quantity || 0) + returnData.quantity;
        const { error: inventoryError } = await supabase
          .from("products")
          .update({ stock_quantity: newStock })
          .eq("id", returnData.product_id);

        if (inventoryError) throw inventoryError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("রিটার্ন প্রসেস সফল হয়েছে!");
    },
    onError: (error: any) => {
      toast.error(error.message || "রিটার্ন প্রসেস করতে ব্যর্থ");
    },
  });

  const handleSubmitReturn = () => {
    if (!selectedItem) {
      toast.error("রিটার্নের জন্য একটি আইটেম নির্বাচন করুন");
      return;
    }

    if (returnQuantity < 1 || returnQuantity > selectedItem.quantity) {
      toast.error(`রিটার্ন পরিমাণ ১ থেকে ${selectedItem.quantity} এর মধ্যে হতে হবে`);
      return;
    }

    const refundAmount = (selectedItem.unit_price * returnQuantity);

    createReturnMutation.mutate({
      sale_id: selectedSale.id,
      sale_item_id: selectedItem.id,
      product_id: selectedItem.product_id,
      quantity: returnQuantity,
      refund_amount: refundAmount,
      reason_code: reasonCode,
      reason_notes: reasonNotes || null,
      status: "pending",
    });
  };

  const resetForm = () => {
    setSearchSaleId("");
    setSelectedSale(null);
    setSelectedItem(null);
    setReturnQuantity(1);
    setReasonCode("defective");
    setReasonNotes("");
    setIsAddDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1">
            <Clock className="h-3 w-3" />
            অপেক্ষমাণ
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            অনুমোদিত
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            সম্পন্ন
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
            <XCircle className="h-3 w-3" />
            প্রত্যাখ্যাত
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getReasonLabel = (code: string) => {
    const reasons: Record<string, string> = {
      defective: "ত্রুটিপূর্ণ পণ্য",
      wrong_item: "ভুল পণ্য",
      customer_request: "ক্রেতার অনুরোধ",
      damaged: "ক্ষতিগ্রস্ত",
      not_as_described: "বিবরণ অনুযায়ী নয়",
      other: "অন্যান্য",
    };
    return reasons[code] || code;
  };

  const filteredReturns = returns?.filter(ret => 
    filterStatus === "all" || ret.status === filterStatus
  ) || [];

  // Stats
  const pendingCount = returns?.filter(r => r.status === "pending").length || 0;
  const completedCount = returns?.filter(r => r.status === "completed").length || 0;
  const totalRefund = returns?.filter(r => r.status === "completed").reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">রিটার্ন ডাটা লোড হচ্ছে...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-screen overflow-y-auto animate-fade-in">
      {/* Auto-hide Header */}
      <AutoHideSticky hidden={hidden} headerHeight={headerHeight} headerRef={headerRef} className="px-1 pb-3 pt-1 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <RotateCcw className="h-7 w-7 text-primary" />
              রিটার্ন ও রিফান্ড
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">পণ্য রিটার্ন ট্র্যাক করুন এবং রিফান্ড প্রসেস করুন</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90 gap-2">
                <RotateCcw className="h-4 w-4" />
                নতুন রিটার্ন
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">রিটার্ন তৈরি করুন</DialogTitle>
              </DialogHeader>
              
              {!selectedSale ? (
                <div className="space-y-4 py-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">বিক্রয় আইডি দিয়ে খুঁজুন</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={searchSaleId}
                          onChange={(e) => setSearchSaleId(e.target.value)}
                          placeholder="বিক্রয় আইডি লিখুন..."
                          className="pl-9"
                          onKeyDown={(e) => e.key === "Enter" && searchSale()}
                        />
                      </div>
                      <Button onClick={searchSale} className="gap-2">
                        <Search className="h-4 w-4" />
                        খুঁজুন
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <Card className="p-4 bg-muted/50 border-primary/20">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      বিক্রয় তথ্য
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">বিক্রয় আইডি</p>
                        <p className="font-mono font-medium">{selectedSale.id.slice(0, 8)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">তারিখ</p>
                        <p className="font-medium">{format(new Date(selectedSale.created_at), "dd MMM yyyy", { locale: bn })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ক্রেতা</p>
                        <p className="font-medium">{selectedSale.customers?.name || "সাধারণ ক্রেতা"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">মোট</p>
                        <p className="font-medium text-primary">৳{selectedSale.total_amount?.toLocaleString('bn-BD')}</p>
                      </div>
                    </div>
                  </Card>

                  <div>
                    <label className="block text-sm font-medium mb-2">রিটার্নের জন্য আইটেম নির্বাচন করুন</label>
                    <Select value={selectedItem?.id} onValueChange={(value) => {
                      const item = selectedSale.sale_items.find((i: any) => i.id === value);
                      setSelectedItem(item);
                      setReturnQuantity(1);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="একটি আইটেম নির্বাচন করুন" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSale.sale_items?.map((item: any) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.products?.name} - পরিমাণ: {item.quantity} - ৳{item.unit_price?.toLocaleString('bn-BD')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedItem && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">রিটার্ন পরিমাণ</label>
                        <Input
                          type="number"
                          min="1"
                          max={selectedItem.quantity}
                          value={returnQuantity}
                          onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          সর্বোচ্চ: {selectedItem.quantity}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">রিটার্নের কারণ</label>
                        <Select value={reasonCode} onValueChange={setReasonCode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="defective">ত্রুটিপূর্ণ পণ্য</SelectItem>
                            <SelectItem value="wrong_item">ভুল পণ্য</SelectItem>
                            <SelectItem value="customer_request">ক্রেতার অনুরোধ</SelectItem>
                            <SelectItem value="damaged">ট্রানজিটে ক্ষতিগ্রস্ত</SelectItem>
                            <SelectItem value="not_as_described">বিবরণ অনুযায়ী নয়</SelectItem>
                            <SelectItem value="other">অন্যান্য</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">অতিরিক্ত মন্তব্য</label>
                        <Textarea
                          value={reasonNotes}
                          onChange={(e) => setReasonNotes(e.target.value)}
                          placeholder="অতিরিক্ত তথ্য লিখুন..."
                          rows={3}
                        />
                      </div>

                      <Card className="p-4 bg-primary/5 border-primary/20">
                        <p className="text-sm font-medium text-muted-foreground">রিফান্ড পরিমাণ</p>
                        <p className="text-3xl font-bold text-primary">
                          ৳{(selectedItem.unit_price * returnQuantity).toLocaleString('bn-BD')}
                        </p>
                      </Card>
                    </>
                  )}

                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button variant="outline" onClick={resetForm}>
                      বাতিল
                    </Button>
                    <Button 
                      onClick={handleSubmitReturn}
                      disabled={!selectedItem || createReturnMutation.isPending}
                      className="gap-2"
                    >
                      {createReturnMutation.isPending ? "তৈরি হচ্ছে..." : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          রিটার্ন তৈরি করুন
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">অপেক্ষমাণ রিটার্ন</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </Card>
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">সম্পন্ন রিটার্ন</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">মোট রিফান্ড</p>
                <p className="text-2xl font-bold text-primary">৳{totalRefund.toLocaleString('bn-BD')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-primary" />
              </div>
            </div>
          </Card>
        </div>

        {/* Filter */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <label className="text-sm font-medium">স্ট্যাটাস ফিল্টার:</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সকল</SelectItem>
                <SelectItem value="pending">অপেক্ষমাণ</SelectItem>
                <SelectItem value="approved">অনুমোদিত</SelectItem>
                <SelectItem value="completed">সম্পন্ন</SelectItem>
                <SelectItem value="rejected">প্রত্যাখ্যাত</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </AutoHideSticky>

      {/* Scrollable Content */}
      <div className="flex-1 pb-6 space-y-4 px-1">
        {/* Returns List */}
        {filteredReturns.length > 0 ? (
          <div className="grid gap-4">
            {filteredReturns.map((returnItem) => (
              <Card key={returnItem.id} className="p-5 card-hover">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{returnItem.products?.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono">
                        রিটার্ন #{returnItem.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(returnItem.status)}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      বিক্রয় আইডি
                    </p>
                    <p className="font-medium font-mono">{returnItem.sale_id.slice(0, 8)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">পরিমাণ</p>
                    <p className="font-medium">{returnItem.quantity}টি</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">রিফান্ড</p>
                    <p className="font-medium text-primary">৳{returnItem.refund_amount?.toLocaleString('bn-BD')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      তারিখ
                    </p>
                    <p className="font-medium">{format(new Date(returnItem.created_at), "dd MMM yyyy", { locale: bn })}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-1">কারণ</p>
                  <p className="font-medium">{getReasonLabel(returnItem.reason_code)}</p>
                  {returnItem.reason_notes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">"{returnItem.reason_notes}"</p>
                  )}
                </div>

                {returnItem.status === "pending" && (
                  <div className="flex gap-2 pt-3 border-t">
                    <Button
                      size="sm"
                      onClick={() => processReturnMutation.mutate({ 
                        returnId: returnItem.id, 
                        status: "completed" 
                      })}
                      disabled={processReturnMutation.isPending}
                      className="gap-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      অনুমোদন ও সম্পন্ন
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => processReturnMutation.mutate({ 
                        returnId: returnItem.id, 
                        status: "rejected" 
                      })}
                      disabled={processReturnMutation.isPending}
                      className="gap-1"
                    >
                      <XCircle className="h-4 w-4" />
                      প্রত্যাখ্যান
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">কোনো রিটার্ন নেই</h3>
            <p className="text-muted-foreground">
              রিটার্ন তৈরি করলে এখানে দেখাবে
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
