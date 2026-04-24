import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";

/**
 * Builds ActivityLog query filters. ADMIN is limited to USER and SUPERVISOR actors; SUPER_ADMIN is not restricted.
 */
export function buildActivityLogWhere(
  q: { module?: string; entityId?: string },
  readerRole: UserRole,
): Prisma.ActivityLogWhereInput {
  const parts: Prisma.ActivityLogWhereInput[] = [];
  if (q.module) {
    parts.push({ module: q.module });
  }
  if (q.entityId) {
    parts.push({ entityId: q.entityId });
  }
  if (readerRole === UserRole.ADMIN) {
    parts.push({ user: { role: { in: [UserRole.USER, UserRole.SUPERVISOR] } } });
  }
  if (parts.length === 0) {
    return {};
  }
  return parts.length === 1 ? parts[0]! : { AND: parts };
}
