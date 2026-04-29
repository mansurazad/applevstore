import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LocalDB } from "@/lib/localdb/adapter";
import type { LocalTableName } from "@/lib/localdb/adapter";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getActiveLocalDB } from "@/lib/localdb";
import { toast } from "sonner";

type CheckStatus = "pending" | "running" | "pass" | "fail" | "skip";

type CheckResult = {
  id: string;
  label: string;
  page: string;
  status: CheckStatus;
  detail?: string;
  durationMs?: number;
};

type Spec = {
  id: string;
  label: string;
  page: string;
  table: LocalTableName;
  factory: () => Record<string, any>;
  patch: Record<string, any>;
};

/**
 * One CRUD probe per CRUD-capable page. Each probe:
 *  1. creates a row in the local Dexie DB (with a __coverage_test marker)
 *  2. updates it locally
 *  3. verifies it shows up via listAll (read)
 *  4. soft-deletes it
 *  5. confirms a _dirty row is queued for sync
 * Test rows are tagged so they can be cleaned up after.
 */
const SPECS: Spec[] = [
  {
    id: "products",
    label: "Products CRUD",
    page: "Products",
    table: "products",
    factory: () => ({
      name: "__coverage_test_product",
      price: 1,
      cost: 1,
      stock_quantity: 1,
      condition: "new",
      imei: "000000000000000",
    }),
    patch: { stock_quantity: 0 },
  },
  {
    id: "customers",
    label: "Customers CRUD",
    page: "Customers",
    table: "customers",
    factory: () => ({ name: "__coverage_test_customer" }),
    patch: { phone: "0000000000" },
  },
  {
    id: "suppliers",
    label: "Suppliers CRUD",
    page: "Suppliers",
    table: "suppliers",
    factory: () => ({ name: "__coverage_test_supplier" }),
    patch: { phone: "0000000000" },
  },
  {
    id: "categories",
    label: "Categories CRUD",
    page: "Categories",
    table: "categories",
    factory: () => ({ name: "__coverage_test_category" }),
    patch: { description: "test" },
  },
  {
    id: "investment_sectors",
    label: "Investment sectors CRUD",
    page: "Investments",
    table: "investment_sectors",
    factory: () => ({ name: "__coverage_test_sector", is_default: false }),
    patch: { description: "test" },
  },
  {
    id: "activity_logs",
    label: "Activity log write",
    page: "Activity Log",
    table: "activity_logs",
    factory: () => ({
      action: "__coverage_test_action",
      action_type: "test",
      created_at: new Date().toISOString(),
    }),
    patch: { action: "__coverage_test_action_updated" },
  },
];

async function runSpec(spec: Spec): Promise<CheckResult> {
  const start = performance.now();
  try {
    // CREATE
    const created = await LocalDB.createLocal(spec.table, spec.factory());
    if (!created?.id) throw new Error("create returned no id");

    // READ
    const read = await LocalDB.getById(spec.table, created.id);
    if (!read) throw new Error("row not readable after create");

    // UPDATE
    const updated = await LocalDB.updateLocal(spec.table, created.id, spec.patch);
    if (!updated) throw new Error("update failed");

    // DIRTY QUEUE
    const dirty = await LocalDB.getDirtyRows(spec.table);
    if (!dirty.find((r: any) => r.id === created.id)) {
      throw new Error("row not queued for sync (_dirty != 1)");
    }

    // DELETE (soft)
    await LocalDB.deleteLocal(spec.table, created.id);
    const afterDelete = await LocalDB.getById(spec.table, created.id);
    if (afterDelete) throw new Error("soft-delete did not hide row");

    // hard remove the test row so it never gets pushed to the server
    const db = getActiveLocalDB();
    if (db) await (db as any)[spec.table].delete(created.id);

    return {
      id: spec.id,
      label: spec.label,
      page: spec.page,
      status: "pass",
      detail: "create / read / update / dirty / delete ✓",
      durationMs: Math.round(performance.now() - start),
    };
  } catch (e: any) {
    return {
      id: spec.id,
      label: spec.label,
      page: spec.page,
      status: "fail",
      detail: e?.message ?? String(e),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

export function OfflineCoverageTest() {
  const isOnline = useOnlineStatus();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [syncProbe, setSyncProbe] = useState<CheckResult | null>(null);

  const runAll = async () => {
    setRunning(true);
    const initial: CheckResult[] = SPECS.map((s) => ({
      id: s.id,
      label: s.label,
      page: s.page,
      status: "running",
    }));
    setResults(initial);

    const out: CheckResult[] = [];
    for (const spec of SPECS) {
      const r = await runSpec(spec);
      out.push(r);
      setResults([...out, ...initial.slice(out.length)]);
    }
    setResults(out);

    // Sync probe — only if online
    if (isOnline) {
      try {
        const db = getActiveLocalDB();
        const allDirty = db
          ? await Promise.all(
              SPECS.map((s) => LocalDB.getDirtyRows(s.table)),
            )
          : [];
        const dirtyTotal = allDirty.reduce((s, arr) => s + arr.length, 0);
        setSyncProbe({
          id: "sync",
          label: "Sync queue ready",
          page: "Sync engine",
          status: "pass",
          detail: `${dirtyTotal} dirty row(s) queued for next push.`,
        });
      } catch (e: any) {
        setSyncProbe({
          id: "sync",
          label: "Sync queue ready",
          page: "Sync engine",
          status: "fail",
          detail: e?.message ?? String(e),
        });
      }
    } else {
      setSyncProbe({
        id: "sync",
        label: "Sync queue ready",
        page: "Sync engine",
        status: "skip",
        detail: "অফলাইন — পুনরায় কানেক্ট হলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।",
      });
    }

    setRunning(false);
    const failed = out.filter((r) => r.status === "fail").length;
    if (failed === 0) {
      toast.success("সব অফলাইন কভারেজ চেক পাশ করেছে ✓");
    } else {
      toast.warning(`${failed} টি চেক ব্যর্থ হয়েছে — বিস্তারিত নিচে দেখুন`);
    }
  };

  const badgeFor = (s: CheckStatus) => {
    if (s === "pass") return <Badge className="bg-emerald-600">PASS</Badge>;
    if (s === "fail") return <Badge variant="destructive">FAIL</Badge>;
    if (s === "running") return <Badge variant="secondary">…</Badge>;
    if (s === "skip") return <Badge variant="outline">SKIP</Badge>;
    return <Badge variant="secondary">PENDING</Badge>;
  };

  const all = syncProbe ? [...results, syncProbe] : results;
  const passCount = all.filter((r) => r.status === "pass").length;
  const failCount = all.filter((r) => r.status === "fail").length;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            🧪 Offline Coverage Test
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            প্রতিটি CRUD পেইজ অফলাইনে read / write করতে পারে কি না এবং সিঙ্ক
            কিউতে যথাযথভাবে যাচ্ছে কি না — এক ক্লিকে যাচাই করো।
          </p>
        </div>
        <Button onClick={runAll} disabled={running}>
          {running ? "⏳ চলছে…" : "▶️ টেস্ট চালাও"}
        </Button>
      </div>

      {all.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground mb-2">
            ফলাফল:{" "}
            <span className="text-emerald-600 font-semibold">{passCount} pass</span>
            {failCount > 0 && (
              <>
                {" · "}
                <span className="text-destructive font-semibold">
                  {failCount} fail
                </span>
              </>
            )}
            {" · "}
            {!isOnline && <span>অফলাইন মোডে চলছে</span>}
            {isOnline && <span>অনলাইন</span>}
          </div>
          <ScrollArea className="h-72 rounded-md border p-3">
            <ul className="space-y-2 text-sm">
              {all.map((r) => (
                <li key={r.id} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.label}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({r.page})
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {typeof r.durationMs === "number" && (
                        <span className="text-[11px] text-muted-foreground">
                          {r.durationMs}ms
                        </span>
                      )}
                      {badgeFor(r.status)}
                    </span>
                  </div>
                  {r.detail && (
                    <p
                      className={
                        r.status === "fail"
                          ? "text-[11px] text-destructive"
                          : "text-[11px] text-muted-foreground"
                      }
                    >
                      {r.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </Card>
  );
}