import { supabase } from "@/integrations/supabase/client";
import { getActiveLocalDB } from "@/lib/localdb";
import type { LocalTableName } from "@/lib/localdb/adapter";
import { SYNC_TABLES, SERVER_WINS_FIELDS, getTimestampField } from "./tables";
import { recordConflict } from "./conflicts";

/**
 * Read last pull timestamp for a table.
 */
async function getLastPulledAt(table: LocalTableName): Promise<string | null> {
  const db = getActiveLocalDB();
  if (!db) return null;
  const row = await db.sync_state.get(table);
  return row?.lastPulledAt ?? null;
}

async function setLastPulledAt(table: LocalTableName, ts: string) {
  const db = getActiveLocalDB();
  if (!db) return;
  const existing = await db.sync_state.get(table);
  await db.sync_state.put({ ...(existing ?? { table }), table, lastPulledAt: ts });
}

/**
 * Pull a single table's delta from Supabase and merge into local DB.
 * Conflict policy:
 *  - Soft deletes from server (we don't track those — server hard-deletes)
 *  - Server-wins fields override local
 *  - Otherwise LWW by updated_at
 */
export async function pullTable(table: LocalTableName): Promise<number> {
  const db = getActiveLocalDB();
  if (!db) return 0;

  const tsField = getTimestampField(table);
  const since = await getLastPulledAt(table);

  let query = (supabase.from(table as any) as any).select("*");
  if (since) {
    query = query.gt(tsField, since);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`[sync:pull] ${table} failed`, error.message);
    return 0;
  }
  if (!data || data.length === 0) {
    // still bump lastPulledAt to "now" so we don't refetch the same window
    if (!since) await setLastPulledAt(table, new Date().toISOString());
    return 0;
  }

  const localTable = (db as any)[table];
  const serverWins = SERVER_WINS_FIELDS[table] ?? [];
  let maxTs = since ?? "";

  await db.transaction("rw", localTable, async () => {
    for (const serverRow of data as any[]) {
      const rowTs: string = serverRow[tsField] ?? new Date().toISOString();
      if (rowTs > maxTs) maxTs = rowTs;

      const local = await localTable.get(serverRow.id);

      // No local copy → take server as-is
      if (!local) {
        await localTable.put({
          ...serverRow,
          _dirty: 0,
          _deleted: 0,
          _localOnly: 0,
          _syncedAt: new Date().toISOString(),
        });
        continue;
      }

      // Local is dirty (unsynced) → merge with conflict rules
      if (local._dirty === 1) {
        const localTs: string = local[tsField] ?? local.updated_at ?? "";
        const serverIsNewer = rowTs > localTs;

        // Detect a real conflict: server has been independently updated
        // *after* the local row was last edited → user must choose.
        if (serverIsNewer) {
          // Apply server-wins fields immediately (e.g. stock_quantity), but
          // record the rest of the row as a conflict for manual resolution.
          const merged: any = { ...local };
          for (const f of serverWins) merged[f] = serverRow[f];
          await localTable.put(merged);
          await recordConflict({
            table,
            row_id: serverRow.id,
            local,
            remote: serverRow,
          });
        } else {
          // Local is newer or same — keep local, just refresh server-wins fields.
          const merged: any = { ...local };
          for (const f of serverWins) merged[f] = serverRow[f];
          await localTable.put(merged);
        }
      } else {
        // Clean local → just take server version
        await localTable.put({
          ...serverRow,
          _dirty: 0,
          _deleted: 0,
          _localOnly: 0,
          _syncedAt: new Date().toISOString(),
        });
      }
    }
  });

  await setLastPulledAt(table, maxTs || new Date().toISOString());
  return data.length;
}

/** Pull every sync table. Returns total rows merged. */
export async function pullAll(): Promise<number> {
  const detail = await pullAllDetailed();
  return detail.total;
}

export type PullDetail = {
  total: number;
  perTable: Array<{ table: LocalTableName; rows: number; error?: string }>;
};

/**
 * Same as pullAll() but returns a per-table breakdown so callers (e.g. the
 * manual "Refresh cache" panel) can show a detailed result summary.
 */
export async function pullAllDetailed(): Promise<PullDetail> {
  let total = 0;
  const perTable: PullDetail["perTable"] = [];
  for (const t of SYNC_TABLES) {
    try {
      const rows = await pullTable(t);
      total += rows;
      perTable.push({ table: t, rows });
    } catch (e: any) {
      console.warn(`[sync:pull] ${t} threw`, e);
      perTable.push({ table: t, rows: 0, error: e?.message ?? String(e) });
    }
  }
  return { total, perTable };
}