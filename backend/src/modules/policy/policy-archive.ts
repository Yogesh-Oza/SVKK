import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import {
  buildPolicyReadWhere,
  type GeoScope,
} from "../../services/mis-scope.service.js";
import { resolvePolicyHolderName } from "./policy-holder-snapshot.js";

const archivedPolicy: Prisma.PolicyWhereInput = { deletedAt: { not: null } };

/**
 * Replace active-only `{ deletedAt: null }` filters with archived `{ deletedAt: { not: null } }`.
 */
function swapActiveToArchived(where: Prisma.PolicyWhereInput): Prisma.PolicyWhereInput {
  return JSON.parse(
    JSON.stringify(where, (_key, value) => {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value as object).length === 1 &&
        (value as { deletedAt?: unknown }).deletedAt === null
      ) {
        return archivedPolicy;
      }
      return value;
    }),
  ) as Prisma.PolicyWhereInput;
}

export function buildArchivedPolicyReadWhere(
  scope: GeoScope,
  filterVillage: string | undefined,
  userId: string,
  permissions: Set<string>,
  filterVillages?: string[],
): Prisma.PolicyWhereInput {
  const active = buildPolicyReadWhere(scope, filterVillage, userId, permissions, filterVillages);
  return swapActiveToArchived(active);
}

export type ArchivedPolicyListItem = {
  id: string;
  deletedAt: Date;
  archivedPolicyNo: string | null;
  archivedReferenceNo: string | null;
  village: string | null;
  area: string | null;
  periodYearText: string | null;
  yearLabel: string | null;
  policyType: { id: string; key: string; name: string };
  insuredParty: {
    id: string;
    name: string;
    svkkPublicId: string;
    customerId: string | null;
  };
  holderName: string | null;
};

export async function queryArchivedPolicies(args: {
  where: Prisma.PolicyWhereInput;
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{
  items: ArchivedPolicyListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const search = args.search?.trim();
  const where: Prisma.PolicyWhereInput = search
    ? {
        AND: [
          args.where,
          {
            OR: [
              { archivedPolicyNo: { contains: search } },
              { archivedReferenceNo: { contains: search } },
              { village: { contains: search } },
              { holderName: { contains: search } },
              { insuredParty: { name: { contains: search } } },
              { insuredParty: { svkkPublicId: { contains: search } } },
              { insuredParty: { customerId: { contains: search } } },
            ],
          },
        ],
      }
    : args.where;

  const page = Math.max(1, args.page);
  const pageSize = Math.min(100, Math.max(1, args.pageSize));
  const skip = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    prisma.policy.count({ where }),
    prisma.policy.findMany({
      where,
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        deletedAt: true,
        archivedPolicyNo: true,
        archivedReferenceNo: true,
        village: true,
        area: true,
        holderName: true,
        periodYearText: true,
        policyType: { select: { id: true, key: true, name: true } },
        insuredParty: {
          select: { id: true, name: true, svkkPublicId: true, customerId: true },
        },
        years: {
          orderBy: { yearLabel: "desc" },
          take: 1,
          select: { yearLabel: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      deletedAt: r.deletedAt!,
      archivedPolicyNo: r.archivedPolicyNo,
      archivedReferenceNo: r.archivedReferenceNo,
      village: r.village,
      area: r.area,
      periodYearText: r.periodYearText,
      yearLabel: r.periodYearText?.trim() || r.years[0]?.yearLabel || null,
      policyType: r.policyType,
      insuredParty: r.insuredParty,
      holderName: r.holderName,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type SoftDeleteSnapshot = {
  policyNo: string | null;
  referenceNo: string | null;
};

async function loadRestoreSnapshot(policyId: string, existing: {
  archivedPolicyNo: string | null;
  archivedReferenceNo: string | null;
}): Promise<SoftDeleteSnapshot> {
  if (existing.archivedPolicyNo != null || existing.archivedReferenceNo != null) {
    return {
      policyNo: existing.archivedPolicyNo,
      referenceNo: existing.archivedReferenceNo,
    };
  }

  const log = await prisma.activityLog.findFirst({
    where: {
      entityType: "Policy",
      entityId: policyId,
      action: "POLICY_SOFT_DELETED",
    },
    orderBy: { createdAt: "desc" },
    select: { beforeData: true },
  });
  const before = (log?.beforeData ?? null) as SoftDeleteSnapshot | null;
  return {
    policyNo: before?.policyNo ?? null,
    referenceNo: before?.referenceNo ?? null,
  };
}

/**
 * Restore an archived policy. Fails with RESTORE_CONFLICT if Policy No / Reference No
 * are already taken by an active policy.
 */
export async function restoreArchivedPolicy(input: {
  actorUserId: string;
  policyId: string;
}) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: { not: null } },
    include: { insuredParty: { select: { name: true } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Archived policy not found", 404);
  }

  const snapshot = await loadRestoreSnapshot(input.policyId, existing);
  const conflicts: string[] = [];

  if (snapshot.referenceNo) {
    const taken = await prisma.policy.findFirst({
      where: {
        id: { not: input.policyId },
        deletedAt: null,
        referenceNo: snapshot.referenceNo,
      },
      select: { id: true },
    });
    if (taken) {
      conflicts.push(`Reference No "${snapshot.referenceNo}"`);
    }
  }

  if (snapshot.policyNo) {
    const taken = await prisma.policy.findFirst({
      where: {
        id: { not: input.policyId },
        deletedAt: null,
        policyNo: snapshot.policyNo,
        policyTypeId: existing.policyTypeId,
      },
      select: { id: true },
    });
    if (taken) {
      conflicts.push(`Policy No "${snapshot.policyNo}"`);
    }
  }

  if (conflicts.length > 0) {
    throw new AppError(
      "RESTORE_CONFLICT",
      `Cannot restore: ${conflicts.join(" and ")} already assigned to another active policy`,
      409,
    );
  }

  const updated = await prisma.policy.update({
    where: { id: input.policyId },
    data: {
      deletedAt: null,
      policyNo: snapshot.policyNo,
      referenceNo: snapshot.referenceNo,
      archivedPolicyNo: null,
      archivedReferenceNo: null,
    },
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_RESTORED",
    entityType: "Policy",
    entityId: input.policyId,
    beforeData: {
      deletedAt: existing.deletedAt,
      archivedPolicyNo: existing.archivedPolicyNo,
      archivedReferenceNo: existing.archivedReferenceNo,
    } as unknown as Prisma.InputJsonValue,
    afterData: {
      restored: true,
      policyNo: updated.policyNo,
      referenceNo: updated.referenceNo,
      holderName: resolvePolicyHolderName(existing, existing.insuredParty),
    } as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

/**
 * Permanently delete an archived policy (hard delete). Refuses active policies.
 */
export async function permanentlyDeleteArchivedPolicy(input: {
  actorUserId: string;
  policyId: string;
}) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: { not: null } },
    include: {
      insuredParty: { select: { id: true, name: true, svkkPublicId: true } },
      years: {
        select: {
          id: true,
          payments: { select: { chequeId: true } },
        },
      },
    },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Archived policy not found", 404);
  }

  const chequeIds = [
    ...new Set(
      existing.years.flatMap((y) =>
        y.payments.map((p) => p.chequeId).filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  const insuredPartyId = existing.insuredPartyId;

  await prisma.$transaction(async (tx) => {
    await tx.policy.delete({ where: { id: input.policyId } });

    if (chequeIds.length > 0) {
      for (const chequeId of chequeIds) {
        const stillLinked = await tx.payment.count({ where: { chequeId } });
        if (stillLinked === 0) {
          await tx.cheque.deleteMany({ where: { id: chequeId } });
        }
      }
    }

    const remainingPolicies = await tx.policy.count({
      where: { insuredPartyId },
    });
    if (remainingPolicies === 0) {
      await tx.insuredParty.deleteMany({ where: { id: insuredPartyId } });
    }
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_PURGED",
    entityType: "Policy",
    entityId: input.policyId,
    beforeData: {
      policyNo: existing.archivedPolicyNo,
      referenceNo: existing.archivedReferenceNo,
      village: existing.village,
      holderName: resolvePolicyHolderName(existing, existing.insuredParty),
      svkkPublicId: existing.insuredParty.svkkPublicId,
      deletedAt: existing.deletedAt,
    } as unknown as Prisma.InputJsonValue,
    afterData: { purged: true } as unknown as Prisma.InputJsonValue,
  });
}
