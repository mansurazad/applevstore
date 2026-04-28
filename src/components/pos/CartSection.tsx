import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CartItem } from "./types";

interface CartSectionProps {
  cart: CartItem[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onUpdatePrice: (productId: string, price: number) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  total: number;
  /** Live local stock per product id (from IndexedDB). */
  liveStockMap?: Map<string, number>;
}

export function CartSection({
  cart,
  isCollapsed,
  onToggleCollapse,
  onUpdatePrice,
  onUpdateQuantity,
  onRemoveItem,
  total,
  liveStockMap,
}: CartSectionProps) {
  return (
    <Card className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg lg:text-xl font-semibold text-foreground">কার্ট</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="lg:hidden"
        >
          {isCollapsed ? "বিস্তারিত" : "সংক্ষিপ্ত"}
        </Button>
      </div>

      {!isCollapsed && (
        <>
          <div className="space-y-3 lg:space-y-4 mb-4">
            {cart.map((item) => (
              <div key={item.product.id} className="space-y-2 py-3 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{item.product.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">মূল্য:</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.customPrice}
                        onChange={(e) => onUpdatePrice(item.product.id, parseFloat(e.target.value) || 0)}
                        className="w-20 lg:w-24 h-7 text-xs"
                      />
                    </div>
                    {(() => {
                      const live = liveStockMap?.get(item.product.id);
                      const stock = typeof live === "number"
                        ? live
                        : Number(item.product.stock_quantity ?? 0);
                      const remaining = stock - item.quantity;
                      const tone =
                        remaining < 0
                          ? "text-destructive"
                          : remaining === 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground";
                      return (
                        <p className={`text-[10px] mt-1 ${tone}`}>
                          লোকাল স্টক: {stock}{" "}
                          {remaining < 0
                            ? `(অপ্রতুল ${Math.abs(remaining)})`
                            : `(বাকি ${remaining})`}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
                    <span className="w-6 lg:w-8 text-center font-semibold text-sm">1</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  সাবটোটাল: ৳{(item.customPrice * item.quantity).toLocaleString('bn-BD')}
                </p>
              </div>
            ))}
          </div>

          {cart.length === 0 && (
            <div className="text-center py-6 lg:py-8 text-muted-foreground">
              <div className="text-3xl lg:text-4xl mb-2">🛒</div>
              <p className="text-sm">কার্ট খালি</p>
            </div>
          )}
        </>
      )}

      {isCollapsed && cart.length > 0 && (
        <div className="bg-primary/10 p-3 rounded-lg mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground font-medium">{cart.length}টি পণ্য</span>
            <span className="text-primary font-bold">৳{total.toLocaleString('bn-BD')}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
