/** Re-render when connectivity or history path changes (for SW shell recovery). */
export function subscribeBrowserPathname(onStoreChange: () => void): () => void {
  const notify = () => onStoreChange();

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);

  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function getBrowserPathnameSnapshot(): string {
  return window.location.pathname;
}
