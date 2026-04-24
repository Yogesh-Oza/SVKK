"use client";

import * as React from "react";

const STORAGE_KEY = "app-font";

export type AppFont = "inter" | "manrope" | "system";

type FontContextValue = {
  font: AppFont;
  setFont: (font: AppFont) => void;
};

const FontContext = React.createContext<FontContextValue | undefined>(undefined);

function applyFontClass(font: AppFont) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("font-inter", "font-manrope", "font-system");
  root.classList.add(`font-${font}`);
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = React.useState<AppFont>("inter");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as AppFont | null;
      if (stored && ["inter", "manrope", "system"].includes(stored)) {
        setFontState(stored);
        applyFontClass(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setFont = React.useCallback((next: AppFont) => {
    setFontState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyFontClass(next);
  }, []);

  const value = React.useMemo(() => ({ font, setFont }), [font, setFont]);

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFont() {
  const ctx = React.useContext(FontContext);
  if (!ctx) throw new Error("useFont must be used within FontProvider");
  return ctx;
}
