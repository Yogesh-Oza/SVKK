import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import { APP_SHELL_CACHE, OFFLINE_SHELL_PATHS } from "@/lib/svkk/offline/sw-cache-names";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const POLICY_RSC_CACHE = "svkk-policies-rsc";

/** Set after Serwist is constructed — used for precache lookups with revision keys. */
const serwistRef: { current: Serwist | null } = { current: null };

const staticAssetCache = new CacheFirst({
  cacheName: "svkk-next-static",
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
  ],
});

function isRscPayload(url: URL): boolean {
  return url.searchParams.has("_rsc");
}

function isPolicyRscRequest(request: Request, url: URL): boolean {
  if (!url.pathname.startsWith("/policies")) return false;
  if (isRscPayload(url)) return true;
  return request.headers.get("RSC") === "1";
}

function isStaticAppShellPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname === "/calculator" ||
    pathname === "/policies" ||
    pathname === "/policies/new"
  );
}

function isCalculatorRscRequest(request: Request, url: URL): boolean {
  if (url.pathname !== "/calculator") return false;
  return isRscPayload(url) || request.headers.get("RSC") === "1";
}

function isDynamicPolicyShellPath(pathname: string): boolean {
  return (
    /^\/policies\/[^/]+$/.test(pathname) ||
    /^\/policies\/[^/]+\/edit$/.test(pathname)
  );
}

function isAppShellPath(pathname: string): boolean {
  return isStaticAppShellPath(pathname) || isDynamicPolicyShellPath(pathname);
}

async function matchOfflineAppShell(origin: string): Promise<Response | undefined> {
  const serwist = serwistRef.current;
  if (serwist) {
    for (const path of OFFLINE_SHELL_PATHS) {
      const precached = await serwist.matchPrecache(path);
      if (precached) return precached;
    }
  }

  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    for (const path of OFFLINE_SHELL_PATHS) {
      const hit = await cache.match(`${origin}${path}`, { ignoreSearch: true });
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Document navigations for the policy app shell (list, new, detail, edit, login, offline).
 * NetworkFirst — NOT CacheFirst — is required here: CacheFirst never re-checks the network
 * once a URL is cached, so a stale build (e.g. one predating an offline-routing fix) would
 * be served forever regardless of how many times the app is rebuilt/redeployed. NetworkFirst
 * refreshes the cache on every successful online visit and only falls back to cache/precache
 * when the network is genuinely unavailable.
 */
const appShellCache = new NetworkFirst({
  cacheName: APP_SHELL_CACHE,
  networkTimeoutSeconds: 3,
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
  ],
});

/** Next.js RSC payloads for policy routes (client-side navigation while offline). */
const policyRscCache = new NetworkFirst({
  cacheName: POLICY_RSC_CACHE,
  networkTimeoutSeconds: 2,
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
  ],
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  // IMPORTANT: no `precacheOptions.navigateFallback` here. That option is an
  // unconditional SPA-shell interceptor — it hijacks EVERY navigation matching the
  // allowlist that isn't itself precached by exact URL and always serves the fallback
  // document, even when the network is available and the real page could be fetched.
  // For a Next.js app with real per-URL server-rendered/dynamic routes (e.g.
  // /policies/[id]), that meant any dynamic policy URL not individually precached
  // (i.e. almost all of them) rendered the /policies list shell's actual RSC tree —
  // regardless of connectivity. Per-URL caching (below) plus `fallbacks`/setCatchHandler
  // (genuine network-failure-only fallback) is the correct approach here.
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        request.method === "GET" &&
        !isRscPayload(url) &&
        isAppShellPath(url.pathname),
      handler: appShellCache,
    },
    {
      matcher: ({ request, url }) =>
        isPolicyRscRequest(request, url) || isCalculatorRscRequest(request, url),
      handler: policyRscCache,
    },
    {
      matcher: ({ request, url }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "font" ||
        request.destination === "image" ||
        /\.(?:js|css|woff2|png|ico)$/.test(url.pathname),
      handler: staticAssetCache,
    },
    {
      matcher: ({ request }) =>
        request.method === "POST" ||
        request.method === "PATCH" ||
        request.method === "DELETE",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/policies",
        matcher({ request }) {
          return request.mode === "navigate" || request.destination === "document";
        },
      },
    ],
  },
});

serwistRef.current = serwist;

serwist.setCatchHandler(async ({ request }) => {
  const url = new URL(request.url);
  if (
    (request.mode === "navigate" || request.destination === "document") &&
    isAppShellPath(url.pathname)
  ) {
    const shell = await matchOfflineAppShell(url.origin);
    if (shell) return shell;
  }
  return Response.error();
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
    return;
  }
  if (event.data?.type === "SVKK_CLEAR_APP_SHELL_CACHE") {
    event.waitUntil(caches.delete(APP_SHELL_CACHE));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "policy-sync") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "SVKK_POLICY_SYNC" });
        }
      })(),
    );
  }
});
