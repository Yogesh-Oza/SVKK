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
  admissionDateFrom?: string;
  admissionDateTo?: string;
  svkkPublicIds?: string[];
  categoryKeys?: string[];
  policyTypes?: string[];
  policyGroupings?: string[];
  insuranceCompanies?: string[];
  areas?: string[];
  statusTexts?: string[];
  treatmentTypes?: string[];
  diseaseCategories?: string[];
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
  svkkPublicIds: string[];
  categoryKeys: string[];
  policyTypes: string[];
  policyGroupings: string[];
  insuranceCompanies: string[];
  areas: string[];
  statusTexts: string[];
  treatmentTypes: string[];
  diseaseCategories: string[];
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
  admissionDate: { admissionDate: "desc" },
  admissionDate_asc: { admissionDate: "asc" },
};

const FILTER_META_LIMIT = 500;
export const CLAIM_LIST_PAGE_SIZE_MAX = 500;

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

function dateFieldRange(
  field: "claimReceivedDate" | "admissionDate",
  dateFrom?: string,
  dateTo?: string,
): Prisma.ClaimWhereInput | undefined {
  const fromBounds = dateFrom?.trim() ? utcDayBoundsFromIsoDate(dateFrom) : undefined;
  const toBounds = dateTo?.trim() ? utcDayBoundsFromIsoDate(dateTo) : undefined;
  if (fromBounds && toBounds) {
    return { [field]: { gte: fromBounds.start, lte: toBounds.end } };
  }
  if (fromBounds) {
    return { [field]: { gte: fromBounds.start } };
  }
  if (toBounds) {
    return { [field]: { lte: toBounds.end } };
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
  if (q.svkkPublicIds?.length) {
    parts.push({ svkkPublicId: { in: q.svkkPublicIds } });
  }
  if (q.policyTypes?.length) {
    parts.push({ policyTypeText: { in: q.policyTypes } });
  }
  if (q.insuranceCompanies?.length) {
    parts.push({ insuranceCompany: { in: q.insuranceCompanies } });
  }
  if (q.areas?.length) {
    parts.push({ hospitalArea: { in: q.areas } });
  }
  if (q.statusTexts?.length) {
    parts.push({ statusText: { in: q.statusTexts } });
  }
  if (q.policyGroupings?.length) {
    parts.push({
      OR: [
        { policyGroupingText: { in: q.policyGroupings } },
        { policy: { policyGrouping: { in: q.policyGroupings }, deletedAt: null } },
      ],
    });
  }
  if (q.categoryKeys?.length) {
    parts.push({
      OR: [
        { categoryText: { in: q.categoryKeys } },
        {
          policy: {
            deletedAt: null,
            category: { key: { in: q.categoryKeys } },
          },
        },
      ],
    });
  }
  if (q.treatmentTypes?.length) {
    parts.push({ treatmentType: { in: q.treatmentTypes } });
  }
  if (q.diseaseCategories?.length) {
    parts.push({ diseaseCategory: { in: q.diseaseCategories } });
  }

  const receivedRange = dateFieldRange("claimReceivedDate", q.dateFrom, q.dateTo);
  if (receivedRange) {
    parts.push(receivedRange);
  }

  const admissionRange = dateFieldRange("admissionDate", q.admissionDateFrom, q.admissionDateTo);
  if (admissionRange) {
    parts.push(admissionRange);
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
        { mdId: { contains: search } },
        { insuranceCompany: { contains: search } },
        { policyNoText: { contains: search } },
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

export const claimListSelect = {
  id: true,
  policyId: true,
  claimNo: true,
  svkkPublicId: true,
  policyYear: true,
  status: true,
  statusText: true,
  claimType: true,
  actualLodgeType: true,
  treatmentType: true,
  treatmentProcedure: true,
  diseaseCategory: true,
  mdId: true,
  categoryText: true,
  claimAmount: true,
  reportedLodgeAmount: true,
  approvedAmount: true,
  deductionAmount: true,
  discountAmount: true,
  deductionDetails: true,
  remark: true,
  village: true,
  patientName: true,
  patientAge: true,
  patientRelation: true,
  patientGender: true,
  hospitalName: true,
  hospitalArea: true,
  hospitalInPpn: true,
  networkType: true,
  policyHolderName: true,
  policyTypeText: true,
  policyNoText: true,
  policyGroupingText: true,
  policyStartDate: true,
  policyEndDate: true,
  sumInsured: true,
  insuranceCompany: true,
  illness: true,
  paymentDetails: true,
  paymentInFavourOf: true,
  paymentDate: true,
  prsCrsDate: true,
  admissionDate: true,
  dischargeDate: true,
  lodgeDate: true,
  claimReceivedDate: true,
  matchStatus: true,
  policyYearRow: {
    select: {
      policyStart: true,
      policyEnd: true,
      yearLabel: true,
    },
  },
  policy: {
    select: {
      policyNo: true,
      policyGrouping: true,
      category: { select: { key: true } },
      insuredParty: { select: { svkkPublicId: true } },
      policyType: { select: { id: true, key: true, name: true } },
    },
  },
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
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), CLAIM_LIST_PAGE_SIZE_MAX);
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

type ScalarFilterField =
  | "village"
  | "policyYear"
  | "claimType"
  | "svkkPublicId"
  | "policyTypeText"
  | "insuranceCompany"
  | "hospitalArea"
  | "statusText"
  | "treatmentType"
  | "diseaseCategory"
  | "categoryText"
  | "policyGroupingText";

function nonEmptyFieldFilter(field: ScalarFilterField): Prisma.ClaimWhereInput {
  if (field === "policyYear" || field === "svkkPublicId") {
    return { [field]: { not: "" } };
  }
  return { [field]: { not: null } };
}

async function distinctScalar(
  where: Prisma.ClaimWhereInput,
  field: ScalarFilterField,
): Promise<string[]> {
  const rows = await prisma.claim.findMany({
    where: { AND: [where, nonEmptyFieldFilter(field)] },
    distinct: [field],
    select: { [field]: true },
    orderBy: { [field]: "asc" },
    take: FILTER_META_LIMIT,
  });
  return rows
    .map((r) => (r as unknown as Record<string, string | null>)[field])
    .filter((v): v is string => Boolean(v?.trim()))
    .sort((a, b) => a.localeCompare(b));
}

async function distinctPolicyGroupings(where: Prisma.ClaimWhereInput): Promise<string[]> {
  const [fromPolicy, fromSnapshot] = await Promise.all([
    prisma.claim.findMany({
      where: {
        AND: [where, { policy: { policyGrouping: { not: null }, deletedAt: null } }],
      },
      distinct: ["policyId"],
      select: { policy: { select: { policyGrouping: true } } },
      take: FILTER_META_LIMIT,
    }),
    distinctScalar(where, "policyGroupingText" as ScalarFilterField),
  ]);
  const values = [
    ...fromPolicy.map((r) => r.policy?.policyGrouping),
    ...fromSnapshot,
  ].filter((v): v is string => Boolean(v?.trim()));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function distinctCategoryKeys(where: Prisma.ClaimWhereInput): Promise<string[]> {
  const [fromPolicy, fromText] = await Promise.all([
    prisma.claim.findMany({
      where: {
        AND: [where, { policy: { categoryId: { not: null }, deletedAt: null } }],
      },
      distinct: ["policyId"],
      select: { policy: { select: { category: { select: { key: true } } } } },
      take: FILTER_META_LIMIT,
    }),
    distinctScalar(where, "categoryText" as ScalarFilterField),
  ]);
  const values = [
    ...fromPolicy.map((r) => r.policy?.category?.key),
    ...fromText,
  ].filter((v): v is string => Boolean(v?.trim()));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export async function distinctClaimFilterOptions(scopeWhere: Prisma.ClaimWhereInput): Promise<ClaimFiltersMeta> {
  const [
    villages,
    policyYears,
    claimTypes,
    svkkPublicIds,
    policyTypes,
    insuranceCompanies,
    areas,
    statusTexts,
    policyGroupings,
    categoryKeys,
    treatmentTypes,
    diseaseCategories,
  ] = await Promise.all([
    distinctScalar(scopeWhere, "village"),
    distinctScalar(scopeWhere, "policyYear"),
    distinctScalar(scopeWhere, "claimType"),
    distinctScalar(scopeWhere, "svkkPublicId"),
    distinctScalar(scopeWhere, "policyTypeText"),
    distinctScalar(scopeWhere, "insuranceCompany"),
    distinctScalar(scopeWhere, "hospitalArea"),
    distinctScalar(scopeWhere, "statusText"),
    distinctPolicyGroupings(scopeWhere),
    distinctCategoryKeys(scopeWhere),
    distinctScalar(scopeWhere, "treatmentType"),
    distinctScalar(scopeWhere, "diseaseCategory"),
  ]);
  return {
    villages,
    policyYears,
    claimTypes,
    svkkPublicIds,
    categoryKeys,
    policyTypes,
    policyGroupings,
    insuranceCompanies,
    areas,
    statusTexts,
    treatmentTypes,
    diseaseCategories,
  };
}
