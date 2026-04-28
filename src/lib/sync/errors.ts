import { getActiveLocalDB } from "@/lib/localdb";
import type { SyncError } from "@/lib/localdb/schema";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Persist a sync failure for later review/retry. */
export async function logSyncError(input: {
  table: string;
  row_id?: string | null;
  operation: SyncError["operation"];
  message: string;
  payload?: any;
}): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  try {
    await (db as any).sync_errors.put({
      id: newId(),
      table: input.table,
      row_id: input.row_id ?? null,
      operation: input.operation,
      message: input.message,
      payload: input.payload ?? null,
      created_at: new Date().toISOString(),
      resolved: 0,
    });
  } catch (e) {
    console.warn("[sync:errors] failed to log", e);
  }
}

/** All unresolved errors, newest first. */
export async function listUnresolvedErrors(): Promise<SyncError[]> {
  const db = getActiveLocalDB();
  if (!db) return [];
  const all = await (db as any).sync_errors
    .filter((e: SyncError) => e.resolved !== 1)
    .toArray();
  return [...all].sort(
    (a: SyncError, b: SyncError) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function listAllErrors(): Promise<SyncError[]> {
  const db = getActiveLocalDB();
  if (!db) return [];
  const all = await (db as any).sync_errors.toArray();
  return [...all].sort(
    (a: SyncError, b: SyncError) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function markErrorResolved(id: string): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  const existing: SyncError | undefined = await (db as any).sync_errors.get(id);
  if (!existing) return;
  await (db as any).sync_errors.put({ ...existing, resolved: 1 });
}

export async function clearResolvedErrors(): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  const resolved: SyncError[] = await (db as any).sync_errors
    .filter((e: SyncError) => e.resolved === 1)
    .toArray();
  await (db as any).sync_errors.bulkDelete(resolved.map((r) => r.id));
}

export async function clearAllErrors(): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  await (db as any).sync_errors.clear();
}