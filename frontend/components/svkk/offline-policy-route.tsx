"use client";

import { PolicyDetailPageView } from "@/features/svkk-policies/policy-detail-page-view";
import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { debugOfflineRoute } from "@/lib/svkk/offline/offline-route-debug";
import {
  getBrowserSearchParam,
  isOfflinePolicySubRoute,
} from "@/lib/svkk/offline/policy-route-paths";
import {
  getBrowserPathnameSnapshot,
  subscribeBrowserPathname,
} from "@/lib/svkk/offline/subscribe-browser-pathname";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

/**
 * Renders the policy client page that actually matches `browserPathname`, or null if
 * `browserPathname` isn't a recognized policies sub-route (new/[id]/[id]/edit).
 *
 * Used both by `OfflinePolicyRoute` (layout-level recovery) and directly inside the
 * policies list page (`app/(svkk)/(main)/policies/page.tsx`) as a self-check: when a
 * stale/fallback service-worker response embeds the LIST page's own RSC/Flight tree for
 * a `/policies/*` URL, `usePathname()` ends up reporting the *correct* URL (it's synced
 * from `window.location`, not from the embedded tree) even though the mounted component
 * tree is still the list page. That makes a pathname-only mismatch check unreliable — the
 * list page must recognize "I'm mounted, but the real URL isn't mine" itself and swap in
 * the right content.
 */
export function renderOfflinePolicySubRoute(browserPathname: string): ReactNode | null {
  if (browserPathname === "/policies/new") {
    return <AdPolicyAddForm />;
  }

  const editMatch = browserPathname.match(/^\/policies\/([^/]+)\/edit$/);
  if (editMatch?.[1]) {
    return (
      <AdPolicyAddForm
        policyId={editMatch[1]}
        editYearLabel={getBrowserSearchParam("year")}
      />
    );
  }

  const detailMatch = browserPathname.match(/^\/policies\/([^/]+)$/);
  if (detailMatch?.[1]) {
    return (
      <PolicyDetailPageView
        policyId={detailMatch[1]}
        initialYearLabel={getBrowserSearchParam("year")}
      />
    );
  }

  return null;
}

/**
 * When the service worker serves the cached /policies list shell for a /policies/* URL,
 * Next.js usePathname() stays on /policies while window.location has the real URL.
 * Recover by rendering the matching client page from the browser URL.
 */
export function OfflinePolicyRoute({ children }: { children: ReactNode }) {
  const nextPathname = usePathname() ?? "";
  const browserPathname = useSyncExternalStore(
    subscribeBrowserPathname,
    getBrowserPathnameSnapshot,
    () => "",
  );

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const browserIsPolicySubRoute = isOfflinePolicySubRoute(browserPathname);
  const routerMismatch = browserIsPolicySubRoute && browserPathname !== nextPathname;
  const shouldRecover = browserIsPolicySubRoute && (offline || routerMismatch);

  useEffect(() => {
    debugOfflineRoute("route state", {
      browserPathname,
      nextPathname,
      offline,
      routerMismatch,
      shouldRecover,
      href: typeof window !== "undefined" ? window.location.href : "",
    });
  }, [browserPathname, nextPathname, offline, routerMismatch, shouldRecover]);

  if (!shouldRecover) {
    return <>{children}</>;
  }

  debugOfflineRoute("recovering shell", {
    browserPathname,
    nextPathname,
    offline,
  });

  return renderOfflinePolicySubRoute(browserPathname) ?? <>{children}</>;
}
