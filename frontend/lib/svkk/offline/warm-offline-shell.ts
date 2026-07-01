import { APP_SHELL_CACHE } from "./sw-cache-names";

const SHELL_PATHS = ["/policies", "/policies/new"] as const;

/**
 * Populate the SW app-shell cache while online (requires an active session).
 *
 * A plain `fetch()` never has `request.mode === "navigate"`, so the service worker's
 * navigation-only runtime-caching route never sees (or caches) these requests. Writing
 * directly to Cache Storage — which is shared between window and SW contexts — is the
 * only way to warm this cache from client code.
 */
export async function warmPolicyAppShellCache(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  if (!("caches" in window)) return;

  try {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.all(
      SHELL_PATHS.map(async (path) => {
        try {
          const response = await fetch(path, { credentials: "include", cache: "no-store" });
          if (response.ok) await cache.put(path, response.clone());
        } catch {
          /* best effort */
        }
      }),
    );
  } catch {
    /* Cache Storage unavailable (e.g. private browsing) */
  }
}
