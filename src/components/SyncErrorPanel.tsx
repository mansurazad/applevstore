import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, X, RotateCcw, ListFilter } from "lucide-react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import {
  listUnresolvedErrors,
  markErrorResolved,
  clearAllErrors,
  clearResolvedErrors,
} from "@/lib/sync/errors";
import { useSync } from "@/lib/sync/SyncProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [confirmDismissAll, setConfirmDismissAll] = useState(false);
  const [opFilter, setOpFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const errors = useLiveQuery(() => listUnresolvedErrors(), []);
  const { syncing, syncNow } = useSync();

  const count = errors?.length ?? 0;

  const tableOptions = useMemo(() => {
    const set = new Set<string>();
    (errors ?? []).forEach((e) => set.add(e.table));
    return Array.from(set).sort();
  }, [errors]);

  const filtered = useMemo(() => {
    return (errors ?? []).filter((e) => {
      if (opFilter !== "all" && e.operation !== opFilter) return false;
      if (tableFilter !== "all" && e.table !== tableFilter) return false;
      return true;
    });
  }, [errors, opFilter, tableFilter]);

  if (count === 0) return null;

  const runRetry = async () => {
    const res = await syncNow();
    if (res?.ok) {
      // Errors that no longer recur will be replaced by fresh ones, but
      // older ones for already-pushed rows can be marked resolved.
      const remaining = await listUnresolvedErrors();
      const seen = new Set(remaining.map((e) => `${e.table}|${e.row_id}|${e.operation}`));
      let resolvedCount = 0;
      for (const old of errors ?? []) {
        const key = `${old.table}|${old.row_id}|${old.operation}`;
        if (!seen.has(key)) {
          await markErrorResolved(old.id);
          resolvedCount++;
        }
      }
      // Hard-delete the rows we just marked resolved so the log stays clean.
      await clearResolvedErrors();
      toast.success(
        resolvedCount > 0
          ? `পুনরায় sync সম্পন্ন — ${resolvedCount} টি ত্রুটি সমাধান হয়েছে`
          : "পুনরায় sync সম্পন্ন — কোনো ত্রুটি সমাধান হয়নি"
      );
    } else {
      toast.error("Sync ব্যর্থ — পরে আবার চেষ্টা করুন");
    }
  };

  const runDismissAll = async () => {
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
              Sync ত্রুটি লগ ({filtered.length}/{count})
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 mb-3">
            <Button onClick={() => setConfirmRetry(true)} disabled={syncing} size="sm" className="gap-2">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              সব ব্যর্থ sync পুনরায় চেষ্টা
            </Button>
            <Button onClick={() => setConfirmDismissAll(true)} variant="outline" size="sm" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              সব লগ মুছুন
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <Select value={opFilter} onValueChange={setOpFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="অপারেশন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব অপারেশন</SelectItem>
                <SelectItem value="push">আপলোড (push)</SelectItem>
                <SelectItem value="pull">ডাউনলোড (pull)</SelectItem>
                <SelectItem value="stock">স্টক আপডেট</SelectItem>
                <SelectItem value="delete">মুছে ফেলা</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="টেবিল" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব টেবিল</SelectItem>
                {tableOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(opFilter !== "all" || tableFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setOpFilter("all");
                  setTableFilter("all");
                }}
              >
                ফিল্টার রিসেট
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px] pr-3">
            <div className="space-y-2">
              {filtered.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  এই ফিল্টারে কোনো ত্রুটি নেই
                </div>
              )}
              {filtered.map((err) => (
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

      {/* Retry-all confirmation */}
      <AlertDialog open={confirmRetry} onOpenChange={setConfirmRetry}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              সব ব্যর্থ sync পুনরায় চেষ্টা?
            </AlertDialogTitle>
            <AlertDialogDescription>
              এটি এখনই সার্ভারের সাথে full sync চালাবে এবং {count} টি ব্যর্থ
              অপারেশন আবার আপলোড/ডাউনলোড করার চেষ্টা করবে। ইন্টারনেট সংযোগ
              দুর্বল হলে এটি কিছুটা সময় নিতে পারে।
              <br />
              <span className="text-xs text-muted-foreground mt-2 block">
                আপনি কি নিশ্চিত?
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmRetry(false);
                await runRetry();
              }}
              disabled={syncing}
            >
              ✓ হ্যাঁ, পুনরায় চেষ্টা করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dismiss-all confirmation */}
      <AlertDialog open={confirmDismissAll} onOpenChange={setConfirmDismissAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" />
              সব ত্রুটি লগ মুছবেন?
            </AlertDialogTitle>
            <AlertDialogDescription>
              এটি বর্তমান {count} টি ত্রুটি লগ স্থায়ীভাবে মুছে ফেলবে। মুছে
              ফেলার পরও মূল ডেটা সিঙ্ক ব্যর্থ থাকলে নতুন ত্রুটি লগ হবে।
              এই কাজটি undo করা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setConfirmDismissAll(false);
                await runDismissAll();
              }}
            >
              ✓ হ্যাঁ, মুছে ফেলুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}