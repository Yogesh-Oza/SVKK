"use client";

import { svkkFetch, getSvkkAccessToken, setSvkkAccessToken, svkkJson } from "@/lib/svkk/api";
import type { SvkkRole } from "@/lib/svkk/permissions";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const USER_KEY = "svkk_user";

export type SvkkUser = {
  id: string;
  email: string;
  name: string;
  role: SvkkRole;
};

type SvkkAuthState = {
  user: SvkkUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SvkkAuthContext = createContext<SvkkAuthState | null>(null);

function readUserFromStorage(): SvkkUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SvkkUser;
  } catch {
    return null;
  }
}

/**
 * Auth state for the SVKK Express API (JWT access + httpOnly refresh).
 */
export function SvkkAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SvkkUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getSvkkAccessToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    const cached = readUserFromStorage();
    if (cached) {
      setUser(cached);
    }
    let cancelled = false;
    void (async () => {
      try {
        const me = await svkkJson<SvkkUser>("/auth/me");
        if (cancelled) {
          return;
        }
        setUser(me);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(USER_KEY, JSON.stringify(me));
        }
      } catch {
        if (cancelled) {
          return;
        }
        setSvkkAccessToken(null);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(USER_KEY);
        }
        setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await svkkJson<{ accessToken: string; user: SvkkUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSvkkAccessToken(data.accessToken);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await svkkFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setSvkkAccessToken(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(USER_KEY);
      }
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <SvkkAuthContext.Provider value={value}>{children}</SvkkAuthContext.Provider>;
}

export function useSvkkAuth(): SvkkAuthState {
  const ctx = useContext(SvkkAuthContext);
  if (!ctx) {
    throw new Error("useSvkkAuth must be used under SvkkAuthProvider");
  }
  return ctx;
}
