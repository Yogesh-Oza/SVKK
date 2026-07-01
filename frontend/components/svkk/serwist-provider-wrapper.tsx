"use client";

import { SerwistProvider } from "@serwist/next/react";
import { useEffect } from "react";

const SW_URL = "/sw.js";

/** Registers /sw.js in production for offline page caching. */
export function SerwistProviderWrapper({ children }: { children: React.ReactNode }) {
  const disabled = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (disabled) return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (existing?.active?.scriptURL.endsWith(SW_URL)) return;

        const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
        if (process.env.NODE_ENV === "production") {
          console.info("[SVKK] Service worker registered:", reg.scope);
        }
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
