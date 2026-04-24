import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { buildActivityLogWhere } from "../../services/activity-log-scope.service.js";

export function createLogsRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/", requirePermission("logs:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
          module: z.string().optional(),
          entityId: z.string().optional(),
        })
        .parse(req.query);

      const where = buildActivityLogWhere(
        { module: q.module, entityId: q.entityId },
        req.userRole!,
      );

      const rows = await prisma.activityLog.findMany({
        where,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (rows.length > q.limit) {
        const last = rows.pop();
        nextCursor = last?.id;
      }
      res.json({ items: rows, nextCursor });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
