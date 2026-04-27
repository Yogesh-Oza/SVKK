import type { PrismaClient } from "@prisma/client";
import { PolicyChartKind } from "@prisma/client";
import { transformPolicyRow } from "./transform.js";
import type { LegacyPolicyRow } from "./types.js";

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

  const chart = await prisma.policyChart.findFirst({
    where: {
      policyTypeId: policyType.id,
      version: 1,
      chartKind: PolicyChartKind.HOLDER,
    },
  });
  if (!chart) {
    return {
      ok: false,
      code: "missingChart",
      reason: `No HOLDER PolicyChart v1 for policyTypeId=${policyType.id}`,
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
      holderChartId: chart.id,
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
}

export async function buildMigrationLookups(prisma: PrismaClient): Promise<MigrationLookups> {
  const [types, charts, cats] = await Promise.all([
    prisma.policyType.findMany({ select: { id: true, key: true } }),
    prisma.policyChart.findMany({
      where: { version: 1, chartKind: PolicyChartKind.HOLDER },
      select: { id: true, policyTypeId: true },
    }),
    prisma.category.findMany({ select: { id: true, key: true } }),
  ]);
  return {
    policyTypes: new Map(types.map((t) => [t.key, t])),
    holderChartByPolicyTypeId: new Map(charts.map((c) => [c.policyTypeId, c.id])),
    categories: new Map(cats.map((c) => [c.key, c])),
  };
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
      reason: `No HOLDER PolicyChart v1 for policyTypeId=${pt.id}`,
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
