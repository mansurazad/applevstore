import { getActiveLocalDB } from "@/lib/localdb";
import type { SyncConflict } from "@/lib/localdb/schema";
import type { LocalTableName } from "@/lib/localdb/adapter";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Record a conflict between a local dirty row and a server row. */
export async function recordConflict(input: {
  table: string;
  row_id: string;
  local: any;
  remote: any;
}): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  // De-dup: if there's already an unresolved conflict for the same row, refresh it.
  const existing = (await (db as any).sync_conflicts
    .filter(
      (c: SyncConflict) =>
        c.table === input.table && c.row_id === input.row_id && c.resolved !== 1
    )
    .toArray()) as SyncConflict[];

  if (existing.length > 0) {
    const top = existing[0];
    await (db as any).sync_conflicts.put({
      ...top,
      local: input.local,
      remote: input.remote,
      detected_at: new Date().toISOString(),
    });
    // remove duplicates if any
    if (existing.length > 1) {
      await (db as any).sync_conflicts.bulkDelete(existing.slice(1).map((c) => c.id));
    }
    return;
  }

  await (db as any).sync_conflicts.put({
    id: newId(),
    table: input.table,
    row_id: input.row_id,
    local: input.local,
    remote: input.remote,
    detected_at: new Date().toISOString(),
    resolved: 0,
    resolution: null,
  });
}

export async function listUnresolvedConflicts(): Promise<SyncConflict[]> {
  const db = getActiveLocalDB();
  if (!db) return [];
  const rows = (await (db as any).sync_conflicts
    .filter((c: SyncConflict) => c.resolved !== 1)
    .toArray()) as SyncConflict[];
  return [...rows].sort(
    (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
  );
}

export async function countUnresolvedConflicts(): Promise<number> {
  const list = await listUnresolvedConflicts();
  return list.length;
}

/**
 * Resolve a conflict by choosing a side.
 *  - "remote": overwrite local with server row, clears _dirty.
 *  - "local":  keep local (mark dirty so next push wins) and bump updated_at past remote.
 */
export async function resolveConflict(
  conflictId: string,
  side: "local" | "remote"
): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  const conflict: SyncConflict | undefined = await (db as any).sync_conflicts.get(conflictId);
  if (!conflict) return;

  const localTable = (db as any)[conflict.table as LocalTableName];
  if (!localTable) return;

  if (side === "remote") {
    await localTable.put({
      ...conflict.remote,
      _dirty: 0,
      _deleted: 0,
      _localOnly: 0,
      _syncedAt: new Date().toISOString(),
    });
  } else {
    // Keep local but ensure its updated_at is newer than remote so push wins.
    const now = new Date().toISOString();
    const remoteTs: string =
      conflict.remote?.updated_at ?? conflict.remote?.created_at ?? "";
    const newer = now > remoteTs ? now : new Date(Date.now() + 1000).toISOString();
    await localTable.put({
      ...conflict.local,
      updated_at: newer,
      _dirty: 1,
    });
  }

  await (db as any).sync_conflicts.put({
    ...conflict,
    resolved: 1,
    resolution: side,
  });
}

export async function clearResolvedConflicts(): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  const resolved = (await (db as any).sync_conflicts
    .filter((c: SyncConflict) => c.resolved === 1)
    .toArray()) as SyncConflict[];
  await (db as any).sync_conflicts.bulkDelete(resolved.map((c) => c.id));
}