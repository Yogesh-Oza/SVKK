import type { Prisma } from "@prisma/client";

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

/**
 * Same SVKK (insured party): exclude this policy from renewal-due filters when another
 * policy on the party has coverage ending after `horizonEnd` (e.g. carry-forward renewal).
 */
function excludeWhenSvkkHasLaterCoverage(horizonEnd: Date): Prisma.PolicyWhereInput {
  return {
    NOT: {
      insuredParty: {
        policies: {
          some: {
            deletedAt: null,
            years: {
              some: {
                deletedAt: null,
                policyEnd: { not: null, gt: horizonEnd },
              },
            },
          },
        },
      },
    },
  };
}

function withSvkkRenewalSupersession(
  base: Prisma.PolicyWhereInput,
  horizonEnd: Date,
): Prisma.PolicyWhereInput {
  return { AND: [base, excludeWhenSvkkHasLaterCoverage(horizonEnd)] };
}

/**
 * Policy is pending renewal as-of a date when no policy year extends past that day
 * and at least one year has a known end date on or before that day.
 */
export function renewalPendingPolicyWhere(asOfIso: string): Prisma.PolicyWhereInput | undefined {
  const bounds = utcDayBoundsFromIsoDate(asOfIso);
  if (!bounds) return undefined;
  const asOfEnd = bounds.end;
  return withSvkkRenewalSupersession(
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
    asOfEnd,
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

/** Policies with no year ending after `asOf` and at least one year ending in [from, to]. */
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

/** Policies where every year end is null or missing. */
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
 */
export function renewalBucketPolicyWhere(
  bucket: RenewalBucketKey,
  asOfIso: string,
): Prisma.PolicyWhereInput | undefined {
  const bounds = utcDayBoundsFromIsoDate(asOfIso);
  if (!bounds) return undefined;
  const today = bounds.start;

  switch (bucket) {
    case "pending_all":
      return renewalPendingPolicyWhere(asOfIso);
    case "expired": {
      const expiredEnd = new Date(today.getTime() - 1);
      return withSvkkRenewalSupersession(maxEndInRangeWhere(new Date(0), expiredEnd), expiredEnd);
    }
    case "due_2": {
      const horizon = utcDayEnd(addUtcDays(today, 2));
      return withSvkkRenewalSupersession(maxEndInRangeWhere(today, horizon), horizon);
    }
    case "due_8": {
      const horizon = utcDayEnd(addUtcDays(today, 8));
      return withSvkkRenewalSupersession(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 3)), horizon),
        horizon,
      );
    }
    case "due_30": {
      const horizon = utcDayEnd(addUtcDays(today, 30));
      return withSvkkRenewalSupersession(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 9)), horizon),
        horizon,
      );
    }
    case "due_60": {
      const horizon = utcDayEnd(addUtcDays(today, 60));
      return withSvkkRenewalSupersession(
        maxEndInRangeWhere(utcDayStart(addUtcDays(today, 31)), horizon),
        horizon,
      );
    }
    case "active":
      return activeAfterHorizonWhere(today);
    case "no_end_date":
      return noEndDateWhere();
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
