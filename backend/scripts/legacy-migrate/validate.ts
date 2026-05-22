import type { PrismaClient } from "@prisma/client";
import { PolicyChartKind } from "@prisma/client";
import { normalizeLegacyText } from "./normalize.js";
import { mapPolicyTypeKey, transformPolicyRow, trimPolicyNo } from "./transform.js";
import type { LegacyPolicyRow } from "./types.js";

/** Admin "Single chart" uploads use COMBINED; HOLDER_MEMBER types use HOLDER (same as policy.service). */
const MIGRATION_PRIMARY_CHART_KINDS: PolicyChartKind[] = [
  PolicyChartKind.HOLDER,
  PolicyChartKind.COMBINED,
];

async function resolveMigrationChartId(
  prisma: PrismaClient,
  policyTypeId: string,
): Promise<string | null> {
  for (const chartKind of MIGRATION_PRIMARY_CHART_KINDS) {
    const chart = await prisma.policyChart.findFirst({
      where: { policyTypeId, version: 1, chartKind },
      select: { id: true },
    });
    if (chart) return chart.id;
  }
  return null;
}

function buildPrimaryChartByPolicyTypeId(
  charts: { id: string; policyTypeId: string; chartKind: PolicyChartKind }[],
): Map<string, string> {
  const slots = new Map<string, Partial<Record<PolicyChartKind, string>>>();
  for (const c of charts) {
    const row = slots.get(c.policyTypeId) ?? {};
    row[c.chartKind] = c.id;
    slots.set(c.policyTypeId, row);
  }
  const out = new Map<string, string>();
  for (const [policyTypeId, row] of slots) {
    const id =
      row[PolicyChartKind.HOLDER] ?? row[PolicyChartKind.COMBINED] ?? null;
    if (id) out.set(policyTypeId, id);
  }
  return out;
}

export interface ResolvedTargets {
  policyTypeId: string;
  categoryId: string | null;
  holderChartId: string;
}

export async function resolveTargets(
  prisma: PrismaClient,
  policyTypeKey: string,
  categoryKey: string | null,
): Promise<
  | { ok: true; data: ResolvedTargets }
  | { ok: false; code: "unknownPolicyType" | "missingChart"; reason: string }
> {
  const policyType = await prisma.policyType.findUnique({ where: { key: policyTypeKey } });
  if (!policyType) {
    return {
      ok: false,
      code: "unknownPolicyType",
      reason: `PolicyType not in target DB: key=${policyTypeKey}`,
    };
  }

  const chartId = await resolveMigrationChartId(prisma, policyType.id);
  if (!chartId) {
    return {
      ok: false,
      code: "missingChart",
      reason: `No HOLDER or COMBINED PolicyChart v1 for policyTypeId=${policyType.id}`,
    };
  }

  let categoryId: string | null = null;
  if (categoryKey) {
    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    categoryId = cat?.id ?? null;
  }

  return {
    ok: true,
    data: {
      policyTypeId: policyType.id,
      categoryId,
      holderChartId: chartId,
    },
  };
}

export type ValidateOutcome =
  | { ok: true; targets: ResolvedTargets }
  | {
      ok: false;
      code: "missingRefNo" | "unknownPolicyType" | "missingChart" | "validationErrors";
      reason: string;
    };

/** In-memory maps so dry-run / apply do not query Prisma per legacy row. */
export interface MigrationLookups {
  policyTypes: Map<string, { id: string; key: string }>;
  holderChartByPolicyTypeId: Map<string, string>;
  categories: Map<string, { id: string; key: string }>;
  policyGroupings: Map<string, string>;
}

export interface DuplicateCheckResult {
  duplicate: boolean;
  code?: "DUPLICATE_POLICY_NO" | "OVERLAPPING_DATES";
  reason?: string;
}

export type PolicyNoConflictEntry = {
  id: string;
  referenceNo: string | null;
};

/** `${policyTypeId}:${policyNo}` → existing policy (for chunk prefetch). */
export type PolicyNoConflictMap = Map<string, PolicyNoConflictEntry>;

export async function prefetchPolicyNoConflicts(
  prisma: PrismaClient,
  rows: LegacyPolicyRow[],
  lookups: MigrationLookups,
): Promise<PolicyNoConflictMap> {
  const byType = new Map<string, Set<string>>();
  for (const row of rows) {
    const policyNo = trimPolicyNo(row.policy_no);
    if (!policyNo) continue;
    const policyTypeKey = mapPolicyTypeKey(row.policy_type);
    if (!policyTypeKey) continue;
    const pt = lookups.policyTypes.get(policyTypeKey);
    if (!pt) continue;
    const set = byType.get(pt.id) ?? new Set();
    set.add(policyNo);
    byType.set(pt.id, set);
  }

  const map: PolicyNoConflictMap = new Map();
  for (const [policyTypeId, policyNos] of byType) {
    if (policyNos.size === 0) continue;
    const existing = await prisma.policy.findMany({
      where: {
        policyTypeId,
        policyNo: { in: [...policyNos] },
        deletedAt: null,
      },
      select: { id: true, policyNo: true, referenceNo: true },
    });
    for (const p of existing) {
      if (!p.policyNo) continue;
      map.set(`${policyTypeId}:${p.policyNo}`, {
        id: p.id,
        referenceNo: p.referenceNo,
      });
    }
  }
  return map;
}

export function checkBusinessDuplicatesFast(
  row: LegacyPolicyRow,
  policyTypeId: string,
  conflictMap: PolicyNoConflictMap,
  excludeReferenceNo?: string,
): DuplicateCheckResult {
  const policyNo = trimPolicyNo(row.policy_no);
  if (policyNo) {
    const existing = conflictMap.get(`${policyTypeId}:${policyNo}`);
    if (existing && existing.referenceNo !== excludeReferenceNo) {
      return {
        duplicate: true,
        code: "DUPLICATE_POLICY_NO",
        reason: `policyNo=${policyNo} already exists on policy ${existing.id}`,
      };
    }
  }
  return { duplicate: false };
}

export async function buildMigrationLookups(prisma: PrismaClient): Promise<MigrationLookups> {
  const [types, charts, cats, groupings] = await Promise.all([
    prisma.policyType.findMany({ select: { id: true, key: true } }),
    prisma.policyChart.findMany({
      where: {
        version: 1,
        chartKind: { in: MIGRATION_PRIMARY_CHART_KINDS },
      },
      select: { id: true, policyTypeId: true, chartKind: true },
    }),
    prisma.category.findMany({ select: { id: true, key: true } }),
    prisma.policyGroupingOption.findMany({ select: { name: true } }),
  ]);
  const policyGroupings = new Map<string, string>();
  for (const g of groupings) {
    policyGroupings.set(normalizeLegacyText(g.name), g.name);
  }
  return {
    policyTypes: new Map(types.map((t) => [t.key, t])),
    holderChartByPolicyTypeId: buildPrimaryChartByPolicyTypeId(charts),
    categories: new Map(cats.map((c) => [c.key, c])),
    policyGroupings,
  };
}

export async function checkBusinessDuplicates(
  prisma: PrismaClient,
  row: LegacyPolicyRow,
  policyTypeId: string,
  mobile: string,
  excludeReferenceNo?: string,
): Promise<DuplicateCheckResult> {
  const policyNo = trimPolicyNo(row.policy_no);
  if (policyNo) {
    const existing = await prisma.policy.findFirst({
      where: {
        policyNo,
        policyTypeId,
        deletedAt: null,
        ...(excludeReferenceNo ? { NOT: { referenceNo: excludeReferenceNo } } : {}),
      },
    });
    if (existing) {
      return {
        duplicate: true,
        code: "DUPLICATE_POLICY_NO",
        reason: `policyNo=${policyNo} already exists on policy ${existing.id}`,
      };
    }
  }

  const start = row.policy_start_date ? new Date(String(row.policy_start_date)) : null;
  const end = row.policy_expiry_date ? new Date(String(row.policy_expiry_date)) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const party = await prisma.insuredParty.findUnique({ where: { mobile } });
    if (party) {
      const overlap = await prisma.policyYear.findFirst({
        where: {
          policy: {
            insuredPartyId: party.id,
            deletedAt: null,
            ...(excludeReferenceNo ? { referenceNo: { not: excludeReferenceNo } } : {}),
          },
          policyStart: { lte: end },
          policyEnd: { gte: start },
        },
      });
      if (overlap) {
        return {
          duplicate: false,
          code: "OVERLAPPING_DATES",
          reason: `Overlapping policy dates for mobile ${mobile}`,
        };
      }
    }
  }

  return { duplicate: false };
}

export function validatePolicyRowWithLookups(
  row: LegacyPolicyRow,
  lookups: MigrationLookups,
): ValidateOutcome {
  const refNo = row.ref_no?.trim();
  if (!refNo) {
    return { ok: false, code: "missingRefNo", reason: "Missing ref_no" };
  }

  let transformed;
  try {
    transformed = transformPolicyRow(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("UNMAPPED_POLICY_TYPE:")) {
      return { ok: false, code: "unknownPolicyType", reason: msg };
    }
    return { ok: false, code: "validationErrors", reason: msg };
  }

  const pt = lookups.policyTypes.get(transformed.policyTypeKey);
  if (!pt) {
    return {
      ok: false,
      code: "unknownPolicyType",
      reason: `PolicyType not in target DB: key=${transformed.policyTypeKey}`,
    };
  }

  const holderChartId = lookups.holderChartByPolicyTypeId.get(pt.id);
  if (!holderChartId) {
    return {
      ok: false,
      code: "missingChart",
      reason: `No HOLDER or COMBINED PolicyChart v1 for policyTypeId=${pt.id}`,
    };
  }

  let categoryId: string | null = null;
  if (transformed.categoryKey) {
    categoryId = lookups.categories.get(transformed.categoryKey)?.id ?? null;
  }

  return {
    ok: true,
    targets: {
      policyTypeId: pt.id,
      categoryId,
      holderChartId,
    },
  };
}

/** @deprecated Prefer buildMigrationLookups + validatePolicyRowWithLookups (no per-row DB hits). */
export async function validatePolicyRow(
  prisma: PrismaClient,
  row: LegacyPolicyRow,
): Promise<ValidateOutcome> {
  const refNo = row.ref_no?.trim();
  if (!refNo) {
    return { ok: false, code: "missingRefNo", reason: "Missing ref_no" };
  }

  let transformed;
  try {
    transformed = transformPolicyRow(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("UNMAPPED_POLICY_TYPE:")) {
      return { ok: false, code: "unknownPolicyType", reason: msg };
    }
    return { ok: false, code: "validationErrors", reason: msg };
  }

  const resolved = await resolveTargets(
    prisma,
    transformed.policyTypeKey,
    transformed.categoryKey,
  );
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code === "unknownPolicyType" ? "unknownPolicyType" : "missingChart",
      reason: resolved.reason,
    };
  }

  return { ok: true, targets: resolved.data };
}
