import { ClaimPolicyMatchStatus, ClaimStatus, Prisma } from "@prisma/client";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { buildMisVillageWhere } from "../../services/mis-scope.service.js";
import { prisma } from "../../lib/prisma.js";

export type ClaimListQuery = {
  search?: string;
  villages?: string[];
  policyYears?: string[];
  statuses?: ClaimStatus[];
  claimTypes?: string[];
  matchStatuses?: ClaimPolicyMatchStatus[];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  policyId?: string;
  svkkPublicId?: string;
};

export type ClaimFiltersMeta = {
  villages: string[];
  policyYears: string[];
  claimTypes: string[];
};

const SORTS: Record<string, Prisma.ClaimOrderByWithRelationInput> = {
  createdAt: { createdAt: "desc" },
  createdAt_asc: { createdAt: "asc" },
  claimNo: { claimNo: "asc" },
  claimNo_desc: { claimNo: "desc" },
  svkkPublicId: { svkkPublicId: "asc" },
  svkkPublicId_desc: { svkkPublicId: "desc" },
  policyYear: { policyYear: "asc" },
  policyYear_desc: { policyYear: "desc" },
  village: { village: "asc" },
  village_desc: { village: "desc" },
  status: { status: "asc" },
  status_desc: { status: "desc" },
  claimAmount: { claimAmount: "desc" },
  claimAmount_asc: { claimAmount: "asc" },
  claimReceivedDate: { claimReceivedDate: "desc" },
  claimReceivedDate_asc: { claimReceivedDate: "asc" },
};

function utcDayBoundsFromIsoDate(isoDate: string): { start: Date; end: Date } | undefined {
  const d = new Date(isoDate.trim());
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, day, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y, m, day, 23, 59, 59, 999)),
  };
}

function claimReceivedDateRange(dateFrom?: string, dateTo?: string): Prisma.ClaimWhereInput | undefined {
  const fromBounds = dateFrom?.trim() ? utcDayBoundsFromIsoDate(dateFrom) : undefined;
  const toBounds = dateTo?.trim() ? utcDayBoundsFromIsoDate(dateTo) : undefined;
  if (fromBounds && toBounds) {
    return { claimReceivedDate: { gte: fromBounds.start, lte: toBounds.end } };
  }
  if (fromBounds) {
    return { claimReceivedDate: { gte: fromBounds.start } };
  }
  if (toBounds) {
    return { claimReceivedDate: { lte: toBounds.end } };
  }
  return undefined;
}

export function parseClaimListOrderBy(sort: string | undefined): Prisma.ClaimOrderByWithRelationInput {
  if (!sort || !SORTS[sort]) {
    return { createdAt: "desc" };
  }
  return SORTS[sort]!;
}

export function buildClaimListWhere(scope: GeoScope, q: ClaimListQuery): Prisma.ClaimWhereInput {
  const villageFilter = q.villages?.length ? q.villages : undefined;
  const { claim: scopeWhere } = buildMisVillageWhere(scope, villageFilter);

  const parts: Prisma.ClaimWhereInput[] = [scopeWhere];

  if (q.policyYears?.length) {
    parts.push({ policyYear: { in: q.policyYears } });
  }
  if (q.statuses?.length) {
    parts.push({ status: { in: q.statuses } });
  }
  if (q.claimTypes?.length) {
    parts.push({ claimType: { in: q.claimTypes } });
  }
  if (q.matchStatuses?.length) {
    parts.push({ matchStatus: { in: q.matchStatuses } });
  }

  const dateRange = claimReceivedDateRange(q.dateFrom, q.dateTo);
  if (dateRange) {
    parts.push(dateRange);
  }

  const search = q.search?.trim();
  if (search) {
    parts.push({
      OR: [
        { claimNo: { contains: search } },
        { svkkPublicId: { contains: search } },
        { patientName: { contains: search } },
        { policyHolderName: { contains: search } },
        { hospitalName: { contains: search } },
        { policy: { policyNo: { contains: search } } },
      ],
    });
  }

  const policyId = q.policyId?.trim();
  const svkkPublicId = q.svkkPublicId?.trim();
  if (policyId && svkkPublicId) {
    parts.push({
      OR: [{ policyId }, { svkkPublicId }],
    });
  } else if (policyId) {
    parts.push({ policyId });
  } else if (svkkPublicId) {
    parts.push({ svkkPublicId });
  }

  return parts.length > 1 ? { AND: parts } : scopeWhere;
}

const claimListSelect = {
  id: true,
  policyId: true,
  claimNo: true,
  svkkPublicId: true,
  policyYear: true,
  status: true,
  statusText: true,
  claimType: true,
  claimAmount: true,
  approvedAmount: true,
  deductionAmount: true,
  village: true,
  patientName: true,
  hospitalName: true,
  policyHolderName: true,
  policyTypeText: true,
  matchStatus: true,
  claimReceivedDate: true,
  policy: { select: { policyNo: true } },
} satisfies Prisma.ClaimSelect;

export type ClaimListRow = Prisma.ClaimGetPayload<{ select: typeof claimListSelect }>;

export async function queryClaimListPaged(
  where: Prisma.ClaimWhereInput,
  q: ClaimListQuery,
): Promise<{
  items: ClaimListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const orderBy = parseClaimListOrderBy(q.sort);

  const [total, items] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: claimListSelect,
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function queryClaimsForExport(
  where: Prisma.ClaimWhereInput,
  sort: string | undefined,
  maxRows: number,
): Promise<ClaimListRow[]> {
  return prisma.claim.findMany({
    where,
    orderBy: parseClaimListOrderBy(sort),
    take: maxRows,
    select: claimListSelect,
  });
}

export const CLAIM_LIST_EXPORT_MAX_ROWS = 100_000;

function nonEmptyFieldFilter(
  field: "village" | "policyYear" | "claimType",
): Prisma.ClaimWhereInput {
  // policyYear is a required String on Claim (not nullable); village/claimType are optional.
  if (field === "policyYear") {
    return { policyYear: { not: "" } };
  }
  return { [field]: { not: null } };
}

async function distinctNonEmpty(
  where: Prisma.ClaimWhereInput,
  field: "village" | "policyYear" | "claimType",
): Promise<string[]> {
  const rows = await prisma.claim.findMany({
    where: { AND: [where, nonEmptyFieldFilter(field)] },
    distinct: [field],
    select: { [field]: true },
    orderBy: { [field]: "asc" },
    take: 500,
  });
  return rows
    .map((r) => r[field] as string | null)
    .filter((v): v is string => Boolean(v?.trim()))
    .sort((a, b) => a.localeCompare(b));
}

export async function distinctClaimFilterOptions(scopeWhere: Prisma.ClaimWhereInput): Promise<ClaimFiltersMeta> {
  const [villages, policyYears, claimTypes] = await Promise.all([
    distinctNonEmpty(scopeWhere, "village"),
    distinctNonEmpty(scopeWhere, "policyYear"),
    distinctNonEmpty(scopeWhere, "claimType"),
  ]);
  return { villages, policyYears, claimTypes };
}
