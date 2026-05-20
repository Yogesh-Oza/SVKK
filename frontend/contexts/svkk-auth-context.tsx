"use client";

import { registerSessionInvalidationHandler } from "@/lib/svkk/session-invalidation";
import { clearAuth, initializeAuth, loginWithPassword, logoutUser } from "@/lib/store/slices/auth-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import type { SvkkUser } from "@/lib/svkk/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export type { SvkkUser } from "@/lib/svkk/types";

type SvkkAuthState = {
  user: SvkkUser | null;
  loading: boolean;
  /** True once `/auth/me` has resolved and `user.permissions` is available. */
  permissionsHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SvkkAuthContext = createContext<SvkkAuthState | null>(null);

/**
 * SVKK auth: httpOnly cookies on the API origin + Redux for client state.
 * Bootstraps session via `GET /auth/me` and optional `POST /auth/refresh`.
 */
export function SvkkAuthProvider({ children }: { children: ReactNode }) {
  const d = useAppDispatch();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) {
      return;
    }
    once.current = true;
    void d(initializeAuth());
  }, [d]);

  useEffect(() => {
    return registerSessionInvalidationHandler((message) => {
      d(clearAuth());
      toast.info(message);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    });
  }, [d]);

  const user = useAppSelector((s) => s.auth.user);
  const status = useAppSelector((s) => s.auth.status);

  const login = useCallback(
    async (email: string, password: string) => {
      await d(loginWithPassword({ email, password })).unwrap();
    },
    [d],
  );

  const logout = useCallback(async () => {
    await d(logoutUser()).unwrap();
  }, [d]);

  const loading = status === "loading";
  const permissionsHydrated =
    status === "authenticated" && user != null && Array.isArray(user.permissions);

  const value = useMemo(
    () => ({ user, loading, permissionsHydrated, login, logout }),
    [user, loading, permissionsHydrated, login, logout],
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
