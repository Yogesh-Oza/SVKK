import type { SvkkRole } from "./permissions";

const SUP: readonly SvkkRole[] = ["SUPERVISOR", "ADMIN", "SUPER_ADMIN"];
const ADM: readonly SvkkRole[] = ["ADMIN", "SUPER_ADMIN"];
const ALL: readonly SvkkRole[] = ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];

/**
 * If the path is restricted, only these roles may view it. `undefined` means any authenticated user.
 */
export function getAllowedRolesForPath(pathname: string): readonly SvkkRole[] | undefined {
  if (pathname === "/login" || pathname.startsWith("/login")) {
    return undefined;
  }
  if (pathname.startsWith("/admin")) {
    return ADM;
  }
  if (pathname.startsWith("/logs")) {
    return ADM;
  }
  if (pathname.startsWith("/users")) {
    return ADM;
  }
  if (pathname.startsWith("/receipt-settings")) {
    return ADM;
  }
  if (pathname.startsWith("/claims")) {
    return SUP;
  }
  if (pathname.startsWith("/mis")) {
    return SUP;
  }
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/calculator") ||
    pathname.startsWith("/policies")
  ) {
    return ALL;
  }
  return undefined;
}
