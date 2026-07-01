/** Production always registers SW. In dev, set NEXT_PUBLIC_ENABLE_SW=true (after `npm run build`). */
export function isServiceWorkerEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return true;
  return process.env.NEXT_PUBLIC_ENABLE_SW === "true";
}
