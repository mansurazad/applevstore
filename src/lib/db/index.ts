/**
 * High-level offline-first data API.
 *
 * Reads always come from the local Dexie DB (instant, works offline).
 * Writes go to the local DB with `_dirty=1`, then trigger a background sync
 * that pushes to Supabase. UI never blocks on the network.
 *
 * The sync engine (src/lib/sync) keeps the local DB fresh in the
 * background: on login, on reconnect, every 60s, and after each write.
 */
import {
  listAll,
  getById,
  listWhere,
  createLocal,
  updateLocal,
  deleteLocal,
  type LocalTableName,
} from "@/lib/localdb/adapter";
import { runSyncCycle } from "@/lib/sync/engine";

/** Fire-and-forget sync. Errors are swallowed (engine logs them). */
function triggerSync() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  // microtask so the caller's await resolves first
  queueMicrotask(() => {
    void runSyncCycle().catch(() => {});
  });
}

function makeRepo<T extends Record<string, any>>(name: LocalTableName) {
  return {
    list: () => listAll<T>(name),
    get: (id: string) => getById<T>(name, id),
    where: (predicate: (row: T) => boolean) => listWhere<T>(name, predicate),
    create: async (data: Partial<T>) => {
      const row = await createLocal<T>(name, data);
      triggerSync();
      return row;
    },
    update: async (id: string, patch: Partial<T>) => {
      const row = await updateLocal<T>(name, id, patch);
      triggerSync();
      return row;
    },
    remove: async (id: string) => {
      await deleteLocal(name, id);
      triggerSync();
    },
  };
}

export const db = {
  products: makeRepo("products"),
  customers: makeRepo("customers"),
  suppliers: makeRepo("suppliers"),
  categories: makeRepo("categories"),
  sales: makeRepo("sales"),
  saleItems: makeRepo("sale_items"),
  duePayments: makeRepo("due_payments"),
  returns: makeRepo("returns"),
  investmentSectors: makeRepo("investment_sectors"),
  investmentEntries: makeRepo("investment_entries"),
  investmentIncomes: makeRepo("investment_incomes"),
  shopSettings: makeRepo("shop_settings"),
  activityLogs: makeRepo("activity_logs"),
};

export type DB = typeof db;