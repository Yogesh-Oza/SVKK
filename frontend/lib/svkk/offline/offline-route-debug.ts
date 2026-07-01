/** Enable in dev, via NEXT_PUBLIC_SVKK_DEBUG_OFFLINE_ROUTE=true, or localStorage svkk:debug-offline-route=1 */
export function isOfflineRouteDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_SVKK_DEBUG_OFFLINE_ROUTE === "true") return true;
  if (typeof window !== "undefined") {
    try {
      return window.localStorage.getItem("svkk:debug-offline-route") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

export function debugOfflineRoute(label: string, data: Record<string, unknown>): void {
  if (!isOfflineRouteDebugEnabled()) return;
  console.debug(`[svkk:offline-route] ${label}`, data);
}
