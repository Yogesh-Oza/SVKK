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

/**
 * Refcount while `OfflinePolicyRoute` / list-page recovery is substituting the
 * recovered policy page for a mismatched SW/list shell. Soft nav to `/policies`
 * is a no-op when Next already thinks it is on `/policies`, so clicks must force
 * a full document load.
 */
let shellRecoveryDepth = 0;

export function setOfflineShellRecoveryActive(active: boolean): void {
  if (active) {
    shellRecoveryDepth += 1;
    return;
  }
  shellRecoveryDepth = Math.max(0, shellRecoveryDepth - 1);
}

export function isOfflineShellRecoveryActive(): boolean {
  return shellRecoveryDepth > 0;
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

/**
 * Capture-phase handler: force full page load when soft nav would leave the UI stuck.
 * - Offline: all offline-allowed destinations (RSC fetch cannot succeed).
 * - Shell recovery: any destination that differs from the real browser URL (Next may
 *   already be on that pathname, so client navigation is a no-op).
 */
export function handleOfflinePolicyLinkClick(event: globalThis.MouseEvent): void {
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

  const destination = url.pathname + url.search + url.hash;
  const leavingRecoveredShell =
    isOfflineShellRecoveryActive() && url.pathname !== window.location.pathname;
  const offlineHardNav = isOfflineMode() && isOfflineHardNavPath(url.pathname);

  if (!leavingRecoveredShell && !offlineHardNav) return;

  event.preventDefault();
  event.stopPropagation();
  window.location.assign(destination);
}
