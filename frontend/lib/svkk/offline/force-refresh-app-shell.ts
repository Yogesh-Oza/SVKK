/**
 * One-click recovery for a stale cached app shell (e.g. a `/policies` document cached
 * by an older/buggy service worker build, which would otherwise be served forever).
 *
 * Deliberately nukes *every* Cache Storage entry — not just our own named caches —
 * because the Serwist precache (used for `additionalPrecacheEntries` like `/policies`,
 * `/policies/new`, `/login`, `/offline`) lives under Serwist's own internal cache name,
 * which we don't want to hard-code/guess here. Then fully unregisters the service worker
 * so the next load registers a brand new one from scratch (rather than relying on
 * `update()`, which can no-op if the browser thinks the installed script is unchanged)
 * and reloads, guaranteeing the next navigation hits the network and re-seeds everything
 * with fresh content.
 */
export async function forceRefreshAppShell(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    /* best effort */
  }

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    } catch {
      /* best effort */
    }
  }

  window.location.reload();
}
