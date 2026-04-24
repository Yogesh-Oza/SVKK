"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects to `/login` when there is no SVKK session.
 */
export function SvkkAuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSvkkAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm">
        Loading…
      </div>
    );
  }
  if (!user) {
    return null;
  }
  return <>{children}</>;
}
