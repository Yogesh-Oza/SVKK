"use client";

import { useEffect, useRef } from "react";

/**
 * Ensures a waiting service worker takes control (required for offline caching).
 * Without an active controller, DevTools "Offline" shows ERR_INTERNET_DISCONNECTED.
 */
export function ServiceWorkerLifecycle() {
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      if (!navigator.serviceWorker.controller && registration.active) {
        if (!reloadedRef.current) {
          reloadedRef.current = true;
          window.location.reload();
        }
      }
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
