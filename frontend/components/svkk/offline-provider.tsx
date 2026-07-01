"use client";

import { useEffect } from "react";
import {
  BACKGROUND_CACHE_SYNC_INTERVAL_MS,
  syncPoliciesCacheInBackground,
} from "@/lib/svkk/offline/background-policy-cache";
import { handleOfflinePolicyLinkClick } from "@/lib/svkk/offline/navigate";
import { syncPendingMutations } from "@/lib/svkk/offline/sync-engine";
import { refreshPremiumSnapshotFromServer } from "@/lib/svkk/offline/offline-reference";
import { warmPolicyAppShellCache } from "@/lib/svkk/offline/warm-offline-shell";

/** Background policy cache sync + mutation sync while online. */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    document.addEventListener("click", handleOfflinePolicyLinkClick, true);

    const runCacheSync = (trigger: "mount" | "online" | "periodic") => {
      if (!navigator.onLine) return;
      void syncPoliciesCacheInBackground(trigger);
    };

    // Initial sync after login / app load
    runCacheSync("mount");
    void refreshPremiumSnapshotFromServer();
    void warmPolicyAppShellCache();

    const onCacheSynced = () => {
      void warmPolicyAppShellCache();
    };
    window.addEventListener("svkk-cache-synced", onCacheSynced);

    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => {
        runCacheSync("online");
      }, 2000);
    };
    window.addEventListener("online", onOnline);

    const cacheInterval = setInterval(() => {
      runCacheSync("periodic");
    }, BACKGROUND_CACHE_SYNC_INTERVAL_MS);

    const mutationInterval = setInterval(() => {
      if (navigator.onLine) {
        void syncPendingMutations("periodic");
      }
    }, 60_000);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SVKK_POLICY_SYNC") {
        void syncPendingMutations("bg");
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }

    return () => {
      document.removeEventListener("click", handleOfflinePolicyLinkClick, true);
      window.removeEventListener("svkk-cache-synced", onCacheSynced);
      clearTimeout(onlineTimer);
      window.removeEventListener("online", onOnline);
      clearInterval(cacheInterval);
      clearInterval(mutationInterval);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
    };
  }, []);

  return <>{children}</>;
}
