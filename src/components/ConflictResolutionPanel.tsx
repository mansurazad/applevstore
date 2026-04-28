import { useMemo, useState } from "react";
import { GitMerge, Cloud, HardDrive, RefreshCw } from "lucide-react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import {
  listUnresolvedConflicts,
  resolveConflict,
  clearResolvedConflicts,
} from "@/lib/sync/conflicts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { cn } from "@/lib/utils";

const tableLabel: Record<string, string> = {
  products: "পণ্য",
  customers: "গ্রাহক",
  suppliers: "সরবরাহকারী",
  categories: "ক্যাটাগরি",
  sales: "বিক্রয়",
  sale_items: "বিক্রয় আইটেম",
  due_payments: "বাকি পেমেন্ট",
  returns: "রিটার্ন",
  investment_sectors: "খাত",
  investment_entries: "বিনিয়োগ এন্ট্রি",
  investment_incomes: "আয়",
  shop_settings: "দোকান সেটিংস",
  activity_logs: "কার্যকলাপ লগ",
};

/** Picks a few human-friendly fields to show as a "preview" of a row. */
function previewFields(row: any): Array<[string, any]> {
  if (!row) return [];
  const candidates = [
    "name",
    "phone",
    "email",
    "imei",
    "sku",
    "price",
    "cost",
    "stock_quantity",
    "total_amount",
    "paid_amount",
    "due_amount",
    "status",
    "updated_at",
  ];
  return candidates
    .filter((k) => row[k] !== undefined && row[k] !== null && row[k] !== "")
    .map((k) => [k, row[k]]);
}

function diffKeys(a: any, b: any): Set<string> {
  const keys = new Set<string>();
  const all = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of all) {
    if (k.startsWith("_")) continue;
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) keys.add(k);
  }
  return keys;
}

export function ConflictResolutionPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const conflicts = useLiveQuery(() => listUnresolvedConflicts(), []);

  const count = conflicts?.length ?? 0;
  const list = useMemo(() => conflicts ?? [], [conflicts]);

  const handleResolve = async (id: string, side: "local" | "remote") => {
    setBusyId(id);
    try {
      await resolveConflict(id, side);
      await clearResolvedConflicts();
      toast.success(
        side === "local" ? "স্থানীয় সংস্করণ রাখা হয়েছে" : "সার্ভার সংস্করণ গ্রহণ করা হয়েছে"
      );
    } catch (e: any) {
      toast.error("সমাধান ব্যর্থ: " + (e?.message ?? String(e)));
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveAll = async (side: "local" | "remote") => {
    if (!list.length) return;
    setBusyId("__all__");
    try {
      for (const c of list) {
        await resolveConflict(c.id, side);
      }
      await clearResolvedConflicts();
      toast.success(
        side === "local"
          ? "সব দ্বন্দ্ব স্থানীয় সংস্করণে সমাধান হয়েছে"
          : "সব দ্বন্দ্ব সার্ভার সংস্করণে সমাধান হয়েছে"
      );
    } catch (e: any) {
      toast.error("ব্যাচ সমাধান ব্যর্থ: " + (e?.message ?? String(e)));
    } finally {
      setBusyId(null);
    }
  };

  if (count === 0) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          "gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <GitMerge className="h-4 w-4" />
        <span>{count} টি দ্বন্দ্ব</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-amber-600" />
              সিঙ্ক দ্বন্দ্ব সমাধান
              <Badge variant="secondary" className="ml-2">
                {count}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
            <Button
              size="sm"
              variant="outline"
              disabled={busyId !== null}
              onClick={() => handleResolveAll("remote")}
              className="gap-2"
            >
              <Cloud className="h-4 w-4" />
              সব সার্ভার সংস্করণ রাখুন
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId !== null}
              onClick={() => handleResolveAll("local")}
              className="gap-2"
            >
              <HardDrive className="h-4 w-4" />
              সব স্থানীয় সংস্করণ রাখুন
            </Button>
          </div>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-3 py-2">
              {list.map((c) => {
                const tName = tableLabel[c.table] ?? c.table;
                const changed = diffKeys(c.local, c.remote);
                return (
                  <Card key={c.id} className="p-4 space-y-3 border-amber-500/30">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <Badge variant="outline" className="mr-2">
                          {tName}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {c.row_id.slice(0, 8)}…
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.detected_at), "PPpp", { locale: bn })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                        <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                          <HardDrive className="h-3.5 w-3.5" />
                          স্থানীয় সংস্করণ (এই ডিভাইস)
                        </div>
                        {previewFields(c.local).map(([k, v]) => (
                          <div
                            key={k}
                            className={cn(
                              "text-xs flex justify-between gap-2",
                              changed.has(k) && "text-amber-600 font-medium"
                            )}
                          >
                            <span className="text-muted-foreground">{k}:</span>
                            <span className="truncate text-right">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                        <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                          <Cloud className="h-3.5 w-3.5" />
                          সার্ভার সংস্করণ (অনলাইন)
                        </div>
                        {previewFields(c.remote).map(([k, v]) => (
                          <div
                            key={k}
                            className={cn(
                              "text-xs flex justify-between gap-2",
                              changed.has(k) && "text-amber-600 font-medium"
                            )}
                          >
                            <span className="text-muted-foreground">{k}:</span>
                            <span className="truncate text-right">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId !== null}
                        onClick={() => handleResolve(c.id, "local")}
                        className="gap-1"
                      >
                        <HardDrive className="h-3.5 w-3.5" />
                        স্থানীয় রাখুন
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => handleResolve(c.id, "remote")}
                        className="gap-1"
                      >
                        <Cloud className="h-3.5 w-3.5" />
                        সার্ভার গ্রহণ করুন
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}