"use client";

import * as React from "react";

const STORAGE_KEY = "app-snow";

type SnowContextValue = {
  isSnowing: boolean;
  setSnowing: (value: boolean) => void;
  toggleSnow: () => void;
};

const SnowContext = React.createContext<SnowContextValue | undefined>(undefined);

function persistSnow(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function SnowProvider({ children }: { children: React.ReactNode }) {
  const [isSnowing, setIsSnowing] = React.useState(false);

  React.useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setIsSnowing(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setSnowing = React.useCallback((value: boolean) => {
    setIsSnowing(value);
    persistSnow(value);
  }, []);

  const toggleSnow = React.useCallback(() => {
    setIsSnowing((prev) => {
      const next = !prev;
      persistSnow(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ isSnowing, setSnowing, toggleSnow }),
    [isSnowing, setSnowing, toggleSnow],
  );

  return <SnowContext.Provider value={value}>{children}</SnowContext.Provider>;
}

export function useSnow() {
  const ctx = React.useContext(SnowContext);
  if (!ctx) throw new Error("useSnow must be used within SnowProvider");
  return ctx;
}
