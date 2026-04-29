import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LocalDB } from "@/lib/localdb/adapter";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";
import { getCurrentUserId } from "@/lib/auth/offlineAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";

interface DueCollectionProps {
  saleId: string;
  currentDue: number;
}

export function DueCollection({ saleId, currentDue }: DueCollectionProps) {
  const queryClient = useQueryClient();
  const { ready } = useLocalDB();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  // Local-first read so the panel works offline.
  const payments = useLiveQuery(
    async () => {
      const all = await LocalDB.listWhere<any>(
        "due_payments",
        (r) => r.sale_id === saleId
      );
      return all.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    [ready, saleId]
  );

  const collectMutation = useMutation({
    mutationFn: async () => {
      const collectAmount = Number(amount);
      if (collectAmount <= 0 || collectAmount > currentDue) {
        throw new Error("অবৈধ পরিমাণ");
      }

      const userId = await getCurrentUserId();

      // 1) Insert payment locally — sync engine pushes when online.
      await LocalDB.createLocal("due_payments", {
        sale_id: saleId,
        amount: collectAmount,
        payment_method: paymentMethod,
        notes: notes || null,
        collected_by: userId,
      });

      // 2) Update the sale row locally with new paid/due totals.
      const sale = await LocalDB.getById<any>("sales", saleId);
      const newDue = currentDue - collectAmount;
      const newPaid = Number(sale?.paid_amount || 0) + collectAmount;
      await LocalDB.updateLocal("sales", saleId, {
        due_amount: newDue,
        paid_amount: newPaid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["due-payments", saleId] });
      toast.success("বাকি আদায় সফল হয়েছে!");
      setAmount("");
      setNotes("");
    },
    onError: (err: any) => toast.error(err.message || "বাকি আদায় ব্যর্থ"),
  });

  if (currentDue <= 0) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-destructive">💳 বাকি আদায়</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={`সর্বোচ্চ ৳${currentDue}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 h-8 text-sm"
            max={currentDue}
          />
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">নগদ</SelectItem>
              <SelectItem value="card">কার্ড</SelectItem>
              <SelectItem value="mobile">মোবাইল</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea placeholder="নোটস (ঐচ্ছিক)" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs h-16" />
        <Button
          size="sm"
          className="w-full"
          onClick={() => collectMutation.mutate()}
          disabled={!amount || Number(amount) <= 0 || Number(amount) > currentDue || collectMutation.isPending}
        >
          {collectMutation.isPending ? "প্রক্রিয়াকরণ..." : "বাকি আদায় করুন"}
        </Button>

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-medium mb-2 text-muted-foreground">আদায়ের ইতিহাস:</p>
            {payments.map(p => (
              <div key={p.id} className="flex justify-between items-center text-xs py-1">
                <span className="text-muted-foreground">
                  {format(new Date(p.created_at), 'dd MMM yyyy, hh:mm a', { locale: bn })}
                </span>
                <span className="font-semibold text-accent">৳{Number(p.amount).toLocaleString('bn-BD')}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
