import { pullAll } from "./pull";
import { pushAll } from "./push";

export type SyncResult = {
  pulled: number;
  pushed: number;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  error?: string;
};

let inflight: Promise<SyncResult> | null = null;

/**
 * Run a full sync cycle: push local changes first (so server has latest),
 * then pull server delta. Concurrent calls share the same in-flight promise.
 */
export async function runSyncCycle(): Promise<SyncResult> {
  if (inflight) return inflight;

  const startedAt = new Date().toISOString();

  inflight = (async () => {
    try {
      const pushed = await pushAll();
      const pulled = await pullAll();
      return {
        pulled,
        pushed,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: true,
      };
    } catch (e: any) {
      return {
        pulled: 0,
        pushed: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: false,
        error: e?.message ?? String(e),
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}