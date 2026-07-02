/**
 * Cache Storage names shared between the service worker (app/sw.ts) and window-context
 * code (e.g. warm-offline-shell.ts). Cache Storage is available in both contexts and is
 * shared per-origin, so window code can pre-populate what the SW will later read.
 */
export const APP_SHELL_CACHE = "svkk-app-shell";
export const OFFLINE_SHELL_PATHS = [
  "/policies",
  "/policies/new",
  "/calculator",
  "/login",
  "/offline",
] as const;
