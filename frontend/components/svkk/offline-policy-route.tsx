"use client";

import { PolicyDetailPageView } from "@/features/svkk-policies/policy-detail-page-view";
import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

function isOfflinePolicySubRoute(pathname: string): boolean {
  return (
    pathname === "/policies/new" ||
    /^\/policies\/[^/]+$/.test(pathname) ||
    /^\/policies\/[^/]+\/edit$/.test(pathname)
  );
}

function subscribeToConnectivity(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getBrowserPathnameSnapshot(): string {
  return window.location.pathname;
}

function getBrowserSearchParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key)?.trim() ?? "";
}

/**
 * When offline, the service worker serves the cached /policies list shell for any
 * /policies/* URL. Next.js then thinks the route is /policies — read window.location
 * and render the matching client page (do not use Suspense fallback=children).
 */
export function OfflinePolicyRoute({ children }: { children: ReactNode }) {
  const nextPathname = usePathname();
  const browserPathname = useSyncExternalStore(
    subscribeToConnectivity,
    getBrowserPathnameSnapshot,
    () => "",
  );

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const pathname = offline && browserPathname ? browserPathname : (nextPathname ?? "");

  if (!offline || !isOfflinePolicySubRoute(pathname)) {
    return <>{children}</>;
  }

  if (pathname === "/policies/new") {
    return <AdPolicyAddForm />;
  }

  const editMatch = pathname.match(/^\/policies\/([^/]+)\/edit$/);
  if (editMatch?.[1]) {
    return (
      <AdPolicyAddForm
        policyId={editMatch[1]}
        editYearLabel={getBrowserSearchParam("year")}
      />
    );
  }

  const detailMatch = pathname.match(/^\/policies\/([^/]+)$/);
  if (detailMatch?.[1]) {
    return (
      <PolicyDetailPageView
        policyId={detailMatch[1]}
        initialYearLabel={getBrowserSearchParam("year")}
      />
    );
  }

  return <>{children}</>;
}
