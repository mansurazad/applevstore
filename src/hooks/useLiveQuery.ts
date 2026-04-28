import { useLiveQuery as useDexieLiveQuery } from "dexie-react-hooks";
import { useLocalDB } from "@/lib/localdb/LocalDBProvider";

/**
 * Reactive live query against the per-user Dexie DB.
 * Re-runs automatically when the underlying tables change (local writes
 * OR pulls from the sync engine).
 *
 * Returns `undefined` while the DB is initialising or before the first
 * query resolves — same semantics as `dexie-react-hooks` useLiveQuery.
 *
 * Example:
 *   const products = useLiveQuery(() => db.products.list(), []);
 */
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: any[] = []
): T | undefined {
  const { ready, db } = useLocalDB();
  return useDexieLiveQuery(async () => {
    if (!ready || !db) return undefined as unknown as T;
    return await querier();
    // Rerun whenever DB identity or external deps change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, db, ...deps]);
}