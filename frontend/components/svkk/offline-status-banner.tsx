"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrCreateMeta } from "@/lib/svkk/offline/db";
import { getPendingMutationCounts, isPremiumSnapshotStale } from "@/lib/svkk/offline/policy-data";
import { isCacheSyncRunning } from "@/lib/svkk/offline/background-policy-cache";
import { isSyncRunning } from "@/lib/svkk/offline/sync-engine";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { PREMIUM_STALE_WARN_DAYS } from "@/lib/svkk/offline/types";

export function OfflineStatusBanner() {
  const { online, hasCache } = useOfflineStatus();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [premiumStale, setPremiumStale] = useState(false);
  const [syncActive, setSyncActive] = useState(false);

  const refresh = useCallback(async () => {
    const meta = await getOrCreateMeta();
    setLastSync(meta.lastSyncAt);
    const counts = await getPendingMutationCounts();
    setPending(counts.pending);
    setFailed(counts.failed);
    setPremiumStale(await isPremiumSnapshotStale(PREMIUM_STALE_WARN_DAYS));
    setSyncActive(isSyncRunning() || isCacheSyncRunning());
  }, []);

  useEffect(() => {
    void refresh();
    const onSynced = () => void refresh();
    window.addEventListener("svkk-cache-synced", onSynced);
    window.addEventListener("svkk-premium-synced", onSynced);
    const poll = setInterval(() => void refresh(), 10_000);
    return () => {
      window.removeEventListener("svkk-cache-synced", onSynced);
      window.removeEventListener("svkk-premium-synced", onSynced);
      clearInterval(poll);
    };
  }, [refresh, online, hasCache]);

  if (!hasCache && online) return null;

  return (
    <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">Offline data</span>
        {!online && <span className="text-muted-foreground">— You are offline</span>}
        {lastSync && (
          <span className="text-muted-foreground">
            Last synced: {new Date(lastSync).toLocaleString()}
          </span>
        )}
        {online && syncActive && (
          <span className="text-muted-foreground">— Syncing in background…</span>
        )}
        {online && !syncActive && failed > 0 && (
          <span className="text-destructive">
            — {failed} change(s) failed to upload (see Offline Status below)
          </span>
        )}
        {online && !syncActive && failed === 0 && pending > 0 && (
          <span className="text-muted-foreground">
            — {pending} change(s) queued; uploading automatically
          </span>
        )}
        {online && !syncActive && pending === 0 && failed === 0 && (
          <span className="text-muted-foreground">— Syncs automatically while online</span>
        )}
      </div>
      {premiumStale && !online && (
        <p className="text-amber-600 mt-1 text-xs">
          Premium rates in offline cache may be outdated. Connect to refresh automatically.
        </p>
      )}
    </div>
  );
}
