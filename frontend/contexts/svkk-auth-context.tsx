"use client";

import { svkkFetch, setSvkkAccessToken, svkkJson, refreshSvkkAccessToken } from "@/lib/svkk/api";
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

/**
 * Auth state for the SVKK Express API (in-memory access JWT + httpOnly refresh cookie).
 */
export function SvkkAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SvkkUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const restored = await refreshSvkkAccessToken();
        if (cancelled) {
          return;
        }
        if (!restored) {
          setUser(null);
          return;
        }
        const me = await svkkJson<SvkkUser>("/auth/me");
        if (cancelled) {
          return;
        }
        setUser(me);
      } catch {
        if (cancelled) {
          return;
        }
        setSvkkAccessToken(null);
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
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await svkkFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setSvkkAccessToken(null);
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
