import {
  Prisma,
  type ChequeStatus,
  type AdProductVariant,
  type UserRole,
} from "@prisma/client";
import type { MisScope } from "../../services/mis-scope.service.js";
import { buildPolicyReadWhere } from "../../services/mis-scope.service.js";
import { prisma } from "../../lib/prisma.js";

export type PolicyListQuery = {
  search?: string;
  village?: string;
  yearLabel?: string;
  periodYearText?: string;
  periodMonthText?: string;
  categoryId?: string;
  categoryKey?: string;
  policyTypeId?: string;
  adProductVariant?: AdProductVariant;
  month?: number;
  year?: number;
  area?: string;
  sumInsuredStr?: string;
  policyGrouping?: string;
  chequeStatus?: ChequeStatus;
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
  policyTypeName: { policyType: { name: "asc" } },
  policyTypeName_desc: { policyType: { name: "desc" } },
  mobile: { insuredParty: { mobile: "asc" } },
  mobile_desc: { insuredParty: { mobile: "desc" } },
};

function parseOrderBy(s: string | undefined): Prisma.PolicyOrderByWithRelationInput | Prisma.PolicyOrderByWithRelationInput[] {
  if (!s || !SORTS[s]) {
    return { createdAt: "desc" };
  }
  return SORTS[s]!;
}

export function buildPolicyListWhere(
  scope: MisScope,
  userId: string,
  role: UserRole,
  q: PolicyListQuery,
): Prisma.PolicyWhereInput {
  const scopeWhere = buildPolicyReadWhere(scope, q.village, userId, role);
  const s = q.search?.trim();
  const searchWhere: Prisma.PolicyWhereInput | undefined = s
    ? {
        OR: [
          { policyNo: { contains: s } },
          { referenceNo: { contains: s } },
          { area: { contains: s } },
          { nomineeName: { contains: s } },
          { insuranceCompany: { contains: s } },
          { insuredParty: { svkkPublicId: { contains: s } } },
          { insuredParty: { customerId: { contains: s } } },
          { insuredParty: { name: { contains: s } } },
          { insuredParty: { mobile: { contains: s } } },
          { insuredParty: { pan: { contains: s } } },
          {
            years: {
              some: {
                deletedAt: null,
                OR: [
                  { bankName: { contains: s } },
                  {
                    members: {
                      some: { deletedAt: null, name: { contains: s } },
                    },
                  },
                  {
                    payments: {
                      some: {
                        deletedAt: null,
                        OR: [
                          { cheque: { number: { contains: s } } },
                          { cheque: { bankName: { contains: s } } },
                          { cheque: { nameAsPerCheque: { contains: s } } },
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

  let sumMatch: Prisma.PolicyWhereInput | undefined;
  if (q.sumInsuredStr) {
    try {
      const d = new Prisma.Decimal(q.sumInsuredStr);
      sumMatch = {
        years: { some: { deletedAt: null, sumInsured: d } },
      };
    } catch {
      sumMatch = undefined;
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

  const extra: Prisma.PolicyWhereInput = {
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.categoryKey ? { category: { is: { key: q.categoryKey } } } : {}),
    ...(q.policyTypeId ? { policyTypeId: q.policyTypeId } : {}),
    ...(q.adProductVariant ? { adProductVariant: q.adProductVariant } : {}),
    ...(q.yearLabel
      ? { years: { some: { yearLabel: q.yearLabel, deletedAt: null } } }
      : {}),
    ...(q.periodYearText ? { periodYearText: q.periodYearText } : {}),
    ...(q.periodMonthText
      ? { periodMonthText: { contains: q.periodMonthText } }
      : {}),
    ...(q.area ? { area: { contains: q.area } } : {}),
    ...(q.policyGrouping ? { policyGrouping: q.policyGrouping } : {}),
    ...(sumMatch ? sumMatch : {}),
    ...(chequeFilter ? chequeFilter : {}),
    ...(monthFilter ? monthFilter : {}),
  };

  const and: Prisma.PolicyWhereInput[] = [scopeWhere];
  if (searchWhere) and.push(searchWhere);
  if (Object.keys(extra).length) and.push(extra);

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
  const orderBy = parseOrderBy(args.sort);
  return prisma.policy.findMany({
    where: args.where,
    orderBy,
    take: POLICY_LIST_EXPORT_MAX_ROWS,
    include: listInclude,
  });
}

export async function queryPolicyList(args: PolicyListArgs) {
  const orderBy = parseOrderBy(args.sort);
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
      .sort(),
    policyGroupings,
  };
}
