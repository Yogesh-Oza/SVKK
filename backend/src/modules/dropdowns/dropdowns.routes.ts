import { Router } from "express";
import { z } from "zod";
import { DropdownType } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { prisma } from "../../lib/prisma.js";
import { loadRoleGeoValues } from "../../services/role-geo.service.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";

const dropdownTypeValues = Object.values(DropdownType) as [DropdownType, ...DropdownType[]];

/**
 * Public reference data for the policy add/edit form dropdowns.
 * Geo-scoped users only see villages/areas assigned to their role.
 */
export function createDropdownsRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/", async (req, res, next) => {
    try {
      const typeFilter = req.query.type
        ? z.enum(dropdownTypeValues).parse(req.query.type)
        : undefined;

      const where = typeFilter
        ? { type: typeFilter, isActive: true }
        : { isActive: true };

      let roleGeo: Awaited<ReturnType<typeof loadRoleGeoValues>> | null = null;
      const perms = req.permissions ?? new Set<string>();
      const geoScoped =
        !hasPermissionInSet(perms, "*:*") &&
        !hasPermissionInSet(perms, "policy:scope_all") &&
        (hasPermissionInSet(perms, "policy:scope_village") ||
          hasPermissionInSet(perms, "mis:scope_village") ||
          hasPermissionInSet(perms, "claim:scope_village"));

      if (geoScoped && req.userId) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { roleId: true },
        });
        if (user) {
          roleGeo = await loadRoleGeoValues(user.roleId);
        }
      }

      const rowsAll = await prisma.dropdownOption.findMany({
        where,
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      });

      const rows = roleGeo
        ? rowsAll.filter((row) => {
            if (row.type === DropdownType.VILLAGE) {
              return roleGeo!.villageOptionIds.includes(row.id);
            }
            if (row.type === DropdownType.AREA) {
              return roleGeo!.areaOptionIds.includes(row.id);
            }
            return true;
          })
        : rowsAll;

      const grouped: Record<string, { value: string; label: string }[]> = {};
      for (const t of dropdownTypeValues) {
        if (!typeFilter || typeFilter === t) grouped[t] = [];
      }
      for (const row of rows) {
        grouped[row.type]!.push({ value: row.value, label: row.label });
      }

      res.json({ items: grouped });
    } catch (e) {
      next(e);
    }
  });

  /** Public read of the admin-managed Policy Group list (no admin permission required). */
  r.get("/policy-groupings", async (_req, res, next) => {
    try {
      const rows = await prisma.policyGroupingOption.findMany({
        orderBy: { name: "asc" },
      });
      res.json({ items: rows });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
