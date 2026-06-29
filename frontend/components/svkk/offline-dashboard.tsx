"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  syncPoliciesCacheInBackground,
  syncAllPoliciesForOffline,
  isCacheSyncRunning,
} from "@/lib/svkk/offline/background-policy-cache";
import { estimateStorageQuota, type DownloadProgress } from "@/lib/svkk/offline/prepare-offline";
import { getOrCreateMeta } from "@/lib/svkk/offline/db";
import { getPendingMutationCounts } from "@/lib/svkk/offline/policy-data";
import { getRecentAnalytics } from "@/lib/svkk/offline/analytics-log";
import { clearOfflineData, countPendingMutations } from "@/lib/svkk/offline/clear-offline-data";
import {
  getConflictMutations,
  getFailedMutations,
  retryMutation,
  discardMutation,
  isSyncRunning,
} from "@/lib/svkk/offline/sync-engine";
import { getOfflineDb } from "@/lib/svkk/offline/db";
import { formatBytes, useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { QUOTA_WARN_RATIO } from "@/lib/svkk/offline/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function OfflineDashboard() {
  const { online } = useOfflineStatus();
  const [policyCount, setPolicyCount] = useState(0);
  const [scopeTotal, setScopeTotal] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState("");
  const [quotaWarn, setQuotaWarn] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [cacheSyncing, setCacheSyncing] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [recentEvents, setRecentEvents] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const db = getOfflineDb();
      setPolicyCount(await db.policies_list.count());
      const counts = await getPendingMutationCounts();
      setPending(counts.pending);
      setFailed(counts.failed);
      setConflicts(counts.conflicts);
      const meta = await getOrCreateMeta();
      setLastSync(meta.lastSyncAt);
      setScopeTotal(meta.scopePolicyTotal);
      const est = await estimateStorageQuota();
      setStorageLabel(
        est.quota > 0
          ? `${formatBytes(est.usage)} / ${formatBytes(est.quota)}`
          : formatBytes(est.usage),
      );
      setQuotaWarn(est.ratio >= QUOTA_WARN_RATIO);
      const events = await getRecentAnalytics(5);
      setRecentEvents(
        events.map((e) => {
          const at = new Date(e.at).toLocaleString();
          if (e.event === "sync_failed" && typeof e.payload.error === "string") {
            const status =
              typeof e.payload.httpStatus === "number" ? ` (${e.payload.httpStatus})` : "";
            return `sync_failed${status}: ${e.payload.error} — ${at}`;
          }
          if (e.event === "offline_download_failed" && typeof e.payload.error === "string") {
            return `offline_download_failed: ${e.payload.error} — ${at}`;
          }
          return `${e.event} — ${at}`;
        }),
      );
    } catch {
      /* idb unavailable */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    const onCacheSynced = () => void refresh();
    window.addEventListener("svkk-cache-synced", onCacheSynced);
    const cachePoll = setInterval(() => {
      setCacheSyncing(isCacheSyncRunning() || isSyncRunning());
    }, 1000);
    return () => {
      clearInterval(t);
      clearInterval(cachePoll);
      window.removeEventListener("svkk-cache-synced", onCacheSynced);
    };
  }, [refresh, online]);

  const handleDownloadAll = async () => {
    if (!online) {
      toast.error("Connect to the internet to download all policies.");
      return;
    }
    setDownloadingAll(true);
    try {
      const result = await syncAllPoliciesForOffline({ onProgress: setProgress });
      if (result.skipped && result.reason === "already_running") {
        toast.info("Download already in progress.");
      } else if (result.skipped) {
        toast.error(
          typeof result.reason === "string" && result.reason !== "error"
            ? result.reason
            : "Could not download all policies.",
        );
      } else {
        toast.success(
          `All ${result.totalCached?.toLocaleString() ?? policyCount} policies saved for offline use.`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download all failed");
    } finally {
      setDownloadingAll(false);
      setProgress(null);
    }
  };

  const handleDownloadRecent = async () => {
    if (!online) {
      toast.error("Connect to the internet to refresh policies.");
      return;
    }
    setDownloading(true);
    try {
      const result = await syncPoliciesCacheInBackground("manual", {
        forceFull: true,
        onProgress: setProgress,
      });
      if (result.skipped && result.reason === "already_running") {
        toast.info("Cache sync already in progress.");
      } else if (result.skipped) {
        toast.error("Could not refresh offline cache.");
      } else {
        toast.success("Recent policies refreshed.");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const handleClear = async () => {
    const pendingCount = await countPendingMutations();
    await clearOfflineData({ hadPendingMutations: pendingCount > 0 });
    setClearOpen(false);
    toast.success("Offline data cleared.");
    await refresh();
  };

  const conflictList = conflicts > 0;

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Offline Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              Policies cached: {policyCount.toLocaleString()}
              {scopeTotal != null && scopeTotal > policyCount
                ? ` / ${scopeTotal.toLocaleString()}`
                : scopeTotal != null && scopeTotal === policyCount
                  ? " (all)"
                  : ""}
            </div>
            <div>
              Pending sync: {pending + failed}
              {failed > 0 ? ` (${failed} failed)` : ""}
            </div>
            <div>Conflicts: {conflicts}</div>
            <div>
              Last sync:{" "}
              {lastSync ? new Date(lastSync).toLocaleString() : "—"}
            </div>
          </div>
          <div className={quotaWarn ? "text-amber-600 font-medium" : ""}>
            Storage used: {storageLabel || "—"}
            {quotaWarn ? " — Storage almost full." : ""}
          </div>
          {online && (
            <p className="text-muted-foreground text-xs">
              Policies and pending changes sync automatically while online
              {cacheSyncing ? " (syncing now…)" : ""}.
              {failed > 0
                ? ` Upload failed for ${failed} change(s) — see details below and use Retry.`
                : pending > 0 && !cacheSyncing
                  ? ` ${pending} change(s) queued — uploading in background.`
                  : scopeTotal != null && policyCount >= scopeTotal
                    ? " All policies in your scope are on this device."
                    : " Download all policies for full offline access (all years)."}
            </p>
          )}
          {!online && (
            <p className="text-muted-foreground text-xs">
              You are offline. Changes save locally and sync when connected.
            </p>
          )}
          {recentEvents.length > 0 && (
            <ul className="text-muted-foreground text-xs">
              {recentEvents.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {(downloading || downloadingAll) && progress && (
            <div className="space-y-1">
              <p className="text-xs">{progress.message}</p>
              <Progress
                value={
                  progress.total > 0 ? (progress.current / progress.total) * 100 : 0
                }
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void handleDownloadAll()}
              disabled={downloading || downloadingAll || !online}
            >
              Download all policies
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleDownloadRecent()}
              disabled={downloading || downloadingAll || !online}
            >
              Refresh recent
            </Button>
            <Button size="sm" variant="outline" onClick={() => setClearOpen(true)}>
              Clear offline data
            </Button>
          </div>
          {conflictList && <ConflictList onRetry={refresh} />}
          {failed > 0 && <FailedSyncList onRetry={refresh} />}
        </CardContent>
      </Card>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear offline data?</DialogTitle>
            <DialogDescription>
              This removes all cached policies and pending changes not yet uploaded. Wait until
              pending sync reaches 0, or those changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleClear()}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FailedSyncList({ onRetry }: { onRetry: () => void }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getFailedMutations>>>([]);
  const { online } = useOfflineStatus();

  useEffect(() => {
    const load = () => void getFailedMutations().then(setItems);
    load();
    window.addEventListener("svkk-cache-synced", load);
    return () => window.removeEventListener("svkk-cache-synced", load);
  }, []);

  if (!items.length) return null;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
      <p className="font-medium text-destructive">Upload failed</p>
      <p className="text-muted-foreground mt-1">
        Sync ran but the server rejected this change (or the API was unreachable). Fix the issue,
        then retry{online ? "" : " when online"}.
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((m) => (
          <li key={m.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {m.kind} {m.policyId ?? m.clientTempId}
                {m.httpStatus ? ` (HTTP ${m.httpStatus})` : ""}
              </span>
              <Button
                size="sm"
                variant="link"
                className="h-auto p-0"
                disabled={!online}
                onClick={() =>
                  void retryMutation(m.id).then((r) => {
                    if (!r.ok) {
                      toast.error(r.message ?? "Retry failed");
                      return;
                    }
                    toast.success("Change uploaded.");
                    onRetry();
                  })
                }
              >
                Retry
              </Button>
              <Button
                size="sm"
                variant="link"
                className="h-auto p-0 text-destructive"
                onClick={() => void discardMutation(m.id).then(onRetry)}
              >
                Discard
              </Button>
            </div>
            {m.lastError ? (
              <p className="text-muted-foreground break-words">
                {m.lastError}
                {/chart does not belong to policy type/i.test(m.lastError) ? (
                  <>
                    {" "}
                    — Policy type and premium chart did not match (often after changing Policy
                    Type while offline). Click Retry while online to fix automatically.
                  </>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConflictList({ onRetry }: { onRetry: () => void }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getConflictMutations>>>([]);
  const { online } = useOfflineStatus();

  useEffect(() => {
    void getConflictMutations().then(setItems);
  }, []);

  if (!items.length) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950">
      <p className="font-medium">Sync conflict</p>
      <p className="text-muted-foreground mt-1">
        The server copy changed after your offline edit (e.g. you saved again online). Retry applies
        your queued changes on top of the latest server version{online ? "" : " — connect first"}.
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span>
              {m.kind} {m.policyId ?? m.clientTempId}
            </span>
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0"
              disabled={!online}
              onClick={() =>
                void retryMutation(m.id).then((r) => {
                  if (!r.ok) {
                    toast.error(r.message ?? "Retry failed");
                    return;
                  }
                  toast.success("Conflict resolved — changes synced.");
                  onRetry();
                })
              }
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-destructive"
              onClick={() => void discardMutation(m.id).then(onRetry)}
            >
              Discard
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
