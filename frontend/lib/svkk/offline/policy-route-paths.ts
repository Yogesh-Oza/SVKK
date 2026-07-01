export function isOfflinePolicySubRoute(pathname: string): boolean {
  return (
    pathname === "/policies/new" ||
    /^\/policies\/[^/]+$/.test(pathname) ||
    /^\/policies\/[^/]+\/edit$/.test(pathname)
  );
}

export function getBrowserSearchParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key)?.trim() ?? "";
}
