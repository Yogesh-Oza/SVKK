const SHELL_PATHS = ["/policies", "/policies/new"] as const;

/** Populate SW app-shell cache while online (requires active session). */
export async function warmPolicyAppShellCache(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;

  await Promise.all(
    SHELL_PATHS.map(async (path) => {
      try {
        await fetch(path, { credentials: "include", cache: "no-store" });
      } catch {
        /* best effort */
      }
    }),
  );
}
