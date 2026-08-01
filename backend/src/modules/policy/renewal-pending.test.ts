import { describe, expect, it } from "vitest";
import {
  classifyPolicyRenewalBucket,
  classifyPolicyRenewalStatus,
  comparePolicyRecencyDesc,
  pickLatestPolicy,
  renewalBucketPolicyWhere,
  renewalPendingPolicyWhere,
  utcDayStart,
} from "./renewal-pending.js";

describe("classifyPolicyRenewalBucket (exclusive windows)", () => {
  const asOf = new Date("2026-08-24T12:00:00.000Z");

  it("classifies expired when max end is before as-of", () => {
    expect(classifyPolicyRenewalBucket([new Date("2026-01-01")], asOf)).toBe("expired");
  });

  it("puts 1 day remaining only in due_2 (not due_8/due_30/expired)", () => {
    const end = new Date(utcDayStart(asOf).getTime() + 1 * 24 * 60 * 60 * 1000);
    expect(classifyPolicyRenewalBucket([end], asOf)).toBe("due_2");
  });

  it("classifies due_2 when end is within 2 days", () => {
    const end = new Date(utcDayStart(asOf).getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(classifyPolicyRenewalBucket([end], asOf)).toBe("due_2");
  });

  it("classifies due_8 for day 3..8 only", () => {
    const end3 = new Date(utcDayStart(asOf).getTime() + 3 * 24 * 60 * 60 * 1000);
    const end8 = new Date(utcDayStart(asOf).getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(classifyPolicyRenewalBucket([end3], asOf)).toBe("due_8");
    expect(classifyPolicyRenewalBucket([end8], asOf)).toBe("due_8");
  });

  it("classifies active when end is beyond 60 days", () => {
    expect(classifyPolicyRenewalBucket([new Date("2027-01-01")], asOf)).toBe("active");
  });

  it("returns no_end_date when no policy end", () => {
    expect(classifyPolicyRenewalBucket([null], asOf)).toBe("no_end_date");
  });
});

describe("pickLatestPolicy / comparePolicyRecencyDesc", () => {
  it("orders by year then createdAt then id", () => {
    const p1001 = {
      id: "a",
      periodYearText: "2024-25",
      createdAt: new Date("2025-01-01"),
    };
    const p1002 = {
      id: "b",
      periodYearText: "2025-26",
      createdAt: new Date("2026-01-01"),
    };
    const p1003 = {
      id: "c",
      periodYearText: "2025-26",
      createdAt: new Date("2026-01-10"),
    };
    expect(pickLatestPolicy([p1001, p1002, p1003])?.id).toBe("c");
    expect(comparePolicyRecencyDesc(p1003, p1002)).toBeLessThan(0);
  });

  it("uses id DESC when year and createdAt tie", () => {
    const t = new Date("2026-01-01");
    const olderId = { id: "aaa", periodYearText: "2025-26", createdAt: t };
    const newerId = { id: "zzz", periodYearText: "2025-26", createdAt: t };
    expect(pickLatestPolicy([olderId, newerId])?.id).toBe("zzz");
  });
});

describe("classifyPolicyRenewalStatus", () => {
  const asOf = new Date("2026-09-04T00:00:00.000Z");

  it("marks non-latest as renewed even if end date passed", () => {
    expect(
      classifyPolicyRenewalStatus({
        isLatest: false,
        policyEnd: new Date("2026-08-25"),
        asOf,
      }),
    ).toBe("renewed");
  });

  it("marks latest with null end as no_end_date", () => {
    expect(
      classifyPolicyRenewalStatus({ isLatest: true, policyEnd: null, asOf }),
    ).toBe("no_end_date");
  });

  it("marks latest past end as expired", () => {
    expect(
      classifyPolicyRenewalStatus({
        isLatest: true,
        policyEnd: new Date("2026-08-25"),
        asOf,
      }),
    ).toBe("expired");
  });

  it("marks latest future end as active", () => {
    expect(
      classifyPolicyRenewalStatus({
        isLatest: true,
        policyEnd: new Date("2026-09-10"),
        asOf,
      }),
    ).toBe("active");
  });
});

describe("renewal where + latest gate (same-year blank end)", () => {
  const asOf = "2026-08-24";
  /** Only P1003 is latest; it has no end — SVKK must not appear via older P1002. */
  const latestIds = ["p1003"];

  it("pending where requires latest id and does not match blank-end latest alone via older years", () => {
    const where = renewalPendingPolicyWhere(asOf, latestIds);
    expect(where).toBeDefined();
    const s = JSON.stringify(where);
    expect(s).toContain("p1003");
    expect(s).toContain("policyEnd");
  });

  it("due_2 where is restricted to latest ids", () => {
    const where = renewalBucketPolicyWhere("due_2", asOf, latestIds);
    expect(JSON.stringify(where)).toContain("p1003");
  });

  it("empty latest ids match nothing useful", () => {
    const where = renewalPendingPolicyWhere(asOf, []);
    expect(JSON.stringify(where)).toContain('"in":[]');
  });
});
