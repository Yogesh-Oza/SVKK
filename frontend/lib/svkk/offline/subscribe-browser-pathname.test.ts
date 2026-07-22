import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installMinimalHistoryWindow() {
  let pathname = "/";
  const listeners = new Map<string, Set<() => void>>();

  const history = {
    pushState(_data: unknown, _title: string, url?: string | URL | null) {
      if (url != null) pathname = new URL(String(url), "http://localhost").pathname;
    },
    replaceState(_data: unknown, _title: string, url?: string | URL | null) {
      if (url != null) pathname = new URL(String(url), "http://localhost").pathname;
    },
  };

  vi.stubGlobal("window", {
    history,
    location: {
      get pathname() {
        return pathname;
      },
    },
    addEventListener(type: string, handler: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener(type: string, handler: () => void) {
      listeners.get(type)?.delete(handler);
    },
  });
}

describe("subscribeBrowserPathname", () => {
  beforeEach(() => {
    vi.resetModules();
    installMinimalHistoryWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notifies subscribers when history.pushState changes the path", async () => {
    const { subscribeBrowserPathname, getBrowserPathnameSnapshot } = await import(
      "./subscribe-browser-pathname"
    );

    const onChange = vi.fn();
    const unsubscribe = subscribeBrowserPathname(onChange);

    window.history.pushState({}, "", "/policies/offline-test-id");

    expect(onChange).toHaveBeenCalled();
    expect(getBrowserPathnameSnapshot()).toBe("/policies/offline-test-id");

    unsubscribe();
  });

  it("notifies subscribers when history.replaceState changes the path", async () => {
    const { subscribeBrowserPathname, getBrowserPathnameSnapshot } = await import(
      "./subscribe-browser-pathname"
    );

    const onChange = vi.fn();
    const unsubscribe = subscribeBrowserPathname(onChange);

    window.history.replaceState({}, "", "/calculator");
    expect(onChange).toHaveBeenCalled();
    expect(getBrowserPathnameSnapshot()).toBe("/calculator");

    unsubscribe();
  });
});
