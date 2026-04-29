import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Trash2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
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
import { toast } from "sonner";
import { forgetOfflineCredential } from "@/lib/auth/offlineAuth";

const STORAGE_KEY = "applestore.offlineAuth.v1";

type StoredCredential = {
  email: string;
  user_id: string;
  saved_at: number;
};

function readEntries(): StoredCredential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    return Object.values(parsed as Record<string, StoredCredential>);
  } catch {
    return [];
  }
}

/**
 * "Manage cached login" — lists every account that has an offline
 * credential cached on this device, when it was last saved (i.e. the
 * last successful online login), and lets the admin clear individual
 * or all cached credentials.
 */
export function CachedLoginPanel() {
  const [entries, setEntries] = useState<StoredCredential[]>(() => readEntries());
  const [pendingClear, setPendingClear] = useState<string | "ALL" | null>(null);

  const refresh = () => setEntries(readEntries());

  const handleClear = () => {
    if (!pendingClear) return;
    if (pendingClear === "ALL") {
      forgetOfflineCredential();
      toast.success("সব ক্যাশড লগইন তথ্য মুছে ফেলা হয়েছে");
    } else {
      forgetOfflineCredential(pendingClear);
      toast.success(`${pendingClear} এর অফলাইন লগইন মুছে ফেলা হয়েছে`);
    }
    setPendingClear(null);
    refresh();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">ক্যাশড লগইন ব্যবস্থাপনা</h2>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {entries.length} টি অ্যাকাউন্ট
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        এই ডিভাইসে অফলাইনে লগইনের জন্য নিচের অ্যাকাউন্টগুলোর encrypted credentials সংরক্ষিত
        আছে। প্রয়োজনে নির্দিষ্ট অ্যাকাউন্টের ক্যাশ মুছে ফেলুন (যেমন ডিভাইস বদলালে বা কর্মী চলে গেলে)।
      </p>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          এখনো কোনো অফলাইন credential সংরক্ষিত হয়নি। অন্তত একবার অনলাইনে লগইন করলে এখানে দেখা যাবে।
        </div>
      ) : (
        <div className="space-y-2">
          {entries
            .slice()
            .sort((a, b) => b.saved_at - a.saved_at)
            .map((e) => (
              <div
                key={e.email}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{e.email}</p>
                  <p className="text-xs text-muted-foreground">
                    সর্বশেষ অফলাইন লগইন তথ্য সংরক্ষণ:{" "}
                    <span className="font-medium text-foreground">
                      {format(new Date(e.saved_at), "PPpp", { locale: bn })}
                    </span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setPendingClear(e.email)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  মুছুন
                </Button>
              </div>
            ))}
        </div>
      )}

      {entries.length > 1 && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setPendingClear("ALL")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            সব ক্যাশড লগইন মুছুন
          </Button>
        </div>
      )}

      <AlertDialog open={!!pendingClear} onOpenChange={(o) => !o && setPendingClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ক্যাশড লগইন মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingClear === "ALL"
                ? "এই ডিভাইস থেকে সমস্ত অ্যাকাউন্টের অফলাইন credential মুছে ফেলা হবে। ইন্টারনেট ছাড়া কেউ আর সাইন ইন করতে পারবে না যতক্ষণ না অনলাইনে আবার লগইন করছেন।"
                : `${pendingClear} এর অফলাইন credential মুছে ফেলা হবে। এই অ্যাকাউন্ট দিয়ে ইন্টারনেট ছাড়া আর সাইন ইন করা যাবে না।`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              হ্যাঁ, মুছে ফেলুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}