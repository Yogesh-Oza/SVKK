import type { MouseEvent } from "react";
import { isOfflineAllowedPath } from "./offline-nav";
import { isOfflineMode } from "./policy-data";

/**
 * Paths that must use a full document load while offline.
 * Next's client-side <Link> still needs a network round-trip for the RSC payload.
 * That fetch fails silently offline — history can update while the old page stays
 * mounted. Hard navigation is the only reliable way to change pages offline.
 */
function isOfflineHardNavPath(pathname: string): boolean {
  return isOfflineAllowedPath(pathname);
}

/** Full document navigation when offline (Next.js client routing needs network for RSC). */
export function navigatePolicyRoute(
  href: string,
  router?: { push: (href: string) => void },
): void {
  if (isOfflineMode()) {
    window.location.assign(href);
    return;
  }
  if (router) {
    router.push(href);
    return;
  }
  window.location.assign(href);
}

export function replacePolicyRoute(
  href: string,
  router?: { replace: (href: string, options?: { scroll?: boolean }) => void },
): void {
  if (isOfflineMode()) {
    window.location.replace(href);
    return;
  }
  router?.replace(href, { scroll: false });
}

export function onOfflineAwareLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  if (!isOfflineMode()) return;
  event.preventDefault();
  window.location.assign(href);
}

/** Capture-phase handler: force full page load for offline-allowed routes when offline. */
export function handleOfflinePolicyLinkClick(event: globalThis.MouseEvent): void {
  if (!isOfflineMode()) return;
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.target && anchor.target !== "_self") return;

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:")) return;

  let url: URL;
  try {
    url = new URL(rawHref, window.location.href);
  } catch {
    return;
  }

  if (url.origin !== window.location.origin) return;
  if (!isOfflineHardNavPath(url.pathname)) return;

  event.preventDefault();
  event.stopPropagation();
  window.location.assign(url.pathname + url.search + url.hash);
}
