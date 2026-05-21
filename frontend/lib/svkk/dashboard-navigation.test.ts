import { describe, expect, it } from "vitest";
import {
  calendarMonthBoundsIso,
  fiscalLabelForCalendarMonth,
  misQueryFromPolicyStartMonth,
} from "./dashboard-navigation";

describe("dashboard-navigation policy-start month", () => {
  it("calendarMonthBoundsIso returns inclusive month range", () => {
    expect(calendarMonthBoundsIso(2025, 6)).toEqual({
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    });
    expect(calendarMonthBoundsIso(2026, 2)).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
  });

  it("fiscalLabelForCalendarMonth maps Apr–Mar fiscal years", () => {
    expect(fiscalLabelForCalendarMonth(2025, 6)).toBe("2025-26");
    expect(fiscalLabelForCalendarMonth(2026, 1)).toBe("2025-26");
    expect(fiscalLabelForCalendarMonth(2026, 4)).toBe("2026-27");
  });

  it("misQueryFromPolicyStartMonth builds MIS deep-link query", () => {
    expect(misQueryFromPolicyStartMonth(2025, 6, { groupBy: "village" })).toEqual({
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
      policyStartYear: "2025",
      policyStartMonth: "6",
      months: "6",
      fiscalLabels: "2025-26",
      groupBy: "village",
    });
  });
});
