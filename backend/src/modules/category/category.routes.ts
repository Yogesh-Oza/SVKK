import { Router } from "express";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requireAnyPermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Public reference data for policy category dropdowns.
 */
export function createCategoryRouter(_env: Env) {
  const r = Router();
  r.use(requireAuth(_env));
  r.get(
    "/",
    requireAnyPermission(["policy:read", "policy:create", "policy:update", "categoryForm:read"]),
    async (req, res, next) => {
    try {
      const items = await prisma.category.findMany({
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
    },
  );
  return r;
}
