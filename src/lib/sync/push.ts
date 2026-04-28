import { supabase } from "@/integrations/supabase/client";
import { getActiveLocalDB } from "@/lib/localdb";
import type { LocalTableName } from "@/lib/localdb/adapter";
import { SYNC_TABLES, SERVER_WINS_FIELDS } from "./tables";
import { logSyncError } from "./errors";

/**
 * Strip Dexie-only metadata before sending to Supabase.
 * Also removes server-wins fields so we never overwrite authoritative values
 * (e.g. products.stock_quantity is mutated only by the dedicated POS path).
 */
function cleanForServer(table: LocalTableName, row: any): any {
  const out: any = { ...row };
  delete out._dirty;
  delete out._deleted;
  delete out._syncedAt;
  delete out._localOnly;

  // Drop server-wins fields on update so the server keeps its authoritative copy.
  // Note: for INSERTs we still send them (e.g. initial stock_quantity).
  return out;
}

async function markRowSynced(table: LocalTableName, id: string) {
  const db = getActiveLocalDB();
  if (!db) return;
  const localTable = (db as any)[table];
  const existing = await localTable.get(id);
  if (!existing) return;
  await localTable.put({
    ...existing,
    _dirty: 0,
    _localOnly: 0,
    _syncedAt: new Date().toISOString(),
  });
}

async function removeLocalRow(table: LocalTableName, id: string) {
  const db = getActiveLocalDB();
  if (!db) return;
  await (db as any)[table].delete(id);
}

/**
 * Push all dirty rows of one table to Supabase.
 * Returns number of rows successfully pushed.
 */
export async function pushTable(table: LocalTableName): Promise<number> {
  const db = getActiveLocalDB();
  if (!db) return 0;
  const localTable = (db as any)[table];

  const dirty: any[] = await localTable.filter((r: any) => r._dirty === 1).toArray();
  if (!dirty.length) return 0;

  let pushed = 0;
  const serverWins = SERVER_WINS_FIELDS[table] ?? [];

  for (const row of dirty) {
    try {
      // Soft-deleted → DELETE on server
      if (row._deleted === 1) {
        const { error } = await (supabase.from(table as any) as any)
          .delete()
          .eq("id", row.id);
        if (error) {
          console.warn(`[sync:push:delete] ${table}/${row.id}`, error.message);
          await logSyncError({
            table,
            row_id: row.id,
            operation: "delete",
            message: error.message,
            payload: row,
          });
          continue;
        }
        await removeLocalRow(table, row.id);
        pushed++;
        continue;
      }

      const payload = cleanForServer(table, row);

      // For UPDATE path strip server-wins fields so we don't overwrite stock.
      const isInsert = row._localOnly === 1;
      if (!isInsert) {
        for (const f of serverWins) delete payload[f];
      }

      const { data, error } = await (supabase.from(table as any) as any)
        .upsert(payload, { onConflict: "id" })
        .select()
        .maybeSingle();

      if (error) {
        console.warn(`[sync:push:upsert] ${table}/${row.id}`, error.message);
        await logSyncError({
          table,
          row_id: row.id,
          operation: table === "products" ? "stock" : "push",
          message: error.message,
          payload: payload,
        });
        continue;
      }

      // Refresh local with the server's canonical row (includes server-wins values)
      await localTable.put({
        ...(data ?? row),
        _dirty: 0,
        _deleted: 0,
        _localOnly: 0,
        _syncedAt: new Date().toISOString(),
      });
      pushed++;
    } catch (e: any) {
      console.warn(`[sync:push] ${table}/${row.id} threw`, e?.message ?? e);
      await logSyncError({
        table,
        row_id: row.id,
        operation: "push",
        message: e?.message ?? String(e),
        payload: row,
      });
    }
  }

  return pushed;
}

export async function pushAll(): Promise<number> {
  let total = 0;
  for (const t of SYNC_TABLES) {
    try {
      total += await pushTable(t);
    } catch (e) {
      console.warn(`[sync:push] ${t} threw`, e);
    }
  }
  return total;
}