import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";

export function createNotificationsRouter(env: Env) {
  const r = Router();

  r.get("/", requireAuth(env), requirePermission("notifications:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          unreadOnly: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
        })
        .parse(req.query);

      const where = {
        OR: [{ userId: null }, { userId: req.userId! }],
        ...(q.unreadOnly ? { readAt: null } : {}),
      };

      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: q.limit,
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            linkUrl: true,
            policyId: true,
            emailSent: true,
            readAt: true,
            createdAt: true,
          },
        }),
        prisma.notification.count({ where: { ...where, readAt: null } }),
      ]);

      res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          linkUrl: n.linkUrl,
          policyId: n.policyId,
          emailSent: n.emailSent,
          isRead: n.readAt != null,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadCount,
      });
    } catch (e) {
      next(e);
    }
  });

  r.post(
    "/:id/read",
    requireAuth(env),
    requirePermission("notifications:read"),
    async (req, res, next) => {
      try {
        const id = z.string().min(1).parse(req.params.id);
        const row = await prisma.notification.findFirst({
          where: {
            id,
            OR: [{ userId: null }, { userId: req.userId! }],
          },
        });
        if (!row) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (!row.readAt) {
          await prisma.notification.update({
            where: { id },
            data: { readAt: new Date() },
          });
        }
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/read-all",
    requireAuth(env),
    requirePermission("notifications:read"),
    async (req, res, next) => {
      try {
        await prisma.notification.updateMany({
          where: {
            readAt: null,
            OR: [{ userId: null }, { userId: req.userId! }],
          },
          data: { readAt: new Date() },
        });
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
