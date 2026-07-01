import { APP_SHELL_CACHE } from "./sw-cache-names";

/**
 * One-click recovery for a stale cached app shell (e.g. a `/policies` document cached
 * before an offline-routing fix, which `CacheFirst` would otherwise serve forever).
 * Clears the SW's app-shell cache, forces an update check, and reloads so the next
 * navigation is guaranteed to hit the network and re-seed the cache with fresh content.
 */
export async function forceRefreshAppShell(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("caches" in window) {
      await caches.delete(APP_SHELL_CACHE);
    }
  } catch {
    /* best effort */
  }

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      await reg?.update();
    } catch {
      /* best effort */
    }
  }

  window.location.reload();
}
