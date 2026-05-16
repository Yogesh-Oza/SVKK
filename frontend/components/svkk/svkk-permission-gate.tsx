"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getRequiredPermissionForPath } from "@/lib/svkk/route-permissions";
import { hasPermission } from "@/lib/svkk/permissions";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Redirects users who lack the permission required for the current path.
 */
export function SvkkPermissionGate({ children }: { children: ReactNode }) {
  const { user, loading, permissionsHydrated } = useSvkkAuth();
  const pathname = usePathname();
  const router = useRouter();

  const required = getRequiredPermissionForPath(pathname);
  const allowed =
    !required ||
    (user?.permissions && hasPermission(user.permissions, required));

  useEffect(() => {
    if (loading || !permissionsHydrated || !user || allowed) {
      return;
    }
    router.replace("/dashboard");
  }, [loading, permissionsHydrated, user, allowed, router]);

  if (loading || !permissionsHydrated) {
    return (
      <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (user && !allowed) {
    return (
      <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
