"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getAllowedRolesForPath } from "@/lib/svkk/route-roles";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * After auth, keeps users in role-appropriate SVKK areas (e.g. USER cannot open /claims).
 */
export function SvkkRoleGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSvkkAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) {
      return;
    }
    const allowed = getAllowedRolesForPath(pathname);
    if (allowed && !allowed.includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [loading, user, pathname, router]);

  if (!loading && user) {
    const allowed = getAllowedRolesForPath(pathname);
    if (allowed && !allowed.includes(user.role)) {
      return (
        <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
          Redirecting…
        </div>
      );
    }
  }

  return <>{children}</>;
}
