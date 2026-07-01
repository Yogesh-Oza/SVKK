"use client";

import { SerwistProvider } from "@serwist/next/react";
import { useEffect } from "react";
import { isServiceWorkerEnabled } from "@/lib/svkk/offline/service-worker-enabled";

const SW_URL = "/sw.js";

/** Registers /sw.js for offline page caching (production, or dev with NEXT_PUBLIC_ENABLE_SW=true). */
export function SerwistProviderWrapper({ children }: { children: React.ReactNode }) {
  const disabled = !isServiceWorkerEnabled();

  useEffect(() => {
    if (disabled) return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        if (reg) {
          // Force a byte-check against /sw.js now instead of waiting for the
          // browser's own periodic check — stale precache (e.g. old /policies
          // shell) otherwise lingers until the browser decides to look again.
          if (navigator.onLine) void reg.update();
          return;
        }

        await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      } catch (error) {
        console.error("[SVKK] Service worker registration failed:", error);
      }
    })();
  }, [disabled]);

  return (
    <SerwistProvider swUrl={SW_URL} disable={disabled} register reloadOnOnline>
      {children}
    </SerwistProvider>
  );
}
