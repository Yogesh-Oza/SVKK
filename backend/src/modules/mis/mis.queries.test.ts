import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  policyYearActiveOnAsOfSql,
  policyYearInReportScopeSql,
  queryPolicyMemberReport,
  reportPeriodBoundsUTC,
} from "./mis.queries.js";

function sqlText(sql: Prisma.Sql): string {
  return sql.strings.join("?");
}

describe("reportPeriodBoundsUTC", () => {
  it("uses single calendar day when only as-of date is provided", () => {
    const asOf = new Date("2026-05-16T12:00:00.000Z");
    const { start, end } = reportPeriodBoundsUTC(null, asOf);
    expect(start.toISOString()).toBe("2026-05-16T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-16T23:59:59.999Z");
  });
});

describe("policyYearActiveOnAsOfSql", () => {
  it("includes undated policy years and fiscal year labels", () => {
    const start = new Date("2026-05-16T00:00:00.000Z");
    const end = new Date("2026-05-16T23:59:59.999Z");
    const asOf = new Date("2026-05-16T12:00:00.000Z");
    const sql = sqlText(policyYearActiveOnAsOfSql(start, end, asOf, "py"));
    expect(sql).toContain("py.policyStart IS NULL AND py.policyEnd IS NULL");
    expect(sql).toContain("yearLabel REGEXP");
    expect(sql).toContain("-04-01");
  });
});

describe("policyYearInReportScopeSql", () => {
  it("skips as-of window when restrictToAsOfWindow is false", () => {
    const start = new Date("2026-05-16T00:00:00.000Z");
    const end = new Date("2026-05-16T23:59:59.999Z");
    const asOf = new Date("2026-05-16T12:00:00.000Z");
    const sql = sqlText(policyYearInReportScopeSql(start, end, asOf, "py", false));
    expect(sql).toBe("1=1");
  });
});

describe("queryPolicyMemberReport age buckets", () => {
  it("includes policy holder DOB in age-band SQL (not only member rows)", async () => {
    const captured: string[] = [];
    const prisma = {
      $queryRaw: async (query: Prisma.Sql) => {
        captured.push(sqlText(query));
        return [];
      },
    };

    await queryPolicyMemberReport(prisma as never, {
      scopeOnP: Prisma.sql`1=1`,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-30T23:59:59.999Z"),
      asOf: new Date("2026-07-30T12:00:00.000Z"),
      ageAsOf: new Date("2026-07-30T12:00:00.000Z"),
      groupBy: "village",
      categoryKeys: [],
      policyGroupings: [],
      villages: [],
      areas: [],
      sumInsureds: [],
      periodMonthTexts: [],
      policyStartMonths: [],
      policyStartYears: [],
      createdFrom: null,
      createdTo: null,
      fiscalLabels: [],
      restrictPolicyYearToAsOf: true,
    });

    const peopleSql = captured.find((sql) => sql.includes("AS a0"));
    expect(peopleSql).toBeTruthy();
    expect(peopleSql).toContain("holderDateOfBirth");
    expect(peopleSql).toContain("ip.dateOfBirth");
    expect(peopleSql).toContain("THEN p.id END)");
  });
});
