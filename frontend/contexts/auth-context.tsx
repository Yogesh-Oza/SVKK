"use client";

import type { User } from "@/lib/types";
import { ReduxStoreProvider } from "@/components/providers/redux-store-provider";
import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from "react";
import { SvkkAuthProvider, useSvkkAuth, type SvkkUser } from "./svkk-auth-context";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toCrmUser(s: SvkkUser | null): User | null {
  if (!s) {
    return null;
  }
  const crmAdmin = s.role === "ADMIN" || s.role === "SUPER_ADMIN";
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    avatar: "",
    role: crmAdmin ? "admin" : "sales",
  };
}

function AuthContextInner({ children }: { children: ReactNode }) {
  const { user, loading, login, logout } = useSvkkAuth();

  const value = useMemo<AuthContextType>(
    () => ({
      user: toCrmUser(user),
      isAuthenticated: !!user,
      isLoading: loading,
      login,
      logout,
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ReduxStoreProvider>
      <SvkkAuthProvider>
        <AuthContextInner>{children}</AuthContextInner>
      </SvkkAuthProvider>
    </ReduxStoreProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
