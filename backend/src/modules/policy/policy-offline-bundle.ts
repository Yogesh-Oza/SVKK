import { createHash } from "node:crypto";
import { DropdownType, PolicyChartKind, ChartMode, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { loadCategoryByKeyMap, resolveCategoryRef } from "../../lib/category-display.js";
import type { MisScope } from "../../services/mis-scope.service.js";
import { buildPolicyReadWhere } from "../../services/mis-scope.service.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";
import { maskInsuredParty } from "../../domain/pii.js";
import { overlayInsuredPartyWithPolicySnapshot, resolvePolicyHolderName } from "./policy-holder-snapshot.js";
import {
  buildPolicyListWhere,
  parsePolicyListOrderBy,
  type PolicyListQuery,
} from "./policy.list.js";
import { policyYearPaymentsInclude } from "./policy.service.js";

export type OfflineBundleQuery = {
  yearFrom?: string;
  limit?: number;
  offset?: number;
  updatedAfter?: string;
  includeDetails?: boolean;
  /** When true, omit fiscal-year filter and allow paginating the full in-scope set. */
  allYears?: boolean;
};

export function fiscalYearGteFilter(yearFrom: string): Prisma.PolicyWhereInput {
  const startYear = Number(String(yearFrom).replace(/\D/g, "").slice(0, 4));
  if (!Number.isFinite(startYear) || startYear < 1900) {
    return {};
  }
  const labels: string[] = [];
  for (let y = startYear; y <= startYear + 30; y++) {
    const endShort = String(y + 1).slice(-2);
    labels.push(`${y}-${endShort}`);
  }
  return {
    OR: [
      { periodYearText: { in: labels } },
      { years: { some: { deletedAt: null, yearLabel: { in: labels } } } },
    ],
  };
}

function scopeHash(userId: string, permissions: Set<string>, scope: MisScope): string {
  const payload = JSON.stringify({
    userId,
    permissions: [...permissions].sort(),
    scope:
      scope.kind === "full"
        ? { kind: "full" }
        : {
            kind: "geo",
            villages: scope.villageValues.slice().sort(),
            areas: scope.areaValues.slice().sort(),
          },
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function maskParty(
  permissions: Set<string>,
  policy: {
    insuredParty: {
      name: string;
      dateOfBirth?: Date | null;
      pan?: string | null;
      aadhaarNo?: string | null;
      svkkPublicId: string;
      mobile: string;
      email?: string | null;
      customerId?: string | null;
    };
    holderName?: string | null;
    holderDateOfBirth?: Date | null;
    holderPan?: string | null;
    holderAadhaarNo?: string | null;
  },
) {
  return maskInsuredParty(
    permissions,
    overlayInsuredPartyWithPolicySnapshot(policy.insuredParty, policy) ?? null,
  );
}

const offlineListInclude = {
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

type OfflineListPolicyRow = Prisma.PolicyGetPayload<{ include: typeof offlineListInclude }>;

function decimalStr(v: Prisma.Decimal | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

function toListRow(
  r: OfflineListPolicyRow,
  categoryByKey: Awaited<ReturnType<typeof loadCategoryByKeyMap>>,
) {
  const yearLabel = r.periodYearText?.trim() || r.years[0]?.yearLabel?.trim() || "";
  const y0 = r.years[0];
  const category = resolveCategoryRef(r.category, r.categoryText, categoryByKey);
  const party = r.insuredParty;
  return {
    id: r.id,
    policyNo: r.policyNo,
    holderName: resolvePolicyHolderName(r, party),
    svkkId: party.svkkPublicId,
    mobile: party.mobile ?? null,
    email: party.email ?? null,
    pan: party.pan ?? null,
    village: r.village,
    area: r.area,
    yearLabel,
    periodMonthText: r.periodMonthText,
    periodYearText: r.periodYearText,
    customerId: party.customerId,
    previousPolicyNo: r.previousPolicyNo,
    referenceNo: r.referenceNo,
    vkkPremium: decimalStr(y0?.vkkPremium ?? r.listVkkPremium),
    sumInsured: decimalStr(y0?.sumInsured),
    remarks: r.remarks,
    personsInsuredCount: r.personsInsuredCount,
    whatsappNo: r.whatsappNo,
    policyGrouping: r.policyGrouping,
    adProductVariant: r.adProductVariant,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
    policyType: {
      id: r.policyType.id,
      name: r.policyType.name,
      key: r.policyType.key,
    },
    category: category
      ? { id: category.id, key: category.key, name: category.name }
      : null,
    categoryText: r.categoryText,
    insuredParty: {
      svkkPublicId: party.svkkPublicId,
      name: party.name,
      mobile: party.mobile,
      email: party.email,
      customerId: party.customerId,
      pan: party.pan,
    },
    years: r.years.map((y) => ({
      yearLabel: y.yearLabel,
      vkkPremium: decimalStr(y.vkkPremium),
      sumInsured: decimalStr(y.sumInsured),
    })),
  };
}

async function loadPremiumSnapshot() {
  const types = await prisma.policyType.findMany({
    orderBy: { name: "asc" },
    include: {
      charts: { orderBy: [{ chartKind: "asc" }, { version: "desc" }] },
    },
  });
  let version = 0;
  const policyTypes = types.map((t) => {
    const seen: Record<string, unknown> = {};
    for (const c of t.charts) {
      if (seen[c.chartKind]) continue;
      seen[c.chartKind] = c.premiumMatrix;
      version = Math.max(version, c.version);
    }
    return {
      key: t.key,
      name: t.name,
      description: t.description ?? "",
      mode: t.chartMode === ChartMode.HOLDER_MEMBER ? ("different" as const) : ("same" as const),
      discount: t.discountConfig,
      charts: {
        combined: seen[PolicyChartKind.COMBINED],
        holder: seen[PolicyChartKind.HOLDER],
        member: seen[PolicyChartKind.MEMBER],
      },
    };
  });
  return {
    premiumSnapshot: { policyTypes },
    premiumSnapshotVersion: String(version),
  };
}

async function loadPolicyChartsByTypeId(): Promise<
  Record<string, Array<{ id: string; policyTypeId: string; chartKind: string; version: number }>>
> {
  const rows = await prisma.policyChart.findMany({
    orderBy: [{ policyTypeId: "asc" }, { version: "desc" }, { chartKind: "asc" }],
    select: {
      id: true,
      policyTypeId: true,
      version: true,
      chartKind: true,
    },
  });
  const byType: Record<
    string,
    Array<{ id: string; policyTypeId: string; chartKind: string; version: number }>
  > = {};
  for (const row of rows) {
    const list = byType[row.policyTypeId] ?? [];
    if (list.some((c) => c.chartKind === row.chartKind)) continue;
    list.push({
      id: row.id,
      policyTypeId: row.policyTypeId,
      chartKind: row.chartKind,
      version: row.version,
    });
    byType[row.policyTypeId] = list;
  }
  return byType;
}

async function loadReferenceBundle(userId: string, permissions: Set<string>) {
  const [dropdownRows, categories, policyTypes, groupings, premium, policyChartsByTypeId] =
    await Promise.all([
    prisma.dropdownOption.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.policyType.findMany({ orderBy: { name: "asc" } }),
    prisma.policyGroupingOption.findMany({ orderBy: { name: "asc" } }),
    loadPremiumSnapshot(),
    loadPolicyChartsByTypeId(),
  ]);

  const grouped: Record<string, { value: string; label: string }[]> = {};
  for (const t of Object.values(DropdownType)) {
    grouped[t] = [];
  }
  for (const row of dropdownRows) {
    grouped[row.type]!.push({ value: row.value, label: row.label });
  }

  return {
    dropdowns: grouped,
    categories: categories.map((c) => ({
      id: c.id,
      value: (c.key ?? "").trim(),
      label: c.name ?? c.key ?? "",
    })),
    policyTypes: policyTypes.map((t) => ({
      id: t.id,
      value: (t.key ?? "").trim(),
      label: t.name ?? t.key ?? "",
    })),
    policyGroupings: groupings.map((g) => g.name),
    policyChartsByTypeId,
    premiumSnapshot: premium.premiumSnapshot,
    premiumSnapshotVersion: premium.premiumSnapshotVersion,
    premiumSnapshotDate: new Date().toISOString(),
  };
}

export async function buildPolicyOfflineBundle(input: {
  userId: string;
  permissions: Set<string>;
  scope: MisScope;
  query: OfflineBundleQuery;
}) {
  const { userId, permissions, scope, query } = input;
  const limit = Math.min(Math.max(query.limit ?? 500, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const scopeWhere = buildPolicyReadWhere(scope, undefined, userId, permissions, undefined);

  const listFilter: PolicyListQuery = { sort: "-updatedAt" };
  let extra: Prisma.PolicyWhereInput = { deletedAt: null };

  if (query.updatedAfter) {
    const since = new Date(query.updatedAfter);
    if (!Number.isNaN(since.getTime())) {
      extra = {
        OR: [
          { updatedAt: { gt: since } },
          { years: { some: { deletedAt: null, updatedAt: { gt: since } } } },
        ],
      };
    }
  } else if (!query.allYears && query.yearFrom?.trim()) {
    extra = { AND: [extra, fiscalYearGteFilter(query.yearFrom.trim())] };
  }

  const where = buildPolicyListWhere(scope, userId, permissions, listFilter);
  const merged: Prisma.PolicyWhereInput = { AND: [scopeWhere, where, extra] };

  const totalAvailable = await prisma.policy.count({ where: merged });

  const rows = await prisma.policy.findMany({
    where: merged,
    orderBy: parsePolicyListOrderBy("-updatedAt"),
    skip: query.updatedAfter ? undefined : offset,
    take: limit,
    include: offlineListInclude,
  });

  const categoryByKey = await loadCategoryByKeyMap();
  const policies = rows.map((r) => toListRow(r, categoryByKey));
  const policyIds = rows.map((r) => r.id);

  let details: unknown[] = [];
  if (query.includeDetails !== false && policyIds.length > 0) {
    const detailRows = await prisma.policy.findMany({
      where: { id: { in: policyIds }, deletedAt: null },
      include: {
        insuredParty: true,
        policyType: true,
        category: true,
        years: {
          where: { deletedAt: null },
          orderBy: { yearLabel: "desc" },
          include: {
            members: { where: { deletedAt: null } },
            policyChart: true,
            payments: policyYearPaymentsInclude,
          },
        },
      },
    });
    const categoryByKey = await loadCategoryByKeyMap();
    details = detailRows.map((row) => {
      if (!hasPermissionInSet(permissions, "policy:commission")) {
        for (const y of row.years) {
          (y as { commissionAmount?: null }).commissionAmount = null;
          (y as { vkkCommission?: null }).vkkCommission = null;
        }
      }
      const category = resolveCategoryRef(row.category, row.categoryText, categoryByKey);
      return {
        ...row,
        updatedAt: row.updatedAt.toISOString(),
        category,
        insuredParty: maskParty(permissions, row),
      };
    });
  }

  let deletedPolicyIds: string[] | undefined;
  if (query.updatedAfter) {
    const since = new Date(query.updatedAfter);
    if (!Number.isNaN(since.getTime())) {
      const deleted = await prisma.policy.findMany({
        where: {
          ...scopeWhere,
          deletedAt: { gt: since },
        },
        select: { id: true },
        take: 500,
      });
      deletedPolicyIds = deleted.map((d) => d.id);
    }
  }

  const reference = await loadReferenceBundle(userId, permissions);
  const syncedAt = new Date().toISOString();

  const batchOffset = query.updatedAfter ? 0 : offset;
  const hasMore = !query.updatedAfter && batchOffset + policies.length < totalAvailable;

  return {
    meta: {
      syncedAt,
      policyCount: policies.length,
      totalAvailable,
      offset: batchOffset,
      hasMore,
      premiumSnapshotVersion: reference.premiumSnapshotVersion,
      scopeHash: scopeHash(userId, permissions, scope),
    },
    policies,
    details,
    reference,
    ...(deletedPolicyIds?.length ? { deletedPolicyIds } : {}),
  };
}

export async function allocateOfflineReferenceNoBatch(input: {
  count: number;
  policyGrouping?: string;
  month?: string;
  year?: string;
}): Promise<string[]> {
  const count = Math.min(Math.max(input.count, 1), 50);
  const grouping = input.policyGrouping?.trim() || "OTHER";
  const month = input.month?.trim() || "JUN";
  const year = input.year?.trim() || String(new Date().getFullYear());
  const { allocateNextPolicyReferenceNo } = await import("./policy.service.js");
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      await allocateNextPolicyReferenceNo({
        policyGrouping: grouping,
        month,
        year,
      }),
    );
  }
  return out;
}
