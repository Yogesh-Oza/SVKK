import type { SvkkUser } from "./types";
import type { SvkkRole } from "./permissions";

const SLUG_TO_LEGACY: Record<string, SvkkRole> = {
  "super-admin": "SUPER_ADMIN",
  admin: "ADMIN",
  supervisor: "SUPERVISOR",
  user: "USER",
};

/** Maps API user payload to client shape with legacy `role` for gradual migration. */
export function normalizeSvkkUser(raw: Record<string, unknown>): SvkkUser {
  const permissions = Array.isArray(raw.permissions)
    ? (raw.permissions as string[])
    : [];
  const roleSlug = String(raw.roleSlug ?? "");
  const legacyRole = SLUG_TO_LEGACY[roleSlug] ?? ("USER" as SvkkRole);
  return {
    id: String(raw.id),
    email: String(raw.email),
    name: String(raw.name),
    roleId: String(raw.roleId ?? ""),
    roleName: String(raw.roleName ?? ""),
    roleSlug,
    roleIsActive: Boolean(raw.roleIsActive ?? true),
    permissions,
    role: legacyRole,
  };
}
