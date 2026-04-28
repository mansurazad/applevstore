import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScanBarcode, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { imeiSchema } from "@/lib/validation/posSchemas";
import type { CartItem } from "./types";

interface ImeiVerifyPanelProps {
  cart: CartItem[];
  /** All product rows from local DB (for cross-check). */
  allProducts: any[];
  /** All sale_items from local DB (synced + pending) for re-sale guard. */
  allSaleItems: any[];
  onOpenScanner: () => void;
  /** Controlled verified-IMEI set, owned by parent (POS) so confirmSale can read it. */
  verified: Set<string>;
  onVerifiedChange: (next: Set<string>) => void;
}

/**
 * Lets the cashier scan / type the device IMEI before checkout to confirm
 * the physical handset matches what's in the cart and isn't a duplicate.
 * - 15-digit format check
 * - Must match a product currently in the cart
 * - Blocks if IMEI is already on a previous local sale_item
 */
export function ImeiVerifyPanel({
  cart,
  allProducts,
  allSaleItems,
  onOpenScanner,
  verified,
  onVerifiedChange,
}: ImeiVerifyPanelProps) {
  const [imei, setImei] = useState("");

  const verify = () => {
    const value = imei.trim();
    const parsed = imeiSchema.safeParse(value);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "IMEI বৈধ নয়");
      return;
    }

    // Must be in cart
    const cartHit = cart.find((c) => (c.product.imei ?? "").trim() === value);
    if (!cartHit) {
      toast.error("এই IMEI কার্টে নেই — আগে পণ্য কার্টে যোগ করুন");
      return;
    }

    // Already-sold guard: any sale_item whose product has same IMEI
    const productById = new Map(allProducts.map((p: any) => [p.id, p]));
    const alreadySold = allSaleItems.some((si: any) => {
      const p: any = productById.get(si.product_id);
      return (p?.imei ?? "").trim() === value;
    });
    if (alreadySold) {
      toast.error(`IMEI ${value} আগেই বিক্রি হয়েছে — পুনরায় বিক্রি করা যাবে না`);
      return;
    }

    if (verified.has(value)) {
      toast.info("এই IMEI ইতিমধ্যে যাচাই করা হয়েছে");
      return;
    }

    const next = new Set(verified);
    next.add(value);
    onVerifiedChange(next);
    setImei("");
    toast.success(`✓ IMEI যাচাই সফল — ${cartHit.product.name}`);
  };

  const removeVerified = (value: string) => {
    const next = new Set(verified);
    next.delete(value);
    onVerifiedChange(next);
  };

  // Pending = cart items with IMEI not yet verified
  const pending = cart.filter((c) => {
    const v = (c.product.imei ?? "").trim();
    return v && !verified.has(v);
  });

  if (cart.length === 0) return null;
  const cartHasImei = cart.some((c) => (c.product.imei ?? "").trim());
  if (!cartHasImei) return null;

  return (
    <Card className="p-3 space-y-2 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-semibold text-foreground">
          IMEI যাচাই ({verified.size}/
          {cart.filter((c) => (c.product.imei ?? "").trim()).length})
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        চেকআউটের আগে প্রতিটি ডিভাইসের IMEI স্ক্যান বা টাইপ করে যাচাই করুন।
      </p>
      <div className="flex gap-2">
        <Input
          value={imei}
          onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              verify();
            }
          }}
          placeholder="১৫ ডিজিটের IMEI..."
          inputMode="numeric"
          maxLength={15}
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenScanner}
          className="h-8 px-2 shrink-0"
          title="স্ক্যান করুন"
        >
          <ScanBarcode className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={verify}
          disabled={imei.trim().length !== 15}
          className="h-8 shrink-0"
        >
          যাচাই
        </Button>
      </div>

      {verified.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(verified).map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-400"
            >
              ✓ {v}
              <button
                type="button"
                onClick={() => removeVerified(v)}
                className="hover:text-destructive"
                aria-label="বাতিল"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          বাকি: {pending.map((p) => p.product.name).join(", ")}
        </p>
      )}
    </Card>
  );
}
