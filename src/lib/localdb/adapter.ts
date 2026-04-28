import type { Table } from "dexie";
import { getActiveLocalDB, type AppleStoreLocalDB } from "./index";

/**
 * Tables managed by the local DB. Keep in sync with AppleStoreLocalDB.
 */
export type LocalTableName =
  | "products"
  | "customers"
  | "suppliers"
  | "categories"
  | "sales"
  | "sale_items"
  | "due_payments"
  | "returns"
  | "investment_sectors"
  | "investment_entries"
  | "investment_incomes"
  | "shop_settings"
  | "activity_logs";

function ensureDB(): AppleStoreLocalDB {
  const db = getActiveLocalDB();
  if (!db) {
    throw new Error("Local DB not initialised — user not authenticated yet.");
  }
  return db;
}

function table(name: LocalTableName): Table<any, string> {
  return (ensureDB() as any)[name] as Table<any, string>;
}

function newId(): string {
  // crypto.randomUUID is widely available in modern browsers + Tauri webviews
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/* ----------------------------- READ helpers ----------------------------- */

export async function listAll<T = any>(name: LocalTableName): Promise<T[]> {
  const rows = await table(name).filter((r: any) => r._deleted !== 1).toArray();
  return rows as T[];
}

export async function getById<T = any>(
  name: LocalTableName,
  id: string
): Promise<T | undefined> {
  const row = await table(name).get(id);
  return row && (row as any)._deleted !== 1 ? (row as T) : undefined;
}

export async function listWhere<T = any>(
  name: LocalTableName,
  predicate: (row: T) => boolean
): Promise<T[]> {
  const all = await listAll<T>(name);
  return all.filter(predicate);
}

/* ----------------------------- WRITE helpers ---------------------------- */

export async function createLocal<T extends Record<string, any>>(
  name: LocalTableName,
  data: Partial<T>
): Promise<T> {
  const now = new Date().toISOString();
  const row: any = {
    id: data.id ?? newId(),
    created_at: data.created_at ?? now,
    updated_at: now,
    ...data,
    _dirty: 1,
    _deleted: 0,
    _localOnly: data.id ? 0 : 1,
  };
  await table(name).put(row);
  return row as T;
}

export async function updateLocal<T extends Record<string, any>>(
  name: LocalTableName,
  id: string,
  patch: Partial<T>
): Promise<T | undefined> {
  const t = table(name);
  const existing = await t.get(id);
  if (!existing) return undefined;
  const merged: any = {
    ...existing,
    ...patch,
    id,
    updated_at: new Date().toISOString(),
    _dirty: 1,
  };
  await t.put(merged);
  return merged as T;
}

export async function deleteLocal(name: LocalTableName, id: string): Promise<void> {
  const t = table(name);
  const existing = await t.get(id);
  if (!existing) return;
  await t.put({
    ...existing,
    _deleted: 1,
    _dirty: 1,
    updated_at: new Date().toISOString(),
  });
}

/* ---------------------- Sync-engine support helpers --------------------- */

/** Replace local row with server version (used by pull). Clears dirty flag. */
export async function applyServerRow(
  name: LocalTableName,
  serverRow: any
): Promise<void> {
  if (!serverRow?.id) return;
  await table(name).put({
    ...serverRow,
    _dirty: 0,
    _deleted: 0,
    _localOnly: 0,
    _syncedAt: new Date().toISOString(),
  });
}

/** Bulk pull replacement (for full table refresh). */
export async function bulkApplyServerRows(
  name: LocalTableName,
  rows: any[]
): Promise<void> {
  if (!rows.length) return;
  const stamped = rows.map((r) => ({
    ...r,
    _dirty: 0,
    _deleted: 0,
    _localOnly: 0,
    _syncedAt: new Date().toISOString(),
  }));
  await table(name).bulkPut(stamped);
}

/** All rows that need to be pushed to the server. */
export async function getDirtyRows<T = any>(name: LocalTableName): Promise<T[]> {
  return (await table(name).filter((r: any) => r._dirty === 1).toArray()) as T[];
}

/** Mark a row as successfully synced. */
export async function markSynced(
  name: LocalTableName,
  id: string,
  serverRow?: any
): Promise<void> {
  const t = table(name);
  const existing = await t.get(id);
  if (!existing) return;
  await t.put({
    ...existing,
    ...(serverRow ?? {}),
    _dirty: 0,
    _localOnly: 0,
    _syncedAt: new Date().toISOString(),
  });
}

export const LocalDB = {
  listAll,
  getById,
  listWhere,
  createLocal,
  updateLocal,
  deleteLocal,
  applyServerRow,
  bulkApplyServerRows,
  getDirtyRows,
  markSynced,
};