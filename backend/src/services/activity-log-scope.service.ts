import type { Prisma } from "@prisma/client";
import { LEGACY_ROLE_SLUGS } from "../lib/permission-seed.js";

export type ActivityLogQuery = {
  module?: string;
  action?: string;
  entityId?: string;
  entityType?: string;
  userId?: string;
  roleSlug?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** When set with module email, filters sent vs failed/skipped outcomes. */
  emailOutcome?: "sent" | "failed";
};

/**
 * Builds ActivityLog query filters. Non–super-admin readers with logs:read see only user/supervisor actors.
 */
export function buildActivityLogWhere(
  q: ActivityLogQuery,
  readerRoleSlug: string,
): Prisma.ActivityLogWhereInput {
  const parts: Prisma.ActivityLogWhereInput[] = [];
  if (q.emailOutcome === "sent") {
    parts.push({ module: "email", action: "EMAIL_SENT" });
  } else if (q.emailOutcome === "failed") {
    parts.push({
      module: "email",
      action: { in: ["EMAIL_FAILED", "EMAIL_SKIPPED"] },
    });
  } else {
    if (q.module) {
      parts.push({ module: q.module });
    }
    if (q.action) {
      parts.push({ action: q.action });
    }
  }
  if (q.entityId) {
    parts.push({ entityId: q.entityId });
  }
  if (q.entityType) {
    parts.push({ entityType: q.entityType });
  }
  if (q.userId) {
    parts.push({ userId: q.userId });
  }
  if (q.roleSlug) {
    parts.push({
      user: {
        rbacRole: { slug: q.roleSlug },
      },
    });
  }
  if (q.dateFrom || q.dateTo) {
    parts.push({
      createdAt: {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      },
    });
  }
  const term = q.search?.trim();
  if (term) {
    parts.push({
      OR: [
        { module: { contains: term } },
        { action: { contains: term } },
        { entityId: { contains: term } },
        { entityType: { contains: term } },
        { user: { name: { contains: term } } },
        { user: { email: { contains: term } } },
      ],
    });
  }
  if (readerRoleSlug === LEGACY_ROLE_SLUGS.ADMIN) {
    parts.push({
      user: {
        rbacRole: {
          slug: { in: [LEGACY_ROLE_SLUGS.USER, LEGACY_ROLE_SLUGS.SUPERVISOR] },
        },
      },
    });
  }
  if (parts.length === 0) {
    return {};
  }
  return parts.length === 1 ? parts[0]! : { AND: parts };
}
