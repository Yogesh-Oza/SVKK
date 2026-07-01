import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const APP_SHELL_CACHE = "svkk-app-shell";
const POLICY_RSC_CACHE = "svkk-policies-rsc";
const OFFLINE_SHELL_PATHS = ["/policies", "/policies/new", "/login", "/offline"];

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

function isAppShellPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname === "/policies" ||
    pathname === "/policies/new" ||
    /^\/policies\/[^/]+$/.test(pathname) ||
    /^\/policies\/[^/]+\/edit$/.test(pathname)
  );
}

async function matchOfflineAppShell(origin: string): Promise<Response | undefined> {
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

const appShellFallbackPlugin = {
  handlerDidError: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (!isAppShellPath(url.pathname)) return undefined;
    return (await matchOfflineAppShell(url.origin)) ?? undefined;
  },
};

/** Document navigations — cache after online visit; offline falls back to /policies shell. */
const appShellCache = new CacheFirst({
  cacheName: APP_SHELL_CACHE,
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
    appShellFallbackPlugin,
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
  // navigationPreload rejects offline and blocks cache fallback (serwist#194).
  navigationPreload: false,
  precacheOptions: {
    navigateFallback: "/policies",
    navigateFallbackAllowlist: [/^\/policies/, /^\/login$/, /^\/offline$/],
  },
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
      matcher: ({ request, url }) => isPolicyRscRequest(request, url),
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
