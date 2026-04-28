import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InvoiceModal } from "./InvoiceModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { db as localDb } from "@/lib/db";
import { useLiveQuery } from "@/hooks/useLiveQuery";

// Sub-components
import { CartItem, Product, Customer } from "./pos/types";
import { POSHeader } from "./pos/POSHeader";
import { CartSection } from "./pos/CartSection";
import { ProductGrid } from "./pos/ProductGrid";
import { PaymentSection } from "./pos/PaymentSection";
import { SaleConfirmDialog } from "./pos/SaleConfirmDialog";

export function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [searchTerm, setSearchTerm] = useState("");
  const [imeiSearch, setImeiSearch] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [isCartCollapsed, setIsCartCollapsed] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [instantCustomerName, setInstantCustomerName] = useState("");
  const [instantCustomerPhone, setInstantCustomerPhone] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [saleImageUrl, setSaleImageUrl] = useState("");
  const { containerRef, headerRef, hidden: headerHidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();

  const queryClient = useQueryClient();

  const productsRaw = useLiveQuery(() => localDb.products.list(), []);
  const customersRaw = useLiveQuery(() => localDb.customers.list(), []);
  const saleItemsRaw = useLiveQuery(() => localDb.saleItems.list(), []);
  const products = productsRaw
    ? ([...productsRaw].sort((a: any, b: any) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ) as Product[])
    : undefined;
  const customers = customersRaw
    ? ([...customersRaw].sort((a: any, b: any) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ) as Customer[])
    : undefined;

  // Live local stock map keyed by product id, for cart indicators + validation.
  const liveStockMap = new Map<string, number>(
    (productsRaw ?? []).map((p: any) => [
      p.id,
      Number(p.stock_quantity ?? 0),
    ])
  );

  const completeSaleMutation = useMutation({
    mutationFn: async (saleData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1) Create sale locally (offline-first). Sync engine pushes in background.
      const sale: any = await localDb.sales.create({
        user_id: user.id,
        customer_id: saleData.customer_id,
        total_amount: saleData.total_amount,
        payment_method: saleData.payment_method,
        status: "completed",
        instant_customer_name: saleData.instant_customer_name,
        instant_customer_phone: saleData.instant_customer_phone,
        paid_amount: saleData.paid_amount,
        due_amount: saleData.due_amount,
        image_url: saleData.image_url || null,
      });

      // 2) Insert sale items + decrement local stock (binary 0/1 model).
      const insertedItems: any[] = [];
      for (const item of saleData.items) {
        const created = await localDb.saleItems.create({
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        });
        insertedItems.push(created);

        const product: any = await localDb.products.get(item.product_id);
        if (product) {
          const newStock = Math.max(0, (product.stock_quantity ?? 0) - item.quantity);
          await localDb.products.update(item.product_id, {
            stock_quantity: newStock,
          });
        }
      }

      // 3) Resolve relations locally for the invoice modal.
      const customer: any = sale.customer_id
        ? await localDb.customers.get(sale.customer_id)
        : null;
      const productMap = new Map(
        (productsRaw ?? []).map((p: any) => [p.id, p])
      );
      // Invoice fallback: even if local customer row is missing fields
      // (e.g. phone/email not captured), build a clean object so the
      // invoice still renders without "undefined" text. Falls back to
      // instant-customer fields, then to a generic walk-in label.
      const cleanStr = (v: any) =>
        typeof v === "string" && v.trim() ? v.trim() : null;
      const fallbackName =
        cleanStr(customer?.name) ??
        cleanStr(saleData.instant_customer_name) ??
        "সাধারণ ক্রেতা";
      const fallbackPhone =
        cleanStr(customer?.phone) ??
        cleanStr(saleData.instant_customer_phone);
      const fullSale = {
        ...sale,
        customers:
          customer || saleData.instant_customer_name
            ? {
                name: fallbackName,
                phone: fallbackPhone,
                email: cleanStr(customer?.email),
                address: cleanStr(customer?.address),
              }
            : null,
        sale_items: insertedItems.map((it: any) => ({
          ...it,
          products: (() => {
            const p: any = productMap.get(it.product_id);
            if (!p) return null;
            return {
              name: p.name,
              sku: p.sku ?? null,
              imei: p.imei ?? null,
              brand: p.brand ?? null,
              model: p.model ?? null,
              condition: p.condition ?? "new",
              image_url: p.image_url ?? null,
            };
          })(),
        })),
      };
      return fullSale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("বিক্রয় সফলভাবে সম্পন্ন হয়েছে!");
      
      const itemCount = sale?.sale_items?.length || cart.length;
      ActivityLogger.saleCreated(sale?.id, sale?.total_amount, itemCount);
      
      setLastSale(sale);
      setShowInvoice(true);
      setCart([]);
      setSelectedCustomer("");
      setPaymentMethod("cash");
      setInstantCustomerName("");
      setInstantCustomerPhone("");
      setPaidAmount(0);
      setSaleImageUrl("");
    },
    onError: (error: any) => {
      toast.error(error.message || "বিক্রয় সম্পন্ন করতে ব্যর্থ");
    },
  });

  const addToCart = (product: Product) => {
    // Offline stock validation: read fresh from local DB.
    const liveStock = Number(product.stock_quantity ?? 0);
    if (liveStock <= 0) {
      toast.error(`${product.name} স্টকে নেই — যোগ করা যাবে না`);
      return;
    }
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      toast.error(`${product.name} ইতিমধ্যে কার্টে আছে`);
      return;
    }
    setCart([...cart, { product, quantity: 1, customPrice: Number(product.price) }]);
    toast.success(`${product.name} কার্টে যোগ হয়েছে`);
  };

  const updatePrice = (productId: string, price: number) => {
    setCart(cart.map(item =>
      item.product.id === productId
        ? { ...item, customPrice: price }
        : item
    ));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      // Block exceeding local stock.
      const live: any = (products ?? []).find((p: any) => p.id === productId);
      const available = Number(live?.stock_quantity ?? 0);
      if (quantity > available) {
        toast.error(
          `স্টক অপ্রতুল — সর্বোচ্চ ${available} টি উপলব্ধ`
        );
        return;
      }
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  };

  const handleCompleteSaleClick = () => {
    if (cart.length === 0) {
      toast.error("কার্ট খালি");
      return;
    }

    const warningItems = cart.filter(item => {
      const cost = Number(item.product.cost) || 0;
      const price = item.customPrice;
      return cost > 0 && price > cost * 3;
    });

    if (warningItems.length > 0) {
      const itemNames = warningItems.map(i => i.product.name).join(', ');
      toast.warning(`⚠️ সতর্কতা: ${itemNames} এর বিক্রয় মূল্য অস্বাভাবিকভাবে বেশি (ক্রয় মূল্যের ৩ গুণের বেশি)। দয়া করে নিশ্চিত করুন।`, {
        duration: 8000,
      });
    }

    setShowConfirmDialog(true);
  };

  const confirmSale = () => {
    if (getTotal() <= 0) {
      toast.error("বিক্রয় মূল্য ০ হতে পারে না");
      return;
    }

    // Final offline stock validation against current local DB.
    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));
    const insufficient: string[] = [];
    for (const item of cart) {
      const live: any = productMap.get(item.product.id);
      const available = Number(live?.stock_quantity ?? 0);
      if (item.quantity > available) {
        insufficient.push(`${item.product.name} (চাওয়া ${item.quantity} / আছে ${available})`);
      }
    }
    if (insufficient.length > 0) {
      toast.error(`স্টক অপ্রতুল: ${insufficient.join(", ")}`, { duration: 8000 });
      return;
    }

    // Offline duplicate-IMEI guard:
    //   (a) two cart lines must not share an IMEI
    //   (b) an IMEI already attached to a previously sold local sale_item
    //       (synced or pending sync) cannot be re-sold
    const cartImeis = new Map<string, string>(); // imei -> product name
    for (const item of cart) {
      const imei = (item.product.imei ?? "").trim();
      if (!imei) continue;
      if (cartImeis.has(imei)) {
        toast.error(
          `ডুপ্লিকেট IMEI: ${imei} — ${cartImeis.get(imei)} ও ${item.product.name} একই IMEI এ`,
          { duration: 8000 }
        );
        return;
      }
      cartImeis.set(imei, item.product.name);
    }

    if (cartImeis.size > 0) {
      const productById = new Map(
        (productsRaw ?? []).map((p: any) => [p.id, p])
      );
      const conflicts: string[] = [];
      for (const it of (saleItemsRaw ?? []) as any[]) {
        const p: any = productById.get(it.product_id);
        const imei = (p?.imei ?? "").trim();
        if (imei && cartImeis.has(imei)) {
          conflicts.push(`${cartImeis.get(imei)} (IMEI ${imei})`);
        }
      }
      if (conflicts.length > 0) {
        toast.error(
          `এই IMEI আগে বিক্রি হয়েছে বা sync হওয়ার অপেক্ষায় আছে: ${conflicts.join(
            ", "
          )}`,
          { duration: 9000 }
        );
        return;
      }
    }

    const dueAmount = Math.max(0, getTotal() - paidAmount);

    const saleData = {
      customer_id: selectedCustomer || null,
      total_amount: getTotal(),
      payment_method: paymentMethod,
      instant_customer_name: instantCustomerName || null,
      instant_customer_phone: instantCustomerPhone || null,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      image_url: saleImageUrl || null,
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.customPrice,
        total_price: item.customPrice * item.quantity,
      })),
    };

    setShowConfirmDialog(false);
    completeSaleMutation.mutate(saleData);
  };

  const handleBarcodeScanned = (barcode: string) => {
    const product = products?.find(p => 
      p.barcode === barcode || p.imei === barcode
    );

    if (product) {
      if (product.stock_quantity <= 0) {
        toast.error(`${product.name} স্টকে নেই`);
        return;
      }
      addToCart(product);
    } else {
      toast.error("এই বারকোড দিয়ে পণ্য পাওয়া যায়নি");
    }
  };

  const filteredProducts = products?.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const imeiLower = imeiSearch.toLowerCase();
    
    const matchesSearch = 
      p.name?.toLowerCase().includes(searchLower) ||
      p.sku?.toLowerCase().includes(searchLower) ||
      p.brand?.toLowerCase().includes(searchLower) ||
      p.model?.toLowerCase().includes(searchLower) ||
      p.barcode?.toLowerCase().includes(searchLower);
    
    const matchesImei = !imeiSearch || p.imei?.toLowerCase().includes(imeiLower);
    
    const hasStock = showOutOfStock || p.stock_quantity > 0;
    
    return matchesSearch && matchesImei && hasStock;
  });

  const total = getTotal();

  return (
    <div className="flex flex-col h-screen animate-fade-in pb-16 lg:pb-0">
      <POSHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        imeiSearch={imeiSearch}
        onImeiSearchChange={setImeiSearch}
        showOutOfStock={showOutOfStock}
        onShowOutOfStockChange={setShowOutOfStock}
        onOpenScanner={() => setShowScanner(true)}
        hidden={headerHidden}
        headerRef={headerRef}
        headerHeight={headerHeight}
      />

      <div ref={containerRef} className="flex-1 flex lg:flex-row flex-col overflow-y-auto lg:overflow-hidden">
        {/* Products Section */}
        <div className="flex-1 lg:flex-[2] lg:overflow-y-auto p-3 lg:p-6 order-2 lg:order-1">
          <ProductGrid products={filteredProducts} onAddToCart={addToCart} />
        </div>

        {/* Cart Section */}
        <div className="lg:w-96 lg:flex-shrink-0 lg:border-l border-border lg:overflow-y-auto order-1 lg:order-2">
          <div className="p-4 lg:p-6">
            <CartSection
              cart={cart}
              isCollapsed={isCartCollapsed}
              onToggleCollapse={() => setIsCartCollapsed(!isCartCollapsed)}
              onUpdatePrice={updatePrice}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              total={total}
              liveStockMap={liveStockMap}
            />
            <div className="mt-4">
              <PaymentSection
                customers={customers}
                selectedCustomer={selectedCustomer}
                onCustomerChange={setSelectedCustomer}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                total={total}
                cartEmpty={cart.length === 0}
                isProcessing={completeSaleMutation.isPending}
                onCompleteSale={handleCompleteSaleClick}
                instantCustomerName={instantCustomerName}
                onInstantCustomerNameChange={setInstantCustomerName}
                instantCustomerPhone={instantCustomerPhone}
                onInstantCustomerPhoneChange={setInstantCustomerPhone}
                paidAmount={paidAmount}
                onPaidAmountChange={setPaidAmount}
                saleImageUrl={saleImageUrl}
                onSaleImageUrlChange={setSaleImageUrl}
              />
            </div>
          </div>
        </div>
      </div>

      <SaleConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        cart={cart}
        total={total}
        onConfirm={confirmSale}
      />

      {showInvoice && lastSale && (
        <InvoiceModal
          isOpen={showInvoice}
          sale={lastSale}
          onClose={() => setShowInvoice(false)}
        />
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
}
