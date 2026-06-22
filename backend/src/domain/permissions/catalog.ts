/**
 * Canonical permission catalog — single source of truth for seed and runtime checks.
 */
export interface PermissionCatalogEntry {
  key: string;
  label: string;
  group: string;
  groupOrder: number;
  description?: string;
  isScope?: boolean;
  sortOrder?: number;
}

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  { key: "dashboard:read", label: "View dashboard", group: "Dashboard", groupOrder: 10, sortOrder: 1 },
  { key: "dashboard:scope_all", label: "Full dashboard scope", group: "Dashboard scope", groupOrder: 11, isScope: true, sortOrder: 1 },
  { key: "dashboard:scope_village", label: "Village dashboard scope", group: "Dashboard scope", groupOrder: 11, isScope: true, sortOrder: 2 },
  { key: "policy:create", label: "Create policies", group: "Policies", groupOrder: 20, sortOrder: 1 },
  { key: "policy:read", label: "List & view policies", group: "Policies", groupOrder: 20, sortOrder: 2 },
  { key: "policy:update", label: "Update policies", group: "Policies", groupOrder: 20, sortOrder: 3 },
  { key: "policy:delete", label: "Delete policies", group: "Policies", groupOrder: 20, sortOrder: 4 },
  { key: "policy:commission", label: "Commission fields", group: "Policies", groupOrder: 20, sortOrder: 5, description: "View/edit Commission and VKK Commission fields." },
  { key: "policy:scope_all", label: "All policies (scope)", group: "Policy scope", groupOrder: 21, isScope: true, sortOrder: 1 },
  { key: "policy:scope_village", label: "Village-scoped policies", group: "Policy scope", groupOrder: 21, isScope: true, sortOrder: 2 },
  { key: "policy:scope_own", label: "Own policies only", group: "Policy scope", groupOrder: 21, isScope: true, sortOrder: 3 },
  { key: "claim:create", label: "Create claims", group: "Claims", groupOrder: 30, sortOrder: 1 },
  { key: "claim:read", label: "List & view claims", group: "Claims", groupOrder: 30, sortOrder: 2 },
  { key: "claim:update", label: "Update claims", group: "Claims", groupOrder: 30, sortOrder: 3 },
  { key: "claim:delete", label: "Delete claims", group: "Claims", groupOrder: 30, sortOrder: 4 },
  { key: "claim:import", label: "Import claims (CSV/XLSX)", group: "Claims", groupOrder: 30, sortOrder: 5 },
  { key: "claim:scope_all", label: "All claims (scope)", group: "Claim scope", groupOrder: 31, isScope: true, sortOrder: 1 },
  { key: "claim:scope_village", label: "Village-scoped claims", group: "Claim scope", groupOrder: 31, isScope: true, sortOrder: 2 },
  { key: "mis:policy:read", label: "Policy MIS reports", group: "MIS — Policy", groupOrder: 40, sortOrder: 1 },
  { key: "mis:policy:scope_all", label: "Full Policy MIS scope", group: "Policy MIS scope", groupOrder: 41, isScope: true, sortOrder: 1 },
  { key: "mis:policy:scope_village", label: "Village Policy MIS scope", group: "Policy MIS scope", groupOrder: 41, isScope: true, sortOrder: 2 },
  { key: "mis:claim:read", label: "Claim MIS reports", group: "MIS — Claim", groupOrder: 42, sortOrder: 1 },
  { key: "mis:claim:scope_all", label: "Full Claim MIS scope", group: "Claim MIS scope", groupOrder: 43, isScope: true, sortOrder: 1 },
  { key: "mis:claim:scope_village", label: "Village Claim MIS scope", group: "Claim MIS scope", groupOrder: 43, isScope: true, sortOrder: 2 },
  { key: "future:read", label: "Future Premium", group: "Future", groupOrder: 44, sortOrder: 1 },
  { key: "future:lookup", label: "Policy lookup", group: "Future", groupOrder: 44, sortOrder: 2 },
  { key: "future:scope_all", label: "Full Future scope", group: "Future scope", groupOrder: 45, isScope: true, sortOrder: 1 },
  { key: "future:scope_village", label: "Village Future scope", group: "Future scope", groupOrder: 45, isScope: true, sortOrder: 2 },
  { key: "calculation:live", label: "Use premium calculator", group: "Calculator", groupOrder: 50, sortOrder: 1 },
  { key: "admin:charts", label: "Edit calculator charts", group: "Calculator", groupOrder: 50, sortOrder: 2 },
  { key: "receipt:create", label: "Create receipts", group: "Receipts", groupOrder: 60, sortOrder: 1 },
  { key: "upload:csv", label: "CSV policy import", group: "Uploads", groupOrder: 70, sortOrder: 1 },
  { key: "upload:google-drive", label: "Google Drive upload", group: "Uploads", groupOrder: 70, sortOrder: 2 },
  { key: "upload:one-drive", label: "OneDrive upload", group: "Uploads", groupOrder: 70, sortOrder: 3 },
  { key: "admin:policyTypes", label: "Admin policy types & dropdowns", group: "Admin", groupOrder: 80, sortOrder: 1 },
  { key: "admin:settings", label: "Receipt & email settings", group: "Admin", groupOrder: 80, sortOrder: 2 },
  { key: "notifications:read", label: "View notifications", group: "Notifications", groupOrder: 85, sortOrder: 1 },
  { key: "logs:read", label: "Activity logs", group: "Admin", groupOrder: 80, sortOrder: 3 },
  { key: "users:manage", label: "Manage users", group: "Users & RBAC", groupOrder: 90, sortOrder: 1 },
  { key: "roles:manage", label: "Manage roles & permissions", group: "Users & RBAC", groupOrder: 90, sortOrder: 2 },
] as const;

export const WILDCARD_PERMISSION = "*:*";

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"] | typeof WILDCARD_PERMISSION;

export const CATALOG_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export function getCatalogEntry(key: string): PermissionCatalogEntry | undefined {
  return PERMISSION_CATALOG.find((p) => p.key === key);
}
