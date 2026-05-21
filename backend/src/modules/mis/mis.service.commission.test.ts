import { describe, expect, it, vi } from "vitest";

vi.mock("./mis.queries.js", () => {
  return {
    UNCATEGORIZED_CATEGORY_KEY: "__uncat__",
    queryPolicyMemberReport: vi.fn().mockResolvedValue([
      {
        label: "V1",
        totalPolicies: 1,
        membersPlusPolicies: 1,
        cntAshaKiran: 0,
        cntFamilyFloater: 0,
        cntIndividual: 1,
        sumVkk: "0",
        sumCo: "0",
        sumGross: "0",
        sumComm: "123",
        sumTwoLac: "0",
        sumPolHolder: "0",
        sumGaam: "0",
        sumRefund: "0",
        sumCd: "0",
        age0_18: 0,
        age19_35: 0,
        age36_45: 0,
        age46_50: 0,
        age51_55: 0,
        age56_60: 0,
        age61_65: 0,
        age65p: 0,
      },
    ]),
    reportPeriodBoundsUTC: vi.fn().mockReturnValue({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-01T23:59:59.999Z"),
      ageAsOf: new Date("2026-01-01T00:00:00.000Z"),
    }),
    asOfDayBoundsUTC: vi.fn().mockReturnValue({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-01T23:59:59.999Z"),
    }),
    queryDashboardMonthlyPremium: vi.fn(),
    queryVillageAggregates: vi.fn(),
    queryVillagePaymentTotals: vi.fn(),
    queryMemberAgeBuckets: vi.fn(),
    queryDistinctPolicyCategoryKeys: vi.fn(),
    queryVillageReport: vi.fn(),
  };
});

vi.mock("./mis.scope-sql.js", () => {
  return {
    buildPolicyScopeSqlP: vi.fn().mockReturnValue({ strings: [""], values: [] }),
  };
});

import { getPolicyMemberReport } from "./mis.service.js";

describe("MIS commission gating", () => {
  const baseInput = {
    dateFrom: null,
    dateTo: null,
    villages: [],
    areas: [],
    sumInsureds: [],
    groupBy: "village" as const,
    categoryKeys: [],
    policyGroupings: [],
    months: [],
    years: [],
    policyStartMonths: [],
    policyStartYears: [],
    fiscalLabels: [],
  };

  it("zeros sumComm without policy:commission", async () => {
    const permissions = new Set<string>(["mis:read", "mis:scope_all"]);
    const out = await getPolicyMemberReport("u1", permissions, { kind: "full" }, baseInput);
    expect(out.rows[0]?.sumComm).toBe(0);
  });

  it("keeps sumComm with policy:commission", async () => {
    const permissions = new Set<string>(["mis:read", "mis:scope_all", "policy:commission"]);
    const out = await getPolicyMemberReport("u1", permissions, { kind: "full" }, baseInput);
    expect(out.rows[0]?.sumComm).toBe(123);
  });
});

