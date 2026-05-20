import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { rbacRateLimit } from "../../middlewares/rate-limit.js";
import {
  cloneRole,
  createRole,
  getEffectivePermissionsForUser,
  getRoleById,
  listPermissionsGrouped,
  listRoles,
  softDeleteRole,
  updateRole,
} from "./rbac-roles.service.js";
import { listGeoMasterOptions } from "../../services/role-geo.service.js";

export function createRbacRouter(_env: Env) {
  const r = Router();
  r.use(requireAuth(_env));
  r.use(rbacRateLimit);

  r.get("/geo-options", requirePermission("roles:manage"), async (_req, res, next) => {
    try {
      const options = await listGeoMasterOptions();
      res.json(options);
    } catch (e) {
      next(e);
    }
  });

  r.get("/permissions", requirePermission("roles:manage"), async (_req, res, next) => {
    try {
      const groups = await listPermissionsGrouped();
      res.json({ groups });
    } catch (e) {
      next(e);
    }
  });

  r.get("/roles/assignable", requirePermission("users:manage"), async (_req, res, next) => {
    try {
      const roles = await listRoles();
      res.json({
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          slug: role.slug,
          isActive: role.isActive,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/roles", requirePermission("roles:manage"), async (_req, res, next) => {
    try {
      const roles = await listRoles();
      const rolesWithGeo = await Promise.all(
        roles.map(async (role) => {
          const full = await getRoleById(role.id);
          return {
            id: full.id,
            name: full.name,
            slug: full.slug,
            description: full.description,
            isSystem: full.isSystem,
            isActive: full.isActive,
            permVersion: full.permVersion,
            userCount: full._count.users,
            permissionKeys: full.permissions
              .filter((p) => p.effect === "ALLOW")
              .map((p) => p.permission.key),
            villageOptionIds: full.villageOptionIds,
            areaOptionIds: full.areaOptionIds,
          };
        }),
      );
      res.json({ roles: rolesWithGeo });
    } catch (e) {
      next(e);
    }
  });

  r.get("/roles/:id", requirePermission("roles:manage"), async (req, res, next) => {
    try {
      const role = await getRoleById(String(req.params.id));
      res.json({ role });
    } catch (e) {
      next(e);
    }
  });

  r.post("/roles", requirePermission("roles:manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(2).max(80),
          slug: z.string().min(2).max(64).optional(),
          description: z.string().max(500).optional(),
          permissionKeys: z.array(z.string()).min(1),
          villageOptionIds: z.array(z.string()).optional(),
          areaOptionIds: z.array(z.string()).optional(),
        })
        .parse(req.body);
      const role = await createRole(req.userId!, body);
      res.status(201).json({ role });
    } catch (e) {
      next(e);
    }
  });

  r.post("/roles/:id/clone", requirePermission("roles:manage"), async (req, res, next) => {
    try {
      const body = z.object({ name: z.string().min(2).max(80) }).parse(req.body);
      const role = await cloneRole(req.userId!, String(req.params.id), body.name);
      res.status(201).json({ role });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/roles/:id", requirePermission("roles:manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(2).max(80).optional(),
          description: z.string().max(500).optional(),
          permissionKeys: z.array(z.string()).min(1).optional(),
          villageOptionIds: z.array(z.string()).optional(),
          areaOptionIds: z.array(z.string()).optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);
      const role = await updateRole(req.userId!, String(req.params.id), body);
      res.json({ role });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/roles/:id", requirePermission("roles:manage"), async (req, res, next) => {
    try {
      await softDeleteRole(req.userId!, String(req.params.id));
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  r.get(
    "/users/:id/effective-permissions",
    requirePermission("roles:manage"),
    async (req, res, next) => {
      try {
        const permissions = await getEffectivePermissionsForUser(String(req.params.id));
        res.json({ permissions });
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
