import {
  Prisma,
  type ChequeStatus,
  type AdProductVariant,
} from "@prisma/client";
import type { MisScope } from "../../services/mis-scope.service.js";
import { buildPolicyReadWhere } from "../../services/mis-scope.service.js";
import { prisma } from "../../lib/prisma.js";
import {
  renewalBucketPolicyWhere,
  renewalPendingPolicyWhere,
  type RenewalBucketKey,
} from "./renewal-pending.js";

export type PolicyListQuery = {
  search?: string;
  village?: string;
  villages?: string[];
  yearLabel?: string;
  periodYearText?: string;
  periodYearTexts?: string[];
  periodMonthText?: string;
  periodMonthTexts?: string[];
  categoryId?: string;
  categoryIds?: string[];
  categoryKey?: string;
  categoryKeys?: string[];
  policyTypeId?: string;
  policyTypeIds?: string[];
  adProductVariant?: AdProductVariant;
  adProductVariants?: AdProductVariant[];
  month?: number;
  year?: number;
  area?: string;
  areas?: string[];
  sumInsuredStr?: string;
  sumInsuredStrs?: string[];
  policyGrouping?: string;
  policyGroupings?: string[];
  chequeStatus?: ChequeStatus;
  /** Policy created-at range (YYYY-MM-DD, UTC calendar day bounds). */
  dateFrom?: string;
  dateTo?: string;
  /** Latest policy year end on/before renewalAsOf (default dateTo or today). */
  renewalPending?: boolean;
  renewalAsOf?: string;
  renewalBucket?: RenewalBucketKey;
  /** Offset pagination (mutually exclusive with cursor in route) */
  page?: number;
  pageSize?: number;
  /** e.g. createdAt, -createdAt, name, -name, village, policyNo, referenceNo */
  sort?: string;
};

const SORTS: Record<string, Prisma.PolicyOrderByWithRelationInput | Prisma.PolicyOrderByWithRelationInput[]> = {
  createdAt: { createdAt: "desc" },
  "-createdAt": { createdAt: "asc" },
  createdAt_asc: { createdAt: "asc" },
  name: { insuredParty: { name: "asc" } },
  "-name": { insuredParty: { name: "desc" } },
  name_desc: { insuredParty: { name: "desc" } },
  village: { village: "asc" },
  "-village": { village: "desc" },
  village_desc: { village: "desc" },
  policyNo: { policyNo: "asc" },
  "-policyNo": { policyNo: "desc" },
  policyNo_desc: { policyNo: "desc" },
  referenceNo: { referenceNo: "asc" },
  "-referenceNo": { referenceNo: "desc" },
  referenceNo_desc: { referenceNo: "desc" },
  customerId: { insuredParty: { customerId: "asc" } },
  customerId_desc: { insuredParty: { customerId: "desc" } },
  categoryKey: { category: { key: "asc" } },
  categoryKey_desc: { category: { key: "desc" } },
  categoryName: { category: { name: "asc" } },
  categoryName_desc: { category: { name: "desc" } },
  periodMonthText: { periodMonthText: "asc" },
  periodMonthText_desc: { periodMonthText: "desc" },
  policyTypeName: { policyType: { name: "asc" } },
  policyTypeName_desc: { policyType: { name: "desc" } },
  mobile: { insuredParty: { mobile: "asc" } },
  mobile_desc: { insuredParty: { mobile: "desc" } },
  /** SVKK ID column: insured party public id */
  svkkId: { insuredParty: { svkkPublicId: "asc" } },
  svkkId_desc: { insuredParty: { svkkPublicId: "desc" } },
  periodYearText: { periodYearText: "asc" },
  periodYearText_desc: { periodYearText: "desc" },
  /** List premium column: denormalized on Policy, synced when years change */
  premium: { listVkkPremium: "asc" },
  premium_desc: { listVkkPremium: "desc" },
};

export function parsePolicyListOrderBy(
  s: string | undefined,
): Prisma.PolicyOrderByWithRelationInput | Prisma.PolicyOrderByWithRelationInput[] {
  if (!s || !SORTS[s]) {
    return { createdAt: "desc" };
  }
  return SORTS[s]!;
}

function containsInsensitive(value: string): Prisma.StringFilter {
  return { contains: value };
}

/** Include common casings so filters match `MARCH`, `March`, etc. on case-sensitive DB collations. */
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

function createdAtRangeFilter(dateFrom?: string, dateTo?: string): Prisma.PolicyWhereInput | undefined {
  const fromBounds = dateFrom?.trim() ? utcDayBoundsFromIsoDate(dateFrom) : undefined;
  const toBounds = dateTo?.trim() ? utcDayBoundsFromIsoDate(dateTo) : undefined;
  if (fromBounds && toBounds) {
    return { createdAt: { gte: fromBounds.start, lte: toBounds.end } };
  }
  if (fromBounds) {
    return { createdAt: { gte: fromBounds.start } };
  }
  if (toBounds) {
    return { createdAt: { lte: toBounds.end } };
  }
  return undefined;
}

export function expandPeriodMonthTextVariants(months: string[]): string[] {
  const out = new Set<string>();
  for (const m of months) {
    const t = m.trim();
    if (!t) continue;
    out.add(t);
    out.add(t.toUpperCase());
    out.add(t.toLowerCase());
    out.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }
  return [...out];
}

export function buildPolicyListWhere(
  scope: MisScope,
  userId: string,
  permissions: Set<string>,
  q: PolicyListQuery,
): Prisma.PolicyWhereInput {
  const scopeWhere = buildPolicyReadWhere(scope, q.village, userId, permissions, q.villages);
  const s = q.search?.trim();
  const searchWhere: Prisma.PolicyWhereInput | undefined = s
    ? {
        OR: [
          { policyNo: containsInsensitive(s) },
          { referenceNo: containsInsensitive(s) },
          { area: containsInsensitive(s) },
          { nomineeName: containsInsensitive(s) },
          { insuranceCompany: containsInsensitive(s) },
          { insuredParty: { svkkPublicId: containsInsensitive(s) } },
          { insuredParty: { customerId: containsInsensitive(s) } },
          { insuredParty: { name: containsInsensitive(s) } },
          { insuredParty: { mobile: containsInsensitive(s) } },
          { insuredParty: { pan: containsInsensitive(s) } },
          {
            years: {
              some: {
                deletedAt: null,
                OR: [
                  { bankName: containsInsensitive(s) },
                  {
                    members: {
                      some: { deletedAt: null, name: containsInsensitive(s) },
                    },
                  },
                  {
                    payments: {
                      some: {
                        deletedAt: null,
                        OR: [
                          { cheque: { number: containsInsensitive(s) } },
                          { cheque: { bankName: containsInsensitive(s) } },
                          { cheque: { nameAsPerCheque: containsInsensitive(s) } },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      }
    : undefined;

  const monthFilter =
    q.month != null && q.year != null
      ? (() => {
          const from = new Date(Date.UTC(q.year, q.month - 1, 1));
          const to = new Date(Date.UTC(q.year, q.month, 0, 23, 59, 59, 999));
          return { createdAt: { gte: from, lte: to } } satisfies Prisma.PolicyWhereInput;
        })()
      : undefined;

  const sumStrs =
    q.sumInsuredStrs != null && q.sumInsuredStrs.length > 0
      ? q.sumInsuredStrs
      : q.sumInsuredStr
        ? [q.sumInsuredStr]
        : undefined;
  let sumMatch: Prisma.PolicyWhereInput | undefined;
  if (sumStrs?.length) {
    const decimals: Prisma.Decimal[] = [];
    for (const s of sumStrs) {
      try {
        decimals.push(new Prisma.Decimal(s));
      } catch {
        /* skip invalid */
      }
    }
    if (decimals.length === 1) {
      sumMatch = { years: { some: { deletedAt: null, sumInsured: decimals[0] } } };
    } else if (decimals.length > 1) {
      sumMatch = { years: { some: { deletedAt: null, sumInsured: { in: decimals } } } };
    }
  }

  const chequeFilter: Prisma.PolicyWhereInput | undefined = q.chequeStatus
    ? {
        years: {
          some: {
            deletedAt: null,
            payments: {
              some: {
                deletedAt: null,
                cheque: { is: { status: q.chequeStatus } },
              },
            },
          },
        },
      }
    : undefined;

  const categoryIds =
    q.categoryIds != null && q.categoryIds.length > 0 ? q.categoryIds : q.categoryId ? [q.categoryId] : undefined;
  const categoryKeys = [
    ...new Set(
      [
        ...(q.categoryKeys ?? []),
        ...(q.categoryKey?.trim() ? [q.categoryKey.trim()] : []),
      ].map((k) => k.trim()).filter(Boolean),
    ),
  ];
  let categoryFilter: Prisma.PolicyWhereInput | undefined;
  if (categoryIds?.length === 1) {
    categoryFilter = { categoryId: categoryIds[0] };
  } else if (categoryIds && categoryIds.length > 1) {
    categoryFilter = { categoryId: { in: categoryIds } };
  } else if (categoryKeys.length === 1) {
    categoryFilter = { category: { is: { key: categoryKeys[0] } } };
  } else if (categoryKeys.length > 1) {
    categoryFilter = { category: { is: { key: { in: categoryKeys } } } };
  }

  const adVariants =
    q.adProductVariants != null && q.adProductVariants.length > 0
      ? q.adProductVariants
      : q.adProductVariant
        ? [q.adProductVariant]
        : undefined;
  let adVariantPart: Prisma.PolicyWhereInput | undefined;
  if (adVariants?.length === 1) {
    adVariantPart = { adProductVariant: adVariants[0] };
  } else if (adVariants && adVariants.length > 1) {
    adVariantPart = { adProductVariant: { in: adVariants } };
  }

  const periodYearList =
    q.periodYearTexts != null && q.periodYearTexts.length > 0
      ? q.periodYearTexts
      : q.periodYearText?.trim()
        ? [q.periodYearText.trim()]
        : undefined;
  const yearLabelExtra = q.yearLabel?.trim() ? [q.yearLabel.trim()] : undefined;
  const fiscalYearLabels = [...new Set([...(periodYearList ?? []), ...(yearLabelExtra ?? [])])];

  const periodMonthList =
    q.periodMonthTexts != null && q.periodMonthTexts.length > 0
      ? q.periodMonthTexts
      : q.periodMonthText?.trim()
        ? [q.periodMonthText.trim()]
        : undefined;

  const areaList =
    q.areas != null && q.areas.length > 0 ? q.areas : q.area?.trim() ? [q.area.trim()] : undefined;

  const groupingList =
    q.policyGroupings != null && q.policyGroupings.length > 0
      ? q.policyGroupings
      : q.policyGrouping?.trim()
        ? [q.policyGrouping.trim()]
        : undefined;

  const extraParts: Prisma.PolicyWhereInput[] = [];
  if (categoryFilter) extraParts.push(categoryFilter);
  const policyTypeIdList =
    q.policyTypeIds != null && q.policyTypeIds.length > 0
      ? q.policyTypeIds
      : q.policyTypeId
        ? [q.policyTypeId]
        : undefined;
  if (policyTypeIdList?.length === 1) {
    extraParts.push({ policyTypeId: policyTypeIdList[0] });
  } else if (policyTypeIdList && policyTypeIdList.length > 1) {
    extraParts.push({ policyTypeId: { in: policyTypeIdList } });
  }
  if (adVariantPart) extraParts.push(adVariantPart);

  if (fiscalYearLabels.length > 0) {
    extraParts.push({
      OR: [
        { periodYearText: { in: fiscalYearLabels } },
        { years: { some: { deletedAt: null, yearLabel: { in: fiscalYearLabels } } } },
      ],
    });
  }

  if (periodMonthList?.length) {
    const variants = expandPeriodMonthTextVariants(periodMonthList);
    extraParts.push({ periodMonthText: { in: variants } });
  }

  if (areaList?.length === 1) {
    extraParts.push({ area: areaList[0] });
  } else if (areaList && areaList.length > 1) {
    extraParts.push({ area: { in: areaList } });
  }

  if (groupingList?.length === 1) {
    extraParts.push({ policyGrouping: groupingList[0] });
  } else if (groupingList && groupingList.length > 1) {
    extraParts.push({ policyGrouping: { in: groupingList } });
  }

  if (sumMatch) extraParts.push(sumMatch);
  if (chequeFilter) extraParts.push(chequeFilter);
  if (monthFilter) extraParts.push(monthFilter);

  const createdAtFilter = createdAtRangeFilter(q.dateFrom, q.dateTo);
  if (createdAtFilter) extraParts.push(createdAtFilter);

  const renewalAsOf =
    q.renewalAsOf?.trim() || q.dateTo?.trim() || new Date().toISOString().slice(0, 10);
  if (q.renewalBucket) {
    const bucketWhere = renewalBucketPolicyWhere(q.renewalBucket, renewalAsOf);
    if (bucketWhere) extraParts.push(bucketWhere);
  } else if (q.renewalPending) {
    const pendingWhere = renewalPendingPolicyWhere(renewalAsOf);
    if (pendingWhere) extraParts.push(pendingWhere);
  }

  const and: Prisma.PolicyWhereInput[] = [scopeWhere];
  if (searchWhere) and.push(searchWhere);
  if (extraParts.length) and.push({ AND: extraParts });

  return { AND: and };
}

export type PolicyListArgs = {
  where: Prisma.PolicyWhereInput;
  sort: string | undefined;
  page?: number;
  pageSize: number;
  /** cursor mode */
  cursor?: string;
  limit: number;
  usePage: boolean;
};

const listInclude = {
  insuredParty: true,
  policyType: true,
  category: { select: { id: true, key: true, name: true } },
  years: {
    where: { deletedAt: null },
    take: 1,
    orderBy: { yearLabel: "desc" as const },
    select: {
      yearLabel: true,
      sumInsured: true,
      vkkPremium: true,
      expectedNetPremium: true,
    },
  },
} satisfies Prisma.PolicyInclude;

/** Hard cap to bound memory/time for CSV export; adjust if deployments need more. */
export const POLICY_LIST_EXPORT_MAX_ROWS = 100_000;

export async function queryPolicyListAll(args: {
  where: Prisma.PolicyWhereInput;
  sort: string | undefined;
}): Promise<
  Prisma.PolicyGetPayload<{
    include: typeof listInclude;
  }>[]
> {
  const orderBy = parsePolicyListOrderBy(args.sort);
  return prisma.policy.findMany({
    where: args.where,
    orderBy,
    take: POLICY_LIST_EXPORT_MAX_ROWS,
    include: listInclude,
  });
}

export async function queryPolicyList(args: PolicyListArgs) {
  const orderBy = parsePolicyListOrderBy(args.sort);
  if (args.usePage) {
    const skip = (args.page! - 1) * args.pageSize;
    const [total, rows] = await prisma.$transaction([
      prisma.policy.count({ where: args.where }),
      prisma.policy.findMany({
        where: args.where,
        orderBy,
        skip,
        take: args.pageSize,
        include: listInclude,
      }),
    ]);
    return {
      items: rows,
      total,
      page: args.page!,
      pageSize: args.pageSize,
      totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
    };
  }
  const rows = await prisma.policy.findMany({
    where: args.where,
    orderBy,
    take: args.limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    include: listInclude,
  });
  let nextCursor: string | undefined;
  if (rows.length > args.limit) {
    const last = rows.pop()!;
    nextCursor = last.id;
  }
  return { items: rows, nextCursor };
}

function mergeWhere(
  a: Prisma.PolicyWhereInput,
  b: Prisma.PolicyWhereInput,
): Prisma.PolicyWhereInput {
  return { AND: [a, b] };
}

export async function distinctFilterOptions(
  scopeWhere: Prisma.PolicyWhereInput,
): Promise<{
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
  policyGroupings: string[];
}> {
  const [vRows, aRows, sumRows, fRows, mRows, optionRows, groupingRows] = await Promise.all([
    prisma.policy.groupBy({
      by: ["village"],
      where: mergeWhere(scopeWhere, { NOT: { OR: [{ village: null }, { village: { equals: "" } }] } }),
    }),
    prisma.policy.groupBy({
      by: ["area"],
      where: mergeWhere(scopeWhere, { NOT: { OR: [{ area: null }, { area: { equals: "" } }] } }),
    }),
    prisma.policyYear.groupBy({
      by: ["sumInsured"],
      where: { deletedAt: null, sumInsured: { not: null }, policy: scopeWhere },
    }),
    prisma.policy.groupBy({
      by: ["periodYearText"],
      where: mergeWhere(scopeWhere, {
        NOT: { OR: [{ periodYearText: null }, { periodYearText: { equals: "" } }] },
      }),
    }),
    prisma.policy.groupBy({
      by: ["periodMonthText"],
      where: mergeWhere(scopeWhere, {
        NOT: { OR: [{ periodMonthText: null }, { periodMonthText: { equals: "" } }] },
      }),
    }),
    prisma.policyGroupingOption.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.policy.groupBy({
      by: ["policyGrouping"],
      where: mergeWhere(scopeWhere, {
        NOT: { OR: [{ policyGrouping: null }, { policyGrouping: { equals: "" } }] },
      }),
    }),
  ]);
  const policyGroupings = Array.from(
    new Set([
      ...optionRows.map((r) => r.name),
      ...groupingRows
        .map((r) => r.policyGrouping)
        .filter((x): x is string => x != null && x.length > 0),
    ]),
  ).sort((a, b) => a.localeCompare(b));
  return {
    villages: vRows
      .map((r) => r.village)
      .filter((x): x is string => x != null && x.length > 0)
      .sort((a, b) => a.localeCompare(b)),
    areas: aRows
      .map((r) => r.area)
      .filter((x): x is string => x != null && x.length > 0)
      .sort((a, b) => a.localeCompare(b)),
    sumInsuredValues: sumRows
      .map((r) => r.sumInsured)
      .filter((d): d is Prisma.Decimal => d != null)
      .map((d) => d.toString())
      .sort((a, b) => Number(a) - Number(b)),
    periodYearTexts: fRows
      .map((r) => r.periodYearText)
      .filter((x): x is string => x != null && x.length > 0)
      .sort(),
    periodMonthTexts: mRows
      .map((r) => r.periodMonthText)
      .filter((x): x is string => x != null && x.length > 0)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    policyGroupings,
  };
}
