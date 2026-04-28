import { supabase } from "@/integrations/supabase/client";
import { getActiveLocalDB } from "@/lib/localdb";
import type { LocalTableName } from "@/lib/localdb/adapter";
import { SYNC_TABLES, SERVER_WINS_FIELDS, getTimestampField } from "./tables";

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

        // Build merged row: start from local (preserve dirty edits)
        const merged: any = { ...local };

        // Always overwrite server-wins fields
        for (const f of serverWins) {
          merged[f] = serverRow[f];
        }

        // If server is newer overall, accept server fields except those the
        // local user just edited (local wins for non-server-wins keys).
        if (serverIsNewer) {
          for (const k of Object.keys(serverRow)) {
            if (k.startsWith("_")) continue;
            if (serverWins.includes(k)) continue;
            // keep local edit only if local row was created after server row
            // → otherwise prefer server
            if (localTs && localTs > rowTs) continue;
            merged[k] = serverRow[k];
          }
        }

        await localTable.put(merged);
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
  let total = 0;
  for (const t of SYNC_TABLES) {
    try {
      total += await pullTable(t);
    } catch (e) {
      console.warn(`[sync:pull] ${t} threw`, e);
    }
  }
  return total;
}