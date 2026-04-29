import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { LocalDB } from "@/lib/localdb/adapter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Package,
  ArrowRight,
  Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StockDiscrepancy {
  productId: string;
  productName: string;
  imei: string | null;
  currentStock: number;
  expectedStock: number;
  difference: number;
  totalSold: number;
  totalReturned: number;
}

export function StockSyncCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<StockDiscrepancy[]>([]);
  const [hasChecked, setHasChecked] = useState(false);

  // Fetch products – offline-aware
  const { data: products } = useOfflineQuery<any[]>(
    ["products"],
    async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data || [];
    },
    async () => LocalDB.listAll("products")
  );

  // Fetch sale items – offline-aware
  const { data: saleItems } = useOfflineQuery<any[]>(
    ["sale_items_for_sync"],
    async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity");
      if (error) throw error;
      return data || [];
    },
    async () => {
      const items = await LocalDB.listAll<any>("sale_items");
      return items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
    }
  );

  // Fetch returns – offline-aware
  const { data: returns } = useOfflineQuery<any[]>(
    ["returns_for_sync"],
    async () => {
      const { data, error } = await supabase
        .from("returns")
        .select("product_id, quantity, status")
        .eq("status", "completed");
      if (error) throw error;
      return data || [];
    },
    async () => {
      const rows = await LocalDB.listAll<any>("returns");
      return rows
        .filter((r) => r.status === "completed")
        .map((r) => ({ product_id: r.product_id, quantity: r.quantity, status: r.status }));
    }
  );

  const runStockCheck = () => {
    if (!products) {
      toast.error("প্রোডাক্ট ডাটা লোড হয়নি");
      return;
    }

    setIsChecking(true);
    const issues: StockDiscrepancy[] = [];

    products.forEach((product) => {
      // Calculate total sold
      const totalSold = saleItems
        ?.filter((item) => item.product_id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0) || 0;

      // Calculate total returned (completed returns)
      const totalReturned = returns
        ?.filter((ret) => ret.product_id === product.id)
        .reduce((sum, ret) => sum + ret.quantity, 0) || 0;

      // Expected stock = Initial stock (assumed 1 for mobiles) - sold + returned
      // Since we don't have initial stock, we calculate expected based on current operations
      // For mobile phones (stock_quantity always starts at 1), we check if:
      // If sold > 0 and stock > 0, there might be an issue
      // If sold = 0 and stock = 0, there's an issue (unless manually adjusted)

      // Calculate expected stock: Start with 1 (initial) - sold + returned
      const initialStock = 1; // Mobile phones start with 1
      const expectedStock = Math.max(0, initialStock - totalSold + totalReturned);
      const currentStock = product.stock_quantity;

      // Check for discrepancy
      if (currentStock !== expectedStock) {
        issues.push({
          productId: product.id,
          productName: product.name,
          imei: product.imei,
          currentStock,
          expectedStock,
          difference: currentStock - expectedStock,
          totalSold,
          totalReturned,
        });
      }
    });

    setDiscrepancies(issues);
    setHasChecked(true);
    setIsChecking(false);

    if (issues.length === 0) {
      toast.success("✅ স্টক সিঙ্ক ঠিক আছে! কোনো অসঙ্গতি পাওয়া যায়নি।");
    } else {
      toast.warning(`⚠️ ${issues.length}টি প্রোডাক্টে স্টক অসঙ্গতি পাওয়া গেছে।`);
    }
  };

  const fixDiscrepancy = async (discrepancy: StockDiscrepancy) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: discrepancy.expectedStock })
        .eq("id", discrepancy.productId);

      if (error) throw error;

      toast.success(`${discrepancy.productName} এর স্টক সংশোধন করা হয়েছে`);
      
      // Remove from discrepancies list
      setDiscrepancies(prev => prev.filter(d => d.productId !== discrepancy.productId));
    } catch (error: any) {
      toast.error(error.message || "স্টক সংশোধন করতে ব্যর্থ");
    }
  };

  const fixAllDiscrepancies = async () => {
    try {
      for (const discrepancy of discrepancies) {
        await supabase
          .from("products")
          .update({ stock_quantity: discrepancy.expectedStock })
          .eq("id", discrepancy.productId);
      }

      toast.success(`${discrepancies.length}টি প্রোডাক্টের স্টক সংশোধন করা হয়েছে`);
      setDiscrepancies([]);
    } catch (error: any) {
      toast.error(error.message || "স্টক সংশোধন করতে ব্যর্থ");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          স্টক সিঙ্ক চেক
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <RefreshCw className="h-5 w-5 text-primary" />
            স্টক সিঙ্ক্রোনাইজেশন চেক
          </DialogTitle>
          <DialogDescription>
            বিক্রয় রেকর্ড এবং বর্তমান স্টকের মধ্যে অসঙ্গতি যাচাই করুন
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Action Button */}
          <div className="flex items-center justify-between">
            <Button 
              onClick={runStockCheck} 
              disabled={isChecking}
              className="gap-2"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  চেক হচ্ছে...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  স্টক চেক করুন
                </>
              )}
            </Button>

            {discrepancies.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={fixAllDiscrepancies}
                className="gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                সব সংশোধন করুন ({discrepancies.length})
              </Button>
            )}
          </div>

          {/* Status Card */}
          {hasChecked && (
            <Card className={`p-4 ${discrepancies.length === 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200'}`}>
              <div className="flex items-center gap-3">
                {discrepancies.length === 0 ? (
                  <>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <h3 className="font-semibold text-green-800 dark:text-green-300">স্টক সিঙ্ক ঠিক আছে</h3>
                      <p className="text-sm text-green-700 dark:text-green-400">
                        মোট {products?.length || 0}টি প্রোডাক্ট চেক করা হয়েছে। কোনো অসঙ্গতি নেই।
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                    <div>
                      <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">অসঙ্গতি পাওয়া গেছে</h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        {discrepancies.length}টি প্রোডাক্টে স্টক অসঙ্গতি রয়েছে। নিচে বিস্তারিত দেখুন।
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Discrepancies List */}
          {discrepancies.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">অসঙ্গতি তালিকা</h3>
              {discrepancies.map((discrepancy) => (
                <Card key={discrepancy.productId} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold">{discrepancy.productName}</h4>
                        {discrepancy.imei && (
                          <p className="text-xs text-muted-foreground font-mono">IMEI: {discrepancy.imei}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                          <Badge variant="outline" className="gap-1">
                            বিক্রয়: {discrepancy.totalSold}
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            রিটার্ন: {discrepancy.totalReturned}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">বর্তমান</p>
                          <p className="font-bold text-red-600 text-lg">{discrepancy.currentStock}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">প্রত্যাশিত</p>
                          <p className="font-bold text-green-600 text-lg">{discrepancy.expectedStock}</p>
                        </div>
                      </div>

                      <Button 
                        size="sm"
                        onClick={() => fixDiscrepancy(discrepancy)}
                        className="gap-1"
                      >
                        <CheckCircle className="h-4 w-4" />
                        সংশোধন
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Info Card */}
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">কিভাবে কাজ করে?</p>
                <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                  <li>প্রতিটি মোবাইলের প্রাথমিক স্টক ১ ধরা হয়</li>
                  <li>বিক্রয় থেকে স্টক বাদ যায়</li>
                  <li>সম্পন্ন রিটার্ন থেকে স্টক যোগ হয়</li>
                  <li>প্রত্যাশিত = ১ - বিক্রয় + রিটার্ন</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
