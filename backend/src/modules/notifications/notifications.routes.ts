import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { normalizeNotificationLinkUrl } from "../../services/notification/policy-url.js";

function visibleToUser(userId: string) {
  return { OR: [{ userId: null }, { userId }] };
}

export function createNotificationsRouter(env: Env) {
  const r = Router();

  r.get("/", requireAuth(env), requirePermission("notifications:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(10),
          page: z.coerce.number().int().min(1).default(1),
          unreadOnly: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
        })
        .parse(req.query);

      const where = {
        ...visibleToUser(req.userId!),
        ...(q.unreadOnly ? { readAt: null } : {}),
      };

      const skip = (q.page - 1) * q.limit;

      const [rows, unreadCount, totalCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
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
        prisma.notification.count({ where: { ...visibleToUser(req.userId!), readAt: null } }),
        prisma.notification.count({ where: visibleToUser(req.userId!) }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalCount / q.limit));

      res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          linkUrl: normalizeNotificationLinkUrl(n.linkUrl, n.policyId),
          policyId: n.policyId,
          emailSent: n.emailSent,
          isRead: n.readAt != null,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadCount,
        totalCount,
        page: q.page,
        pageSize: q.limit,
        totalPages,
      });
    } catch (e) {
      next(e);
    }
  });

  r.post(
    "/read-all",
    requireAuth(env),
    requirePermission("notifications:read"),
    async (req, res, next) => {
      try {
        await prisma.notification.updateMany({
          where: {
            readAt: null,
            ...visibleToUser(req.userId!),
          },
          data: { readAt: new Date() },
        });
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/delete-all",
    requireAuth(env),
    requirePermission("notifications:read"),
    async (req, res, next) => {
      try {
        const result = await prisma.notification.deleteMany({
          where: visibleToUser(req.userId!),
        });
        res.json({ ok: true, deleted: result.count });
      } catch (e) {
        next(e);
      }
    },
  );

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
            ...visibleToUser(req.userId!),
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

  return r;
}
