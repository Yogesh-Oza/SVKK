import { Prisma } from "@prisma/client";
import { sqlCol, sqlTable } from "../../lib/sql-tables.js";
import { prisma } from "../../lib/prisma.js";

/**
 * SVKK Renewal Rule
 *
 * Renewal is evaluated ONLY against the latest policy belonging
 * to an SVKK/member.
 *
 * Latest policy ordering:
 *   1. Policy year DESC (numeric start year from periodYearText, then text)
 *   2. createdAt DESC
 *   3. id DESC
 *
 * "Same SVKK" means the same InsuredParty row: compare on
 * Policy.insuredPartyId (stable FK), never on display svkkPublicId alone.
 *
 * All older policies are considered "renewed" because a newer
 * policy exists under the same SVKK.
 *
 * Latest policy:
 *   - policyEnd == null  => no_end_date; exclude SVKK from renewal filters
 *   - policyEnd < asOf   => expired
 *   - policyEnd >= asOf  => active / evaluate applicable renewal window
 *
 * IMPORTANT:
 * - Never fall back to an older policy when the latest has no end date.
 * - Never use previousEndDate for renewal.
 *
 * Exclusive bucket windows (days until end from asOf start):
 *   expired  < 0
 *   due_2    0..2
 *   due_8    3..8
 *   due_30   9..30
 *   due_60   31..60
 *   active   > 60
 */

/** UTC calendar-day bounds for an ISO date string (YYYY-MM-DD). */
export function utcDayBoundsFromIsoDate(isoDate: string): { start: Date; end: Date } | undefined {
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

export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function utcDayEnd(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type PolicyRenewalStatus = "renewed" | "expired" | "active" | "no_end_date";

export type PolicyRecencyFields = {
  id: string;
  periodYearText?: string | null;
  createdAt: Date;
};

/** Parse leading YYYY from period labels like `2025-26`, `2025-2026`, `2025/26`. */
export function policyYearSortKey(periodYearText: string | null | undefined): {
  startYear: number;
  text: string;
} {
  const text = (periodYearText ?? "").trim();
  const m = /^(\d{4})/.exec(text);
  return { startYear: m ? Number(m[1]) : 0, text };
}

/**
 * Sort comparator: newer first (DESC by year → createdAt → id).
 * Negative means `a` ranks newer than `b`.
 */
export function comparePolicyRecencyDesc(a: PolicyRecencyFields, b: PolicyRecencyFields): number {
  const ka = policyYearSortKey(a.periodYearText);
  const kb = policyYearSortKey(b.periodYearText);
  if (ka.startYear !== kb.startYear) return kb.startYear - ka.startYear;
  if (ka.text !== kb.text) return kb.text.localeCompare(ka.text);
  const ct = b.createdAt.getTime() - a.createdAt.getTime();
  if (ct !== 0) return ct;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function pickLatestPolicy<T extends PolicyRecencyFields>(policies: T[]): T | undefined {
  if (!policies.length) return undefined;
  return [...policies].sort(comparePolicyRecencyDesc)[0];
}

export function classifyPolicyRenewalStatus(opts: {
  isLatest: boolean;
  policyEnd: Date | null | undefined;
  asOf: Date;
}): PolicyRenewalStatus {
  if (!opts.isLatest) return "renewed";
  if (opts.policyEnd == null || Number.isNaN(opts.policyEnd.getTime())) return "no_end_date";
  if (utcDayStart(opts.policyEnd).getTime() < utcDayStart(opts.asOf).getTime()) return "expired";
  return "active";
}

/** SQL: numeric start year from periodYearText (leading 4 digits). */
function sqlPeriodStartYear(alias: string): Prisma.Sql {
  return Prisma.sql`COALESCE(CAST(SUBSTRING(COALESCE(${sqlCol(alias, "periodYearText")}, ''), 1, 4) AS UNSIGNED), 0)`;
}

/**
 * Correlated predicate: no non-deleted sibling under the same insuredPartyId
 * ranks newer by year → createdAt → id.
 */
export function sqlIsLatestPolicyUnderInsuredParty(alias = "p"): Prisma.Sql {
  const newer = "newer";
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM ${sqlTable("policy")} ${Prisma.raw(newer)}
    WHERE ${sqlCol(newer, "insuredPartyId")} = ${sqlCol(alias, "insuredPartyId")}
      AND ${sqlCol(newer, "deletedAt")} IS NULL
      AND ${sqlCol(newer, "id")} <> ${sqlCol(alias, "id")}
      AND (
        ${sqlPeriodStartYear(newer)} > ${sqlPeriodStartYear(alias)}
        OR (
          ${sqlPeriodStartYear(newer)} = ${sqlPeriodStartYear(alias)}
          AND COALESCE(${sqlCol(newer, "periodYearText")}, '') > COALESCE(${sqlCol(alias, "periodYearText")}, '')
        )
        OR (
          COALESCE(${sqlCol(newer, "periodYearText")}, '') = COALESCE(${sqlCol(alias, "periodYearText")}, '')
          AND ${sqlCol(newer, "createdAt")} > ${sqlCol(alias, "createdAt")}
        )
        OR (
          COALESCE(${sqlCol(newer, "periodYearText")}, '') = COALESCE(${sqlCol(alias, "periodYearText")}, '')
          AND ${sqlCol(newer, "createdAt")} = ${sqlCol(alias, "createdAt")}
          AND ${sqlCol(newer, "id")} > ${sqlCol(alias, "id")}
        )
      )
  )`;
}

/** All non-deleted policy IDs that are latest under their insuredPartyId. */
export async function fetchLatestPolicyIdsUnderInsuredParty(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT ${sqlCol("p", "id")} AS id
    FROM ${sqlTable("policy")} p
    WHERE ${sqlCol("p", "deletedAt")} IS NULL
      AND ${sqlIsLatestPolicyUnderInsuredParty("p")}
  `);
  return rows.map((r) => r.id);
}

/** Restrict where to latest-under-SVKK policies (empty set matches nothing). */
export function whereLatestPolicyIds(ids: string[]): Prisma.PolicyWhereInput {
  return { id: { in: ids } };
}

function withLatestOnly(
  base: Prisma.PolicyWhereInput,
  latestIds: string[],
): Prisma.PolicyWhereInput {
  return { AND: [base, whereLatestPolicyIds(latestIds)] };
}

/**
 * Policy is pending renewal as-of a date when it is the latest under its SVKK,
 * has a known end date on or before that day, and no year extends past that day.
 */
export function renewalPendingPolicyWhere(
  asOfIso: string,
  latestIds: string[],
): Prisma.PolicyWhereInput | undefined {
  const bounds = utcDayBoundsFromIsoDate(asOfIso);
  if (!bounds) return undefined;
  const asOfEnd = bounds.end;
  return withLatestOnly(
    {
      AND: [
        {
          years: {
            some: {
              deletedAt: null,
              policyEnd: { not: null, lte: asOfEnd },
            },
          },
        },
        {
          NOT: {
            years: {
              some: {
                deletedAt: null,
                policyEnd: { gt: asOfEnd },
              },
            },
          },
        },
      ],
    },
    latestIds,
  );
}

export type RenewalBucketKey =
  | "expired"
  | "due_2"
  | "due_8"
  | "due_30"
  | "due_60"
  | "active"
  | "no_end_date"
  | "pending_all";

export type RenewalBucketRow = {
  key: RenewalBucketKey;
  label: string;
  count: number;
};

export function classifyPolicyRenewalBucket(
  yearEnds: Array<Date | null | undefined>,
  asOf: Date,
): RenewalBucketKey {
  const ends = yearEnds.filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  if (!ends.length) return "no_end_date";
  const maxEndMs = Math.max(...ends.map((d) => d.getTime()));
  const maxEnd = new Date(maxEndMs);
  const today = utcDayStart(asOf);
  const daysUntilEnd = Math.floor((utcDayStart(maxEnd).getTime() - today.getTime()) / DAY_MS);
  if (daysUntilEnd < 0) return "expired";
  if (daysUntilEnd <= 2) return "due_2";
  if (daysUntilEnd <= 8) return "due_8";
  if (daysUntilEnd <= 30) return "due_30";
  if (daysUntilEnd <= 60) return "due_60";
  return "active";
}

const BUCKET_LABELS: Record<RenewalBucketKey, string> = {
  expired: "Expired (renewal due)",
  due_2: "Ends in ≤2 days",
  due_8: "Ends in 3–8 days",
  due_30: "Ends in 9–30 days",
  due_60: "Ends in 31–60 days",
  active: "Active (>60 days)",
  no_end_date: "No end date",
  pending_all: "Pending renewal",
};

export function renewalBucketLabel(key: RenewalBucketKey): string {
  return BUCKET_LABELS[key];
}

/** Policies with no year ending after `to` and at least one year ending in [from, to]. */
function maxEndInRangeWhere(from: Date, to: Date): Prisma.PolicyWhereInput {
  return {
    AND: [
      {
        years: {
          some: {
            deletedAt: null,
            policyEnd: { not: null, gte: from, lte: to },
          },
        },
      },
      {
        NOT: {
          years: {
            some: {
              deletedAt: null,
              policyEnd: { gt: to },
            },
          },
        },
      },
    ],
  };
}

/** Latest policy where every year end is null or missing. */
function noEndDateWhere(): Prisma.PolicyWhereInput {
  return {
    NOT: {
      years: {
        some: {
          deletedAt: null,
          policyEnd: { not: null },
        },
      },
    },
  };
}

/** Active: latest end is more than 60 days after as-of. */
function activeAfterHorizonWhere(asOfStart: Date): Prisma.PolicyWhereInput {
  const horizonEnd = addUtcDays(asOfStart, 60);
  return {
    years: {
      some: {
        deletedAt: null,
        policyEnd: { gt: horizonEnd },
      },
    },
  };
}

/**
 * Filter policies whose renewal bucket (by max policyEnd) matches `bucket` as-of `asOfIso`.
 * Only latest-under-SVKK policies are eligible.
 */
export function renewalBucketPolicyWhere(
  bucket: RenewalBucketKey,
  asOfIso: string,
  latestIds: string[],
): Prisma.PolicyWhereInput | undefined {
  const bounds = utcDayBoundsFromIsoDate(asOfIso);
  if (!bounds) return undefined;
  const today = bounds.start;

  switch (bucket) {
    case "pending_all":
      return renewalPendingPolicyWhere(asOfIso, latestIds);
    case "expired": {
      const expiredEnd = new Date(today.getTime() - 1);
      return withLatestOnly(maxEndInRangeWhere(new Date(0), expiredEnd), latestIds);
    }
    case "due_2": {
      const horizon = utcDayEnd(addUtcDays(today, 2));
      return withLatestOnly(maxEndInRangeWhere(today, horizon), latestIds);
    }
    case "due_8": {
      const horizon = utcDayEnd(addUtcDays(today, 8));
      return withLatestOnly(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 3)), horizon),
        latestIds,
      );
    }
    case "due_30": {
      const horizon = utcDayEnd(addUtcDays(today, 30));
      return withLatestOnly(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 9)), horizon),
        latestIds,
      );
    }
    case "due_60": {
      const horizon = utcDayEnd(addUtcDays(today, 60));
      return withLatestOnly(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 31)), horizon),
        latestIds,
      );
    }
    case "active":
      return withLatestOnly(activeAfterHorizonWhere(today), latestIds);
    case "no_end_date":
      return withLatestOnly(noEndDateWhere(), latestIds);
    default:
      return undefined;
  }
}

export const DASHBOARD_RENEWAL_PIE_KEYS: RenewalBucketKey[] = [
  "expired",
  "due_2",
  "due_8",
  "due_30",
  "due_60",
  "active",
];
