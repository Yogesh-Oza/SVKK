"use client";

import { useCallback, useEffect, useState } from "react";
import { syncPendingMutations } from "./sync-engine";

export type OfflineStatus = {
  online: boolean;
  hasCache: boolean;
};

export function useOfflineStatus(): OfflineStatus {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [hasCache, setHasCache] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncPendingMutations("online");
      void import("./background-policy-cache").then(({ syncPoliciesCacheInBackground }) =>
        syncPoliciesCacheInBackground("online"),
      );
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    void import("./policy-data").then(({ hasOfflineCache }) =>
      hasOfflineCache().then(setHasCache),
    );
  }, [online]);

  return { online, hasCache };
}

export function useOfflineSyncOnMount(): void {
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void syncPendingMutations("periodic");
    }
  }, []);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
