"use client";

import { PolicyDetailPageView } from "@/features/svkk-policies/policy-detail-page-view";
import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

type BrowserRoute = {
  pathname: string;
  getParam: (key: string) => string;
};

function readBrowserRoute(): BrowserRoute {
  const url = new URL(window.location.href);
  return {
    pathname: url.pathname,
    getParam: (key) => url.searchParams.get(key)?.trim() ?? "",
  };
}

function isOfflinePolicySubRoute(pathname: string): boolean {
  return (
    pathname === "/policies/new" ||
    /^\/policies\/[^/]+$/.test(pathname) ||
    /^\/policies\/[^/]+\/edit$/.test(pathname)
  );
}

/**
 * When offline, the service worker serves the cached /policies list shell for any
 * /policies/* URL. Next.js then thinks the route is /policies — use window.location
 * and render the matching client page.
 */
function OfflinePolicyRouteInner({ children }: { children: ReactNode }) {
  const nextPathname = usePathname();
  const searchParams = useSearchParams();
  const [browserRoute, setBrowserRoute] = useState<BrowserRoute | null>(() =>
    typeof window !== "undefined" && !navigator.onLine ? readBrowserRoute() : null,
  );

  useEffect(() => {
    const sync = () => {
      if (!navigator.onLine) setBrowserRoute(readBrowserRoute());
      else setBrowserRoute(null);
    };
    sync();
    window.addEventListener("offline", sync);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("offline", sync);
      window.removeEventListener("online", sync);
    };
  }, []);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const pathname =
    offline && browserRoute ? browserRoute.pathname : (nextPathname ?? "");
  const getParam = (key: string) =>
    offline && browserRoute
      ? browserRoute.getParam(key)
      : (searchParams.get(key)?.trim() ?? "");

  if (!offline || !isOfflinePolicySubRoute(pathname)) {
    return <>{children}</>;
  }

  if (pathname === "/policies/new") {
    return <AdPolicyAddForm />;
  }

  const editMatch = pathname.match(/^\/policies\/([^/]+)\/edit$/);
  if (editMatch?.[1]) {
    return <AdPolicyAddForm policyId={editMatch[1]} editYearLabel={getParam("year")} />;
  }

  const detailMatch = pathname.match(/^\/policies\/([^/]+)$/);
  if (detailMatch?.[1]) {
    return (
      <PolicyDetailPageView
        policyId={detailMatch[1]}
        initialYearLabel={getParam("year")}
      />
    );
  }

  return <>{children}</>;
}

export function OfflinePolicyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <OfflinePolicyRouteInner>{children}</OfflinePolicyRouteInner>
    </Suspense>
  );
}
