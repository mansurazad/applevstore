import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import { useOnlineStatus } from "./useOnlineStatus";
import { getActiveLocalDB } from "@/lib/localdb";

/**
 * Hybrid query helper: when online, runs `online()` (typically a Supabase
 * call) and writes the result through `cacheWrite()`. When offline, reads
 * from `offline()` (typically a Dexie query). Falls back to offline if
 * the online call throws.
 */
export function useOfflineQuery<T>(
  key: QueryKey,
  online: () => Promise<T>,
  offline: () => Promise<T>,
  cacheWrite?: (data: T) => Promise<void> | void,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">
) {
  const isOnline = useOnlineStatus();

  return useQuery<T>({
    queryKey: [...key, isOnline ? "online" : "offline"],
    queryFn: async () => {
      if (!isOnline) {
        return offline();
      }
      try {
        const data = await online();
        if (cacheWrite) {
          try {
            await cacheWrite(data);
          } catch (e) {
            console.warn("offline cache write failed", e);
          }
        }
        return data;
      } catch (e) {
        console.warn("online query failed, falling back to offline cache", e);
        return offline();
      }
    },
    ...options,
  });
}

/** Convenience: list all rows from a Dexie table (any). */
export async function readLocalTable<T = any>(name: string): Promise<T[]> {
  const db = getActiveLocalDB();
  if (!db) return [];
  const t = (db as any)[name];
  if (!t) return [];
  return (await t.toArray()) as T[];
}

/** Bulk replace cache for read-only mirror tables. */
export async function cacheReplace<T>(name: string, rows: T[]): Promise<void> {
  const db = getActiveLocalDB();
  if (!db) return;
  const t = (db as any)[name];
  if (!t) return;
  await t.clear();
  if (rows.length) {
    const stamp = new Date().toISOString();
    await t.bulkPut(rows.map((r: any) => ({ ...r, _cachedAt: stamp })));
  }
}