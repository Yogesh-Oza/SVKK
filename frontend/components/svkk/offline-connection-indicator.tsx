"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";

/**
 * Global header pill shown when the browser reports no network.
 * Uses ping animation so offline status is visible at a glance.
 */
export function OfflineConnectionIndicator() {
  const { online, hasCache } = useOfflineStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || online) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
          aria-live="polite"
          aria-label="You are offline"
        >
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-80" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          </span>
          Offline
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-center">
        <p className="font-medium">You are offline</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {hasCache
            ? "Downloaded policies and the calculator still work. Saves queue until you reconnect."
            : "Some features need internet. Download policies while online for offline use."}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Status updates as soon as your browser detects no network (usually within a few seconds).
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
