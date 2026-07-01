import { getOrCreateMeta } from "./db";
import {
  downloadPoliciesForOffline,
  downloadAllPoliciesForOffline,
  isDownloadBlockedByQuota,
  prefetchReferenceNoPool,
  type DownloadProgress,
} from "./prepare-offline";
import { syncPendingMutations } from "./sync-engine";
import { refreshPremiumSnapshotFromServer } from "./offline-reference";
import {
  BACKGROUND_CACHE_MIN_GAP_MS,
  BACKGROUND_CACHE_SYNC_INTERVAL_MS,
} from "./types";

export type CacheSyncTrigger = "mount" | "online" | "periodic" | "manual";

export type CacheSyncResult = {
  skipped?: boolean;
  reason?: string;
  mode?: "full" | "delta";
  policyCount?: number;
};

let cacheSyncInProgress = false;
let lastBackgroundRunAt = 0;

export function isCacheSyncRunning(): boolean {
  return cacheSyncInProgress;
}

function dispatchCacheSynced(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("svkk-cache-synced"));
  }
}

/**
 * Keeps IndexedDB aligned with the server while online.
 * - First run: full bundle download (last 2 fiscal years / 1000 policies)
 * - Later runs: delta via updatedAfter=lastSyncAt
 */
export async function syncPoliciesCacheInBackground(
  trigger: CacheSyncTrigger,
  opts?: {
    /** Manual refresh — full re-download, ignores throttle */
    forceFull?: boolean;
    onProgress?: (p: DownloadProgress) => void;
  },
): Promise<CacheSyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { skipped: true, reason: "offline" };
  }

  if (cacheSyncInProgress) {
    return { skipped: true, reason: "already_running" };
  }

  const now = Date.now();
  const isBackground = trigger === "periodic" || trigger === "online" || trigger === "mount";
  if (
    isBackground &&
    !opts?.forceFull &&
    lastBackgroundRunAt > 0 &&
    now - lastBackgroundRunAt < BACKGROUND_CACHE_MIN_GAP_MS
  ) {
    return { skipped: true, reason: "throttled" };
  }

  cacheSyncInProgress = true;

  try {
    if (await isDownloadBlockedByQuota()) {
      return { skipped: true, reason: "quota_full" };
    }

    const meta = await getOrCreateMeta();
    const useDelta = !opts?.forceFull && Boolean(meta.lastSyncAt);

    if (useDelta) {
      const bundle = await downloadPoliciesForOffline({
        updatedAfter: meta.lastSyncAt!,
      });
      lastBackgroundRunAt = Date.now();
      await refreshPremiumSnapshotFromServer();
      await syncPendingMutations(trigger === "online" ? "online" : "periodic");
      dispatchCacheSynced();
      return { mode: "delta", policyCount: bundle.policies.length };
    }

    const bundle = await downloadPoliciesForOffline({
      onProgress: opts?.onProgress,
    });
    await prefetchReferenceNoPool(20);
    lastBackgroundRunAt = Date.now();
    await refreshPremiumSnapshotFromServer();
    await syncPendingMutations(trigger === "online" ? "online" : "periodic");
    dispatchCacheSynced();
    return { mode: "full", policyCount: bundle.policies.length };
  } catch {
    return { skipped: true, reason: "error" };
  } finally {
    cacheSyncInProgress = false;
  }
}

export { BACKGROUND_CACHE_SYNC_INTERVAL_MS };

/** Download every in-scope policy with full detail (batched). */
export async function syncAllPoliciesForOffline(opts?: {
  onProgress?: (p: DownloadProgress) => void;
}): Promise<{ skipped?: boolean; reason?: string; totalCached?: number; totalAvailable?: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { skipped: true, reason: "offline" };
  }
  if (cacheSyncInProgress) {
    return { skipped: true, reason: "already_running" };
  }

  cacheSyncInProgress = true;
  try {
    if (await isDownloadBlockedByQuota()) {
      return { skipped: true, reason: "quota_full" };
    }
    const result = await downloadAllPoliciesForOffline({ onProgress: opts?.onProgress });
    lastBackgroundRunAt = Date.now();
    await refreshPremiumSnapshotFromServer();
    await syncPendingMutations("manual");
    dispatchCacheSynced();
    return { totalCached: result.totalCached, totalAvailable: result.totalAvailable };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return { skipped: true, reason: msg };
  } finally {
    cacheSyncInProgress = false;
  }
}
