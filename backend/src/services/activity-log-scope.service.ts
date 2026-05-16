import type { Prisma } from "@prisma/client";
import { LEGACY_ROLE_SLUGS } from "../lib/permission-seed.js";

/**
 * Builds ActivityLog query filters. Non–super-admin readers with logs:read see only user/supervisor actors.
 */
export function buildActivityLogWhere(
  q: { module?: string; entityId?: string },
  readerRoleSlug: string,
): Prisma.ActivityLogWhereInput {
  const parts: Prisma.ActivityLogWhereInput[] = [];
  if (q.module) {
    parts.push({ module: q.module });
  }
  if (q.entityId) {
    parts.push({ entityId: q.entityId });
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
