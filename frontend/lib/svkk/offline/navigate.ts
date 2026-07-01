import type { MouseEvent } from "react";
import { isOfflineMode } from "./policy-data";

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

export function onOfflineAwareLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  if (!isOfflineMode()) return;
  event.preventDefault();
  window.location.assign(href);
}
