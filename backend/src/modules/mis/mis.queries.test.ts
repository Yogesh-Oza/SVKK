import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { policyYearActiveOnAsOfSql, reportPeriodBoundsUTC } from "./mis.queries.js";

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
