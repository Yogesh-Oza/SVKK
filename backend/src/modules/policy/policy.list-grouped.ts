import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  buildPolicyListWhere,
  parsePolicyListOrderBy,
  type PolicyListArgs,
  type PolicyListQuery,
} from "./policy.list.js";
import type { MisScope } from "../../services/mis-scope.service.js";

export type PolicyListYearEntry = {
  policyId: string;
  yearLabel: string;
  referenceNo: string | null;
  policyNo: string | null;
  vkkPremium: Prisma.Decimal | null;
  sumInsured: Prisma.Decimal | null;
};

export type PolicyListGroupedItem = {
  svkkPublicId: string;
  insuredParty: {
    id: string;
    svkkPublicId: string;
    name: string;
    mobile: string;
    email: string | null;
    customerId: string | null;
    pan: string | null;
  };
  primaryPolicyId: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  area: string | null;
  remarks: string | null;
  periodMonthText: string | null;
  periodYearText: string | null;
  whatsappNo: string | null;
  policyGrouping: string | null;
  personsInsuredCount: number | null;
  adProductVariant: string | null;
  policyType: { id: string; name: string };
  category: { id: string; key: string; name: string } | null;
  years: PolicyListYearEntry[];
};

const policyInclude = {
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
    },
  },
} satisfies Prisma.PolicyInclude;

type PolicyRow = Prisma.PolicyGetPayload<{ include: typeof policyInclude }>;

function yearLabelFromPolicy(p: PolicyRow): string {
  return p.periodYearText?.trim() || p.years[0]?.yearLabel?.trim() || "";
}

function compareYearLabelsDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function pickPrimaryPolicy(policies: PolicyRow[]): PolicyRow {
  return [...policies].sort((a, b) => {
    const ya = yearLabelFromPolicy(a);
    const yb = yearLabelFromPolicy(b);
    const yc = compareYearLabelsDesc(ya, yb);
    if (yc !== 0) return yc;
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0]!;
}

function toYearEntry(p: PolicyRow): PolicyListYearEntry | null {
  const yearLabel = yearLabelFromPolicy(p);
  if (!yearLabel) return null;
  const y0 = p.years[0];
  return {
    policyId: p.id,
    yearLabel,
    referenceNo: p.referenceNo,
    policyNo: p.policyNo,
    vkkPremium: y0?.vkkPremium ?? p.listVkkPremium,
    sumInsured: y0?.sumInsured ?? null,
  };
}

function buildGroupedItem(partyId: string, policies: PolicyRow[]): PolicyListGroupedItem | null {
  if (policies.length === 0) return null;
  const primary = pickPrimaryPolicy(policies);
  const party = primary.insuredParty;
  const years = policies
    .map(toYearEntry)
    .filter((y): y is PolicyListYearEntry => y != null)
    .sort((a, b) => compareYearLabelsDesc(a.yearLabel, b.yearLabel));
  if (years.length === 0) return null;

  return {
    svkkPublicId: party.svkkPublicId,
    insuredParty: {
      id: party.id,
      svkkPublicId: party.svkkPublicId,
      name: party.name,
      mobile: party.mobile,
      email: party.email,
      customerId: party.customerId,
      pan: party.pan,
    },
    primaryPolicyId: primary.id,
    policyNo: years[0]?.policyNo ?? primary.policyNo,
    referenceNo: primary.referenceNo,
    village: primary.village,
    area: primary.area,
    remarks: primary.remarks,
    periodMonthText: primary.periodMonthText,
    periodYearText: primary.periodYearText ?? years[0]?.yearLabel ?? null,
    whatsappNo: primary.whatsappNo,
    policyGrouping: primary.policyGrouping,
    personsInsuredCount: primary.personsInsuredCount,
    adProductVariant: primary.adProductVariant,
    policyType: { id: primary.policyType.id, name: primary.policyType.name },
    category: primary.category,
    years,
  };
}

async function countInsuredPartiesWithPolicies(where: Prisma.PolicyWhereInput): Promise<number> {
  return prisma.insuredParty.count({
    where: { policies: { some: where } },
  });
}

type PartyPageOrder = Prisma.InsuredPartyOrderByWithRelationInput;

function partyOrderFromSort(sort: string | undefined): PartyPageOrder {
  switch (sort) {
    case "name":
      return { name: "asc" };
    case "-name":
    case "name_desc":
      return { name: "desc" };
    case "svkkId":
      return { svkkPublicId: "asc" };
    case "svkkId_desc":
      return { svkkPublicId: "desc" };
    case "customerId":
      return { customerId: "asc" };
    case "customerId_desc":
      return { customerId: "desc" };
    case "mobile":
      return { mobile: "asc" };
    case "mobile_desc":
      return { mobile: "desc" };
    default:
      return { name: "asc" };
  }
}

async function pageInsuredPartyIdsByPartySort(
  where: Prisma.PolicyWhereInput,
  sort: string | undefined,
  skip: number,
  take: number,
): Promise<string[]> {
  const rows = await prisma.insuredParty.findMany({
    where: { policies: { some: where } },
    orderBy: partyOrderFromSort(sort),
    skip,
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const PARTY_SORT_KEYS = new Set([
  "name",
  "-name",
  "name_desc",
  "svkkId",
  "svkkId_desc",
  "customerId",
  "customerId_desc",
  "mobile",
  "mobile_desc",
]);

async function pageInsuredPartyIdsByDistinctPolicy(
  where: Prisma.PolicyWhereInput,
  sort: string | undefined,
  skip: number,
  take: number,
): Promise<string[]> {
  const rows = await prisma.policy.findMany({
    where,
    distinct: ["insuredPartyId"],
    orderBy: parsePolicyListOrderBy(sort),
    skip,
    take,
    select: { insuredPartyId: true },
  });
  return rows.map((r) => r.insuredPartyId);
}

async function pageInsuredPartyIds(
  where: Prisma.PolicyWhereInput,
  sort: string | undefined,
  skip: number,
  take: number,
): Promise<string[]> {
  if (sort && PARTY_SORT_KEYS.has(sort)) {
    return pageInsuredPartyIdsByPartySort(where, sort, skip, take);
  }
  return pageInsuredPartyIdsByDistinctPolicy(where, sort, skip, take);
}

async function fetchPoliciesForParties(
  where: Prisma.PolicyWhereInput,
  partyIds: string[],
): Promise<PolicyRow[]> {
  if (partyIds.length === 0) return [];
  return prisma.policy.findMany({
    where: { AND: [where, { insuredPartyId: { in: partyIds } }] },
    include: policyInclude,
    orderBy: [{ periodYearText: "desc" }, { createdAt: "desc" }],
  });
}

function groupPoliciesByParty(policies: PolicyRow[]): Map<string, PolicyRow[]> {
  const map = new Map<string, PolicyRow[]>();
  for (const p of policies) {
    const list = map.get(p.insuredPartyId) ?? [];
    list.push(p);
    map.set(p.insuredPartyId, list);
  }
  return map;
}

function assembleGroupedPage(
  partyIds: string[],
  policies: PolicyRow[],
): PolicyListGroupedItem[] {
  const byParty = groupPoliciesByParty(policies);
  const items: PolicyListGroupedItem[] = [];
  for (const partyId of partyIds) {
    const group = byParty.get(partyId);
    if (!group) continue;
    const item = buildGroupedItem(partyId, group);
    if (item) items.push(item);
  }
  return items;
}

export async function queryPolicyListGrouped(args: PolicyListArgs) {
  const where = args.where;
  if (args.usePage) {
    const skip = (args.page! - 1) * args.pageSize;
    const [total, partyIds] = await Promise.all([
      countInsuredPartiesWithPolicies(where),
      pageInsuredPartyIds(where, args.sort, skip, args.pageSize),
    ]);
    const policies = await fetchPoliciesForParties(where, partyIds);
    return {
      items: assembleGroupedPage(partyIds, policies),
      total,
      page: args.page!,
      pageSize: args.pageSize,
      totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
    };
  }

  const partyIds = await pageInsuredPartyIds(where, args.sort, 0, args.limit + 1);
  let nextCursor: string | undefined;
  if (partyIds.length > args.limit) {
    const lastPartyId = partyIds.pop()!;
    const lastPolicies = await fetchPoliciesForParties(where, [lastPartyId]);
    const lastGroup = buildGroupedItem(lastPartyId, lastPolicies);
    nextCursor = lastGroup?.primaryPolicyId;
  }
  const pagePartyIds = partyIds.slice(0, args.limit);
  const policies = await fetchPoliciesForParties(where, pagePartyIds);
  return {
    items: assembleGroupedPage(pagePartyIds, policies),
    nextCursor,
  };
}

export type GroupedListRouteContext = {
  scope: MisScope;
  userId: string;
  permissions: Set<string>;
  query: PolicyListQuery;
};

export function groupedListWhere(ctx: GroupedListRouteContext): Prisma.PolicyWhereInput {
  return buildPolicyListWhere(ctx.scope, ctx.userId, ctx.permissions, ctx.query);
}
