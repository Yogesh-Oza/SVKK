type Listener = () => void;

const listeners = new Set<Listener>();
let historyPatched = false;

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Next.js App Router updates the URL via `history.pushState` / `replaceState`, which do
 * not fire `popstate`. Without patching those, `useSyncExternalStore` keeps a stale
 * pathname after client-side navigations — and `OfflinePolicyRoute` can keep recovering
 * the old policy page, making menu clicks appear to do nothing.
 */
function ensureHistoryPatched(): void {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;

  const { pushState, replaceState } = window.history;

  window.history.pushState = function pushStatePatched(...args) {
    const result = pushState.apply(this, args);
    notifyListeners();
    return result;
  };

  window.history.replaceState = function replaceStatePatched(...args) {
    const result = replaceState.apply(this, args);
    notifyListeners();
    return result;
  };
}

/** Re-render when connectivity or history path changes (for SW shell recovery). */
export function subscribeBrowserPathname(onStoreChange: () => void): () => void {
  ensureHistoryPatched();
  listeners.add(onStoreChange);

  const notify = () => onStoreChange();

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function getBrowserPathnameSnapshot(): string {
  return window.location.pathname;
}
