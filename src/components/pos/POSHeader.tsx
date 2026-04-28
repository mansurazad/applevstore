import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScanBarcode, ChevronUp, ChevronDown } from "lucide-react";
import { useShopSettings } from "@/hooks/useShopSettings";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { SyncErrorPanel } from "@/components/SyncErrorPanel";

interface POSHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  imeiSearch: string;
  onImeiSearchChange: (value: string) => void;
  showOutOfStock: boolean;
  onShowOutOfStockChange: (checked: boolean) => void;
  onOpenScanner: () => void;
  hidden?: boolean;
  headerRef?: React.RefObject<HTMLDivElement>;
  headerHeight?: number;
}

export function POSHeader({
  searchTerm,
  onSearchChange,
  imeiSearch,
  onImeiSearchChange,
  showOutOfStock,
  onShowOutOfStockChange,
  onOpenScanner,
  hidden = false,
  headerRef,
  headerHeight = 0,
}: POSHeaderProps) {
  const { settings, logoSrc } = useShopSettings();
  const [showHeaderInfo, setShowHeaderInfo] = useState(true);

  return (
    <div
      ref={headerRef}
      style={{ marginBottom: hidden ? `-${headerHeight}px` : 0, transition: 'margin-bottom 300ms ease' }}
      className={`sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50 p-4 lg:pb-4 space-y-3 lg:space-y-4 transition-transform duration-300 ${hidden ? '-translate-y-full lg:translate-y-0 lg:!mb-0' : 'translate-y-0'}`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">পয়েন্ট অব সেল</h1>
            <SyncStatusBadge className="hidden sm:inline-flex" />
            <SyncErrorPanel className="hidden sm:inline-flex" />
            <button
              type="button"
              className="lg:hidden h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted shrink-0"
              onClick={() => setShowHeaderInfo(v => !v)}
              aria-label={showHeaderInfo ? "হেডার লুকান" : "হেডার দেখান"}
            >
              {showHeaderInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          <p className={`text-muted-foreground mt-1 text-xs sm:text-sm lg:text-base ${showHeaderInfo ? "block" : "hidden lg:block"}`}>
            বিক্রয় প্রক্রিয়া ও লেনদেন ব্যবস্থাপনা
          </p>
        </div>
        <img src={logoSrc} alt={settings.shop_name} className={`w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 shrink-0 ${showHeaderInfo ? "block" : "hidden lg:block"}`} />
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="🔍 নাম, ব্র্যান্ড বা SKU দিয়ে খুঁজুন..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 min-w-0"
        />
        <Input
          placeholder="📱 IMEI..."
          value={imeiSearch}
          onChange={(e) => onImeiSearchChange(e.target.value)}
          className="w-24 lg:w-40 shrink-0"
        />
        <Button variant="outline" onClick={onOpenScanner} className="shrink-0">
          <ScanBarcode className="w-4 h-4 lg:mr-2" />
          <span className="hidden lg:inline">স্ক্যান</span>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="showOutOfStockPOS"
          checked={showOutOfStock}
          onCheckedChange={(checked) => onShowOutOfStockChange(checked as boolean)}
        />
        <label
          htmlFor="showOutOfStockPOS"
          className="text-xs lg:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          স্টক শেষ পণ্যগুলি দেখান (০ স্টক)
        </label>
      </div>
    </div>
  );
}
