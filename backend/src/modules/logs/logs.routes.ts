import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { buildActivityLogWhere } from "../../services/activity-log-scope.service.js";
import {
  formatActivityLogDetails,
  formatActivityLogSummary,
  formatEntityLabel,
  type ActivityLogRow,
} from "../../services/activity-log-format.js";
import { computePolicyFieldChanges } from "../../services/activity-log-policy-diff.js";
import {
  policyDisplayRefFromPayload,
  policyPrimaryLabel,
  resolvePolicyDisplayRef,
} from "../../services/activity-log-policy-ref.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(25),
  cursor: z.string().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  entityId: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().optional(),
  roleSlug: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

function parseDateBound(raw: string | undefined, endOfDay: boolean): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

type ActivityLogListSource = Prisma.ActivityLogGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } };
}>;

function toActivityLogRow(row: ActivityLogListSource): ActivityLogRow {
  return {
    id: row.id,
    module: row.module,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeData: row.beforeData,
    afterData: row.afterData,
    createdAt: row.createdAt,
    user: row.user,
  };
}

function toListItem(row: ActivityLogListSource) {
  const activityRow = toActivityLogRow(row);
  const base = {
    id: row.id,
    module: row.module,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
    user: row.user
      ? { id: row.user.id, name: row.user.name, email: row.user.email }
      : null,
  };
  const policyRef =
    row.entityType === "Policy"
      ? policyDisplayRefFromPayload(row.beforeData, row.afterData)
      : null;
  return {
    ...base,
    summary: formatActivityLogSummary(activityRow),
    details: formatActivityLogDetails(activityRow, policyRef),
    entityLabel: formatEntityLabel(activityRow, policyRef),
    policyRef,
    entityKey:
      row.entityType === "Policy" && policyRef ? policyPrimaryLabel(policyRef) : null,
  };
}

export function createLogsRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/meta", requirePermission("logs:read"), async (req, res, next) => {
    try {
      const where = buildActivityLogWhere({}, req.roleSlug!);
      const [modules, actions, entityTypes, actorRows] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          distinct: ["module"],
          select: { module: true },
          orderBy: { module: "asc" },
        }),
        prisma.activityLog.findMany({
          where,
          distinct: ["action"],
          select: { action: true },
          orderBy: { action: "asc" },
        }),
        prisma.activityLog.findMany({
          where,
          distinct: ["entityType"],
          select: { entityType: true },
          orderBy: { entityType: "asc" },
        }),
        prisma.activityLog.findMany({
          where: { ...where, userId: { not: null } },
          distinct: ["userId"],
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                rbacRole: { select: { slug: true, name: true } },
              },
            },
          },
        }),
      ]);

      const actorMap = new Map<
        string,
        { id: string; name: string; email: string; roleSlug: string; roleName: string }
      >();
      const roleMap = new Map<string, { slug: string; name: string }>();

      for (const row of actorRows) {
        const u = row.user;
        if (!u) continue;
        actorMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          roleSlug: u.rbacRole.slug,
          roleName: u.rbacRole.name,
        });
        roleMap.set(u.rbacRole.slug, { slug: u.rbacRole.slug, name: u.rbacRole.name });
      }

      const actors = [...actorMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      const roles = [...roleMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

      res.json({
        modules: modules.map((m) => m.module),
        actions: actions.map((a) => a.action),
        entityTypes: entityTypes.map((e) => e.entityType),
        actors,
        roles,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", requirePermission("logs:read"), async (req, res, next) => {
    try {
      const logId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
      const where = buildActivityLogWhere({}, req.roleSlug!);
      const row = await prisma.activityLog.findFirst({
        where: { id: logId, ...where },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      if (!row) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      const item = toListItem(row);
      let policyRef = item.policyRef ?? null;
      let details = item.details;
      let entityLabel = item.entityLabel;
      let entityKey = item.entityKey ?? null;
      let fieldChanges: ReturnType<typeof computePolicyFieldChanges> = [];

      if (row.entityType === "Policy") {
        policyRef = await resolvePolicyDisplayRef(row.entityId, row.beforeData, row.afterData);
        const activityRow = toActivityLogRow(row);
        details = formatActivityLogDetails(activityRow, policyRef);
        entityLabel = formatEntityLabel(activityRow, policyRef);
        entityKey = policyPrimaryLabel(policyRef);

        if (row.action === "POLICY_UPDATED") {
          fieldChanges = computePolicyFieldChanges(row.beforeData, row.afterData);
        }
      }

      res.json({
        ...item,
        policyRef,
        entityKey,
        entityLabel,
        details,
        fieldChanges,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/", requirePermission("logs:read"), async (req, res, next) => {
    try {
      const q = listQuerySchema.parse(req.query);

      const where = buildActivityLogWhere(
        {
          module: q.module,
          action: q.action,
          entityId: q.entityId,
          entityType: q.entityType,
          userId: q.userId,
          roleSlug: q.roleSlug,
          search: q.search,
          dateFrom: parseDateBound(q.dateFrom, false),
          dateTo: parseDateBound(q.dateTo, true),
        },
        req.roleSlug!,
      );

      const rows = await prisma.activityLog.findMany({
        where,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      let nextCursor: string | undefined;
      if (rows.length > q.limit) {
        const last = rows.pop();
        nextCursor = last?.id;
      }
      res.json({ items: rows.map(toListItem), nextCursor });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
