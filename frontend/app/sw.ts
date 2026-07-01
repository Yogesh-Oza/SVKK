import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const staticAssetCache = new CacheFirst({
  cacheName: "svkk-next-static",
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
  ],
});

const referenceCache = new StaleWhileRevalidate({
  cacheName: "svkk-reference-data",
});

const policyDetailCache = new NetworkFirst({
  cacheName: "svkk-policy-detail",
  networkTimeoutSeconds: 5,
});

/** App shell — cache policy pages after first online visit for offline reload. */
const appShellCache = new NetworkFirst({
  cacheName: "svkk-app-shell",
  networkTimeoutSeconds: 4,
  plugins: [
    {
      cacheWillUpdate: async ({ response }) => (response?.status === 200 ? response : null),
    },
  ],
});

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        request.method === "GET" &&
        isAppShellPath(url.pathname),
      handler: appShellCache,
    },
    {
      matcher: ({ request, url }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "font" ||
        /\.(?:js|css|woff2)$/.test(url.pathname),
      handler: staticAssetCache,
    },
    {
      matcher: ({ url }) => url.pathname.includes("/dropdowns") || url.pathname.includes("/categories"),
      handler: referenceCache,
    },
    {
      matcher: ({ url }) =>
        url.pathname.includes("/calculation/admin/snapshot") ||
        url.pathname.includes("/calculation/reference/charts"),
      handler: referenceCache,
    },
    {
      matcher: ({ url, request }) =>
        request.method === "GET" &&
        /\/policies\/[^/]+$/.test(url.pathname) &&
        !url.pathname.includes("offline-bundle"),
      handler: policyDetailCache,
    },
    {
      matcher: ({ url, request }) =>
        request.method === "POST" ||
        request.method === "PATCH" ||
        request.method === "DELETE" ||
        url.pathname.includes("/auth/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/policies",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
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
