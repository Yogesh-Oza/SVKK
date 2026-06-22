"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getRequiredPermissionsForPath } from "@/lib/svkk/route-permissions";
import { getSvkkNavForPermissions, hasPermission } from "@/lib/svkk/permissions";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Redirects users who lack the permission required for the current path.
 */
export function SvkkPermissionGate({ children }: { children: ReactNode }) {
  const { user, loading, permissionsHydrated } = useSvkkAuth();
  const pathname = usePathname();
  const router = useRouter();

  const required = getRequiredPermissionsForPath(pathname);
  const allowed =
    !required?.length ||
    (user?.permissions && required.some((key) => hasPermission(user.permissions!, key)));

  const redirectHref = (() => {
    const perms = user?.permissions;
    if (!perms?.length) return "/forbidden";
    const nav = getSvkkNavForPermissions(perms);
    const first = nav.find((n) => n.href && n.href !== pathname)?.href ?? nav[0]?.href;
    return first ?? "/forbidden";
  })();

  useEffect(() => {
    if (loading || !permissionsHydrated || !user || allowed) {
      return;
    }
    router.replace(redirectHref);
  }, [loading, permissionsHydrated, user, allowed, router, redirectHref]);

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
