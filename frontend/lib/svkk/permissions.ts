export const WILDCARD_PERMISSION = "*:*";

export type SvkkNavId =
  | "dashboard"
  | "calculator"
  | "calculatorAdmin"
  | "policies"
  | "policyNew"
  | "policyArchive"
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
  | "emailTemplates"
  | "categoryForm";

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
    id: "policyArchive",
    href: "/policies/archive",
    label: "Recycle Bin",
    permission: "policy:delete",
  },
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
  { id: "admin", href: "/admin", label: "Dynamic Form Dropdowns", permission: "admin:dropdowns:read" },
  { id: "roles", href: "/roles", label: "Roles & permissions", permission: "roles:read" },
  { id: "users", href: "/users", label: "Users", permission: "users:read" },
  { id: "settings", href: "/receipt-settings", label: "Receipt Settings", permission: "settings:read" },
  { id: "emailTemplates", href: "/email-templates", label: "Email templates", permission: "emailTemplates:read" },
  { id: "categoryForm", href: "/category-form", label: "Category form", permission: "categoryForm:read" },
  { id: "logs", href: "/logs", label: "Activity logs", permission: "logs:read" },
];

/** @deprecated Use roleSlug from API; kept for display fallbacks */
export type SvkkRole = "USER" | "SUPERVISOR" | "ADMIN" | "SUPER_ADMIN";

export function hasPermission(permissions: string[] | undefined, key: string): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(WILDCARD_PERMISSION) || permissions.includes(key);
}

export function hasAnyPermission(
  permissions: string[] | undefined,
  keys: readonly string[],
): boolean {
  return keys.some((key) => hasPermission(permissions, key));
}

export function getSvkkNavForPermissions(permissions: string[]) {
  const base = NAV.filter((n) => {
    if (n.id === "mis") {
      return canAccessPolicyMis(permissions) || canAccessClaimMis(permissions);
    }
    if (n.id === "policyArchive") {
      return canAccessPolicyArchive(permissions);
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

export function canExportPolicy(permissions: string[]) {
  return hasPermission(permissions, "policy:export");
}

/** View/edit Commission + VKK Commission fields in the UI (calculation always runs). */
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

export function canRestorePolicy(permissions: string[]) {
  return hasPermission(permissions, "policy:restore");
}

export function canPurgePolicy(permissions: string[]) {
  return hasPermission(permissions, "policy:purge");
}

/** Recycle Bin / Archive page — any archive-related permission. */
export function canAccessPolicyArchive(permissions: string[]) {
  return (
    canDeletePolicy(permissions) ||
    canRestorePolicy(permissions) ||
    canPurgePolicy(permissions)
  );
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

export function canExportClaim(permissions: string[]) {
  return hasPermission(permissions, "claim:export");
}

export function canReadUsers(permissions: string[]) {
  return hasPermission(permissions, "users:read");
}

export function canCreateUsers(permissions: string[]) {
  return hasPermission(permissions, "users:create");
}

export function canUpdateUsers(permissions: string[]) {
  return hasPermission(permissions, "users:update");
}

export function canDeleteUsers(permissions: string[]) {
  return hasPermission(permissions, "users:delete");
}

export function canReadRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:read");
}

export function canCreateRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:create");
}

export function canUpdateRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:update");
}

export function canCloneRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:clone");
}

export function canToggleRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:toggle");
}

export function canDeleteRoles(permissions: string[]) {
  return hasPermission(permissions, "roles:delete");
}

export function canReadSettings(permissions: string[]) {
  return hasPermission(permissions, "settings:read");
}

export function canUpdateSettings(permissions: string[]) {
  return hasPermission(permissions, "settings:update");
}

export function canReadEmailTemplates(permissions: string[]) {
  return hasPermission(permissions, "emailTemplates:read");
}

export function canUpdateEmailTemplates(permissions: string[]) {
  return hasPermission(permissions, "emailTemplates:update");
}

export function canSendTestEmailTemplates(permissions: string[]) {
  return hasPermission(permissions, "emailTemplates:send_test");
}

export function canReadCategoryForm(permissions: string[]) {
  return hasPermission(permissions, "categoryForm:read");
}

export function canUpdateCategoryForm(permissions: string[]) {
  return hasPermission(permissions, "categoryForm:update");
}

export function canSendTestCategoryForm(permissions: string[]) {
  return hasPermission(permissions, "categoryForm:send_test");
}

export function canSendCategoryForm(permissions: string[]) {
  return hasPermission(permissions, "categoryForm:send");
}

export function canUpdateNotifications(permissions: string[]) {
  return hasPermission(permissions, "notifications:update");
}

export function canDeleteNotifications(permissions: string[]) {
  return hasPermission(permissions, "notifications:delete");
}

export function canReadAdminDropdowns(permissions: string[]) {
  return hasPermission(permissions, "admin:dropdowns:read");
}

export function canCreateAdminDropdowns(permissions: string[]) {
  return hasPermission(permissions, "admin:dropdowns:create");
}

export function canUpdateAdminDropdowns(permissions: string[]) {
  return hasPermission(permissions, "admin:dropdowns:update");
}

export function canDeleteAdminDropdowns(permissions: string[]) {
  return hasPermission(permissions, "admin:dropdowns:delete");
}
