const SVKK_PATH_PREFIXES = [
  "/dashboard",
  "/calculator",
  "/policies",
  "/claims",
  "/mis",
  "/upload",
  "/admin",
  "/logs",
  "/users",
] as const;

/**
 * True when the URL should use the SVKK mediclaim sidebar and primary app chrome.
 */
export function isSvkkAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return false;
  }
  return SVKK_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
