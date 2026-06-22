export const WILDCARD_PERMISSION = "*:*";

export type SvkkNavId =
  | "dashboard"
  | "calculator"
  | "calculatorAdmin"
  | "policies"
  | "policyNew"
  | "futurePremium"
  | "futureLookup"
  | "claims"
  | "mis"
  | "notifications"
  | "admin"
  | "roles"
  | "logs"
  | "users"
  | "settings"
  | "emailTemplates";

type NavEntry = {
  id: SvkkNavId;
  href: string;
  label: string;
  permission: string;
};

const NAV: NavEntry[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", permission: "dashboard:read" },
  { id: "calculator", href: "/calculator", label: "Premium calculator", permission: "calculation:live" },
  {
    id: "calculatorAdmin",
    href: "/calculator/admin",
    label: "Calc charts & discounts",
    permission: "admin:charts",
  },
  { id: "policies", href: "/policies", label: "Policies", permission: "policy:read" },
  { id: "policyNew", href: "/policies/new", label: "Add policy", permission: "policy:create" },
  {
    id: "futurePremium",
    href: "/future-premium",
    label: "Future Premium",
    permission: "future:read",
  },
  {
    id: "futureLookup",
    href: "/future-premium/lookup",
    label: "Lookup",
    permission: "future:lookup",
  },
  { id: "claims", href: "/claims", label: "Claims", permission: "claim:read" },
  { id: "mis", href: "/mis", label: "MIS", permission: "mis:policy:read" },
  { id: "notifications", href: "/notifications", label: "Notifications", permission: "notifications:read" },
  { id: "admin", href: "/admin", label: "Dynamic Form Dropdowns", permission: "admin:policyTypes" },
  { id: "roles", href: "/roles", label: "Roles & permissions", permission: "roles:manage" },
  { id: "users", href: "/users", label: "Users", permission: "users:manage" },
  { id: "settings", href: "/receipt-settings", label: "Receipt Settings", permission: "admin:settings" },
  { id: "emailTemplates", href: "/email-templates", label: "Email templates", permission: "admin:settings" },
  { id: "logs", href: "/logs", label: "Activity logs", permission: "logs:read" },
];

/** @deprecated Use roleSlug from API; kept for display fallbacks */
export type SvkkRole = "USER" | "SUPERVISOR" | "ADMIN" | "SUPER_ADMIN";

export function hasPermission(permissions: string[] | undefined, key: string): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(WILDCARD_PERMISSION) || permissions.includes(key);
}

export function getSvkkNavForPermissions(permissions: string[]) {
  const base = NAV.filter((n) => {
    if (n.id === "mis") {
      return canAccessPolicyMis(permissions) || canAccessClaimMis(permissions);
    }
    return hasPermission(permissions, n.permission);
  });
  return base;
}

export function canAccessPolicyMis(permissions: string[]) {
  return hasPermission(permissions, "mis:policy:read");
}

export function canAccessClaimMis(permissions: string[]) {
  return hasPermission(permissions, "mis:claim:read");
}

/** @deprecated Use canAccessPolicyMis / canAccessClaimMis */
export function canAccessMis(permissions: string[]) {
  return canAccessPolicyMis(permissions) || canAccessClaimMis(permissions);
}

export function canAccessFuturePremium(permissions: string[]) {
  return hasPermission(permissions, "future:read");
}

export function canAccessFutureLookup(permissions: string[]) {
  return hasPermission(permissions, "future:lookup");
}

/** Load dashboard MIS widgets (same APIs as MIS report) with MIS or dashboard read. */
export function canAccessDashboardMis(permissions: string[]) {
  return (
    canAccessPolicyMis(permissions) ||
    canAccessClaimMis(permissions) ||
    hasPermission(permissions, "dashboard:read")
  );
}

export function canUpdatePolicy(permissions: string[]) {
  return hasPermission(permissions, "policy:update");
}

export function canSeeCommission(permissions: string[]) {
  return hasPermission(permissions, "policy:commission");
}

export function canUploadPolicyDrive(permissions: string[]) {
  return (
    hasPermission(permissions, "upload:google-drive") ||
    hasPermission(permissions, "upload:one-drive")
  );
}

export function canDeletePolicy(permissions: string[]) {
  return hasPermission(permissions, "policy:delete");
}

export function canCreateReceipt(permissions: string[]) {
  return hasPermission(permissions, "receipt:create");
}

export function canUpdateClaim(permissions: string[]) {
  return hasPermission(permissions, "claim:update");
}

export function canCreateClaim(permissions: string[]) {
  return hasPermission(permissions, "claim:create");
}

export function canDeleteClaim(permissions: string[]) {
  return hasPermission(permissions, "claim:delete");
}

export function canImportClaim(permissions: string[]) {
  return hasPermission(permissions, "claim:import");
}

export function canManageUsers(permissions: string[]) {
  return hasPermission(permissions, "users:manage");
}

export function canManageRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:manage");
}
