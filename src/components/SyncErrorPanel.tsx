import { useState } from "react";
import { AlertTriangle, RefreshCw, X, RotateCcw } from "lucide-react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listUnresolvedErrors, markErrorResolved, clearAllErrors } from "@/lib/sync/errors";
import { useSync } from "@/lib/sync/SyncProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { cn } from "@/lib/utils";

const opLabel: Record<string, string> = {
  push: "আপলোড",
  pull: "ডাউনলোড",
  delete: "মুছে ফেলা",
  stock: "স্টক আপডেট",
};

/**
 * Floating button + dialog showing unresolved sync errors.
 * Click "পুনরায় চেষ্টা" → triggers a sync; rows that succeed get cleared automatically.
 */
export function SyncErrorPanel({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const errors = useLiveQuery(() => listUnresolvedErrors(), []);
  const { syncing, syncNow } = useSync();

  const count = errors?.length ?? 0;
  if (count === 0) return null;

  const handleRetry = async () => {
    const res = await syncNow();
    if (res?.ok) {
      toast.success("পুনরায় sync সম্পন্ন — সমাধানযোগ্য ত্রুটি মুছে ফেলা হয়েছে");
      // Errors that no longer recur will be replaced by fresh ones, but
      // older ones for already-pushed rows can be marked resolved.
      const remaining = await listUnresolvedErrors();
      const seen = new Set(remaining.map((e) => `${e.table}|${e.row_id}|${e.operation}`));
      for (const old of errors ?? []) {
        const key = `${old.table}|${old.row_id}|${old.operation}`;
        if (!seen.has(key)) await markErrorResolved(old.id);
      }
    } else {
      toast.error("Sync ব্যর্থ — পরে আবার চেষ্টা করুন");
    }
  };

  const handleDismissAll = async () => {
    await clearAllErrors();
    toast.success("সকল ত্রুটি লগ মুছে ফেলা হয়েছে");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${count} টি sync ত্রুটি — বিস্তারিত দেখতে ক্লিক করুন`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
          className
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{count} টি ত্রুটি</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Sync ত্রুটি লগ ({count})
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 mb-3">
            <Button onClick={handleRetry} disabled={syncing} size="sm" className="gap-2">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              পুনরায় চেষ্টা
            </Button>
            <Button onClick={handleDismissAll} variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              সব লগ মুছুন
            </Button>
          </div>

          <ScrollArea className="h-[400px] pr-3">
            <div className="space-y-2">
              {(errors ?? []).map((err) => (
                <div
                  key={err.id}
                  className="border border-border rounded-lg p-3 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="destructive" className="text-xs">
                          {opLabel[err.operation] ?? err.operation}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {err.table}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(err.created_at), "dd MMM, hh:mm a", {
                            locale: bn,
                          })}
                        </span>
                      </div>
                      {err.row_id && (
                        <div className="text-xs text-muted-foreground font-mono mb-1 truncate">
                          ID: {err.row_id}
                        </div>
                      )}
                      <div className="text-sm text-foreground break-words">
                        {err.message}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => markErrorResolved(err.id)}
                      className="flex-shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted"
                      title="এই ত্রুটি মুছুন"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}