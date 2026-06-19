/**
 * Path → required permission. `undefined` means any authenticated user.
 */
export function getRequiredPermissionForPath(pathname: string): string | undefined {
  if (pathname === "/login" || pathname.startsWith("/login")) {
    return undefined;
  }
  if (pathname.startsWith("/roles")) return "roles:manage";
  if (pathname.startsWith("/admin")) return "admin:policyTypes";
  if (pathname.startsWith("/logs")) return "logs:read";
  if (pathname.startsWith("/users")) return "users:manage";
  if (pathname.startsWith("/receipt-settings")) return "admin:settings";
  if (pathname.startsWith("/email-templates")) return "admin:settings";
  if (pathname.startsWith("/category-form")) return "admin:settings";
  if (pathname.startsWith("/notifications")) return "notifications:read";
  if (pathname.startsWith("/claims")) return "claim:read";
  if (pathname.startsWith("/mis")) return "mis:read";
  if (pathname.startsWith("/calculator/admin")) return "admin:charts";
  if (pathname.startsWith("/calculator")) return "calculation:live";
  if (pathname.startsWith("/policies/new")) return "policy:create";
  if (pathname.startsWith("/policies")) return "policy:read";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard")) return "dashboard:read";
  return undefined;
}
