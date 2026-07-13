import type { Prisma, PrismaClient } from "@prisma/client";
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

/** Strip LIKE metacharacters so user input is matched literally. */
export function sanitizeActivityLogSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "");
}

/**
 * MySQL: Prisma `string_contains` on a JSON *object* adds `JSON_TYPE(...) = 'STRING'`,
 * which never matches. CAST to CHAR + LIKE finds holderName, referenceNo, recipient, etc.
 */
export async function activityLogIdsMatchingPayload(
  prisma: PrismaClient,
  term: string,
): Promise<string[]> {
  const safe = sanitizeActivityLogSearchTerm(term);
  if (!safe) {
    return [];
  }
  const like = `%${safe}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM activitylog
    WHERE CAST(afterData AS CHAR) LIKE ${like}
       OR CAST(beforeData AS CHAR) LIKE ${like}
    LIMIT 10000
  `;
  return rows.map((r) => r.id);
}

/**
 * Builds ActivityLog query filters. Non–super-admin readers with logs:read see only user/supervisor actors.
 * Pass `payloadMatchIds` from {@link activityLogIdsMatchingPayload} when searching.
 */
export function buildActivityLogWhere(
  q: ActivityLogQuery,
  readerRoleSlug: string,
  opts?: { payloadMatchIds?: string[] },
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
  const term = sanitizeActivityLogSearchTerm(q.search ?? "");
  if (term) {
    const searchOr: Prisma.ActivityLogWhereInput[] = [
      { module: { contains: term } },
      { action: { contains: term } },
      { entityId: { contains: term } },
      { entityType: { contains: term } },
      { user: { name: { contains: term } } },
      { user: { email: { contains: term } } },
    ];
    const payloadIds = opts?.payloadMatchIds ?? [];
    if (payloadIds.length > 0) {
      searchOr.push({ id: { in: payloadIds } });
    }
    parts.push({ OR: searchOr });
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

/** List/search helper: resolve JSON payload matches then build the full where clause. */
export async function buildActivityLogWhereForSearch(
  prisma: PrismaClient,
  q: ActivityLogQuery,
  readerRoleSlug: string,
): Promise<Prisma.ActivityLogWhereInput> {
  const term = sanitizeActivityLogSearchTerm(q.search ?? "");
  const payloadMatchIds = term ? await activityLogIdsMatchingPayload(prisma, term) : [];
  return buildActivityLogWhere(q, readerRoleSlug, { payloadMatchIds });
}
