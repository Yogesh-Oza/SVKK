import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type RbacAuditAction =
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_GEO_UPDATED"
  | "ROLE_CLONED"
  | "ROLE_SOFT_DELETED"
  | "ROLE_DISABLED"
  | "ROLE_ENABLED"
  | "USER_ROLE_CHANGED";

export interface RbacAuditInput {
  action: RbacAuditAction;
  actorId: string;
  targetRoleId?: string;
  targetUserId?: string;
  oldSnapshot?: Prisma.InputJsonValue;
  newSnapshot?: Prisma.InputJsonValue;
}

type Tx = Pick<typeof prisma, "rbacAuditLog">;

export async function logRbacAudit(input: RbacAuditInput, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  await client.rbacAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      targetRoleId: input.targetRoleId,
      targetUserId: input.targetUserId,
      oldSnapshot: input.oldSnapshot ?? undefined,
      newSnapshot: input.newSnapshot ?? undefined,
    },
  });
}
