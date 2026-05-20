import type { RbacRole } from "@prisma/client";
import { loadRoleGeoValues } from "../../services/role-geo.service.js";

export async function roleGeoPayload(roleId: string) {
  const geo = await loadRoleGeoValues(roleId);
  return {
    villageOptionIds: geo.villageOptionIds,
    areaOptionIds: geo.areaOptionIds,
    villageValues: geo.villageValues,
    areaValues: geo.areaValues,
  };
}

export async function serializeRole(role: RbacRole & { permissions?: unknown; _count?: unknown }) {
  const geo = await roleGeoPayload(role.id);
  return {
    ...role,
    ...geo,
    permissionKeys:
      "permissions" in role && Array.isArray((role as { permissions: { effect: string; permission: { key: string } }[] }).permissions)
        ? (role as { permissions: { effect: string; permission: { key: string } }[] }).permissions
            .filter((p) => p.effect === "ALLOW")
            .map((p) => p.permission.key)
        : undefined,
  };
}
