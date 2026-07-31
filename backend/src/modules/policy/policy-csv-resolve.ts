import type { AdProductVariant, Prisma } from "@prisma/client";
import { PolicyChartKind as ChartKindEnum } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

export type ResolvedPolicyType = { id: string; key: string; name: string };

export type PolicyTypeCache = {
  types: ResolvedPolicyType[];
  byKey: Map<string, ResolvedPolicyType>;
  byKeyNormalized: Map<string, ResolvedPolicyType>;
  byNameNormalized: Map<string, ResolvedPolicyType>;
  aliasToKey: Map<string, string>;
  allowedLabels: () => string;
  fuzzyMatch: (norm: string) => ResolvedPolicyType[];
};

const STATIC_PRODUCT_TYPE_ALIASES: Record<string, string> = {
  health: "family_floater",
  mediclaim: "family_floater",
  "health insurance": "family_floater",
  "health policy": "family_floater",
  "family floater": "family_floater",
  "family-floater": "family_floater",
  "asha kiran": "asha_kiran",
  "asha-kiran": "asha_kiran",
  individual: "individual",
  "senior citizen": "senior_citizen",
  "senior-citizen": "senior_citizen",
};

/** Normalize product type text for lookup. */
export function normalizeProductType(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Build in-memory cache of policy types for a CSV import job. */
export async function buildPolicyTypeCache(
  tx: Prisma.TransactionClient,
): Promise<PolicyTypeCache> {
  const types = await tx.policyType.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { name: "asc" },
  });

  const byKey = new Map<string, ResolvedPolicyType>();
  const byKeyNormalized = new Map<string, ResolvedPolicyType>();
  const byNameNormalized = new Map<string, ResolvedPolicyType>();
  const aliasToKey = new Map<string, string>();

  for (const [alias, key] of Object.entries(STATIC_PRODUCT_TYPE_ALIASES)) {
    aliasToKey.set(normalizeProductType(alias), key);
  }

  for (const t of types) {
    const entry = { id: t.id, key: t.key, name: t.name };
    byKey.set(t.key, entry);
    byKeyNormalized.set(normalizeKey(t.key), entry);
    byNameNormalized.set(normalizeProductType(t.name), entry);
    aliasToKey.set(normalizeProductType(t.name), t.key);
    aliasToKey.set(normalizeKey(t.key), t.key);
  }

  const fuzzyMatch = (norm: string): ResolvedPolicyType[] => {
    const matches: ResolvedPolicyType[] = [];
    for (const t of types) {
      const nameNorm = normalizeProductType(t.name);
      const keyNorm = normalizeKey(t.key);
      if (nameNorm.includes(norm) || norm.includes(nameNorm) || keyNorm.includes(norm.replace(/ /g, "_"))) {
        matches.push({ id: t.id, key: t.key, name: t.name });
      }
    }
    return matches;
  };

  return {
    types,
    byKey,
    byKeyNormalized,
    byNameNormalized,
    aliasToKey,
    allowedLabels: () => types.map((t) => t.name).join(", "),
    fuzzyMatch,
  };
}

/** Resolve Product Type column to a policy type record. */
export function resolvePolicyTypeFromCache(
  rawProductType: string,
  cache: PolicyTypeCache,
): ResolvedPolicyType | null {
  const norm = normalizeProductType(rawProductType);
  if (!norm) return null;

  const aliasKey = cache.aliasToKey.get(norm) ?? STATIC_PRODUCT_TYPE_ALIASES[norm];
  if (aliasKey) {
    const fromAlias = cache.byKey.get(aliasKey);
    if (fromAlias) return fromAlias;
  }

  const byKey = cache.byKeyNormalized.get(normalizeKey(rawProductType));
  if (byKey) return byKey;

  const byName = cache.byNameNormalized.get(norm);
  if (byName) return byName;

  const fuzzy = cache.fuzzyMatch(norm);
  if (fuzzy.length === 1) return fuzzy[0]!;

  return null;
}

export function policyTypeKeyToAdVariant(key: string): AdProductVariant | undefined {
  const k = normalizeKey(key);
  const map: Record<string, AdProductVariant> = {
    family_floater: "FAMILY_FLOATER",
    individual: "INDIVIDUAL",
    asha_kiran: "ASHA_KIRAN",
    senior_citizen: "SENIOR_CITIZEN",
    ad_policy: "FAMILY_FLOATER",
  };
  return map[k];
}

export type CsvPolicyMatch = {
  policy: Prisma.PolicyGetPayload<{ include: { insuredParty: true; years: true } }>;
  matchedBy: "svkkId" | "policyNo" | "refNo";
};

/** CSV match keys. `year` scopes SVKK / policy-no lookups to one policy-year row. */
export type MatchInput = { svkkId: string; policyNo: string; refNo: string; year?: string };

const policyInclude = {
  insuredParty: true,
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    include: {
      members: { where: { deletedAt: null }, orderBy: { name: "asc" as const } },
      payments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const },
        include: { cheque: true },
      },
    },
  },
} satisfies Prisma.PolicyInclude;

type PolicyWithRelations = Prisma.PolicyGetPayload<{ include: typeof policyInclude }>;

/** True when the policy's period / year rows include `year`. */
export function policyMatchesCsvYear(
  policy: {
    periodYearText?: string | null;
    years: Array<{ yearLabel: string }>;
  },
  year: string,
): boolean {
  const y = year.trim();
  if (!y) return true;
  if (policy.periodYearText?.trim() === y) return true;
  return policy.years.some((row) => row.yearLabel === y);
}

function yearScopeWhere(year: string): Prisma.PolicyWhereInput {
  const y = year.trim();
  return {
    OR: [
      { periodYearText: y },
      { years: { some: { deletedAt: null, yearLabel: y } } },
    ],
  };
}

async function findBySvkkId(
  tx: Prisma.TransactionClient,
  svkkId: string,
  year?: string,
): Promise<{ policy: PolicyWithRelations | null; ambiguous: boolean }> {
  const yearTrim = year?.trim();
  const matches = await tx.policy.findMany({
    where: {
      deletedAt: null,
      insuredParty: { svkkPublicId: svkkId },
      ...(yearTrim ? yearScopeWhere(yearTrim) : {}),
    },
    include: policyInclude,
    orderBy: [{ periodYearText: "desc" }, { createdAt: "desc" }],
    take: 2,
  });
  if (matches.length > 1) {
    return { policy: null, ambiguous: true };
  }
  return { policy: matches[0] ?? null, ambiguous: false };
}

async function findByPolicyNo(
  tx: Prisma.TransactionClient,
  policyNo: string,
  year?: string,
): Promise<{ policy: PolicyWithRelations | null; ambiguous: boolean }> {
  const yearTrim = year?.trim();
  const matches = await tx.policy.findMany({
    where: {
      deletedAt: null,
      policyNo,
      ...(yearTrim ? yearScopeWhere(yearTrim) : {}),
    },
    include: policyInclude,
    orderBy: [{ periodYearText: "desc" }, { createdAt: "desc" }],
    take: 2,
  });
  if (matches.length > 1) {
    return { policy: null, ambiguous: true };
  }
  return { policy: matches[0] ?? null, ambiguous: false };
}

async function findByRefNo(
  tx: Prisma.TransactionClient,
  refNo: string,
): Promise<PolicyWithRelations | null> {
  return tx.policy.findFirst({
    where: { deletedAt: null, referenceNo: refNo },
    include: policyInclude,
  });
}

/**
 * Match priority: Ref No → (SVKK ID + year) → (Policy No + year) → unique SVKK/Policy No.
 * Year is required to disambiguate when multiple policies share an SVKK ID.
 */
export async function resolvePolicyForCsvImport(
  tx: Prisma.TransactionClient,
  input: MatchInput,
): Promise<{ match: PolicyWithRelations | null; matchedBy: CsvPolicyMatch["matchedBy"] | null; conflict?: string }> {
  const svkkId = input.svkkId.trim();
  const policyNo = input.policyNo.trim();
  const refNo = input.refNo.trim();
  const year = (input.year ?? "").trim();

  const ids = [
    svkkId ? ("svkkId" as const) : null,
    policyNo ? ("policyNo" as const) : null,
    refNo ? ("refNo" as const) : null,
  ].filter(Boolean) as Array<"svkkId" | "policyNo" | "refNo">;

  if (!ids.length) {
    return { match: null, matchedBy: null };
  }

  const found = new Map<string, PolicyWithRelations>();
  const matchedById = new Map<string, CsvPolicyMatch["matchedBy"]>();
  let svkkAmbiguous = false;
  let policyNoAmbiguous = false;

  if (refNo) {
    const p = await findByRefNo(tx, refNo);
    if (p) {
      found.set(p.id, p);
      matchedById.set(p.id, "refNo");
    }
  }
  if (svkkId) {
    const { policy: p, ambiguous } = await findBySvkkId(tx, svkkId, year || undefined);
    svkkAmbiguous = ambiguous;
    if (p) {
      found.set(p.id, p);
      if (!matchedById.has(p.id)) matchedById.set(p.id, "svkkId");
    }
  }
  if (policyNo) {
    const { policy: p, ambiguous } = await findByPolicyNo(tx, policyNo, year || undefined);
    policyNoAmbiguous = ambiguous;
    if (p) {
      found.set(p.id, p);
      if (!matchedById.has(p.id)) matchedById.set(p.id, "policyNo");
    }
  }

  if (found.size > 1) {
    return {
      match: null,
      matchedBy: null,
      conflict: "Conflicting identifiers: SVKK ID, Policy No, and Ref No match different policies",
    };
  }

  if (found.size === 1) {
    const policy = [...found.values()][0]!;
    if (year && !policyMatchesCsvYear(policy, year)) {
      return {
        match: null,
        matchedBy: null,
        conflict: `Year "${year}" does not match the policy found by identifiers`,
      };
    }
    const matchedBy = matchedById.get(policy.id) ?? "refNo";
    return { match: policy, matchedBy };
  }

  if (svkkAmbiguous && !policyNo && !refNo) {
    return {
      match: null,
      matchedBy: null,
      conflict: year
        ? `Multiple policies share SVKK ID and year "${year}"; provide ref no`
        : "Multiple policies share this SVKK ID; provide year, policy no, or ref no",
    };
  }

  if (policyNoAmbiguous && !refNo) {
    return {
      match: null,
      matchedBy: null,
      conflict: year
        ? `Multiple policies share policy no and year "${year}"; provide ref no`
        : "Multiple policies share this policy no; provide year or ref no",
    };
  }

  return { match: null, matchedBy: null };
}

type CsvUpdateMatchInput = { refNo: string; svkkId?: string; policyNo?: string; year?: string };

/**
 * Ref-no-only lookup for POLICY_COURIER / FULL CSV updates.
 * Flags SVKK ID, year, and policy-no collisions with other policies.
 */
export async function resolvePolicyForCsvUpdate(
  tx: Prisma.TransactionClient,
  input: CsvUpdateMatchInput,
): Promise<{ match: PolicyWithRelations | null; conflict?: string }> {
  const refNo = input.refNo.trim();
  if (!refNo) {
    return { match: null };
  }

  const policy = await findByRefNo(tx, refNo);
  if (!policy) {
    return { match: null };
  }

  const svkkId = (input.svkkId ?? "").trim();
  if (svkkId && policy.insuredParty.svkkPublicId !== svkkId) {
    return {
      match: null,
      conflict: "SVKK ID does not match policy for ref no",
    };
  }

  const year = (input.year ?? "").trim();
  if (year && !policyMatchesCsvYear(policy, year)) {
    return {
      match: null,
      conflict: `Year "${year}" does not match policy for ref no`,
    };
  }

  const policyNo = (input.policyNo ?? "").trim();
  if (policyNo && policy.policyNo !== policyNo) {
    const { policy: other } = await findByPolicyNo(tx, policyNo, year || undefined);
    if (other && other.id !== policy.id) {
      return {
        match: null,
        conflict: "policy no already belongs to another policy",
      };
    }
  }

  return { match: policy };
}

/**
 * Resolve the PolicyYear row for a CSV update.
 * When CSV includes `year`, require an exact yearLabel match (no silent fallback).
 */
export function pickPolicyYearForCsvUpdate<T extends { yearLabel: string }>(
  policy: { periodYearText?: string | null; years: T[] },
  csvYear: string,
): T {
  const label = csvYear.trim();
  if (label) {
    const year = policy.years.find((y) => y.yearLabel === label);
    if (!year) {
      throw new Error(
        `Policy year "${label}" not found on matched policy` +
          (policy.periodYearText ? ` (policy period year is ${policy.periodYearText})` : ""),
      );
    }
    return year;
  }
  const fallback = policy.years[0];
  if (!fallback) {
    throw new Error("Matched policy has no policy year rows to update");
  }
  return fallback;
}

/** Pick latest chart for policy type (prefers COMBINED, then HOLDER). */
export async function resolveImportPolicyChart(
  tx: Prisma.TransactionClient,
  policyTypeId: string,
  sumInsured?: PrismaNamespace.Decimal | number,
): Promise<string | null> {
  const charts = await tx.policyChart.findMany({
    where: { policyTypeId },
    orderBy: [{ version: "desc" }, { chartKind: "asc" }],
  });
  if (!charts.length) return null;

  const siNum =
    sumInsured != null ? Number(sumInsured.toString()) : undefined;

  const pickFromVersion = (versionCharts: typeof charts) => {
    const combined = versionCharts.find((c) => c.chartKind === ChartKindEnum.COMBINED);
    if (combined) return combined.id;
    const holder = versionCharts.find((c) => c.chartKind === ChartKindEnum.HOLDER);
    if (holder) return holder.id;
    return versionCharts[0]?.id ?? null;
  };

  if (siNum != null && Number.isFinite(siNum)) {
    for (const chart of charts) {
      const matrix = chart.premiumMatrix as { siColumns?: number[] } | null;
      const cols = matrix?.siColumns;
      if (cols?.includes(siNum)) return chart.id;
    }
  }

  const latestVersion = charts[0]!.version;
  const versionCharts = charts.filter((c) => c.version === latestVersion);
  return pickFromVersion(versionCharts);
}

export type { PolicyWithRelations };
