import { describe, expect, it } from "vitest";
import {
  canAutoFillDobFromAge,
  dobFromAgeUsingToday,
  shouldApplyDobFromAge,
} from "./age-dob-reverse";

describe("dobFromAgeUsingToday", () => {
  const today = new Date(2026, 7, 1); // 01-08-2026 local

  it("holder Age 60 with blank DOB → today minus 60 years", () => {
    expect(dobFromAgeUsingToday("60", today)).toBe("01-08-1966");
  });

  it("member Age 30 with blank DOB → today minus 30 years", () => {
    expect(dobFromAgeUsingToday("30", today)).toBe("01-08-1996");
  });

  it("Age 25 → today minus 25 years", () => {
    expect(dobFromAgeUsingToday("25", today)).toBe("01-08-2001");
  });

  it("Age 40 → today minus 40 years", () => {
    expect(dobFromAgeUsingToday("40", today)).toBe("01-08-1986");
  });

  it("independent ages produce independent DOBs", () => {
    expect(dobFromAgeUsingToday("60", today)).toBe("01-08-1966");
    expect(dobFromAgeUsingToday("35", today)).toBe("01-08-1991");
    expect(dobFromAgeUsingToday("25", today)).toBe("01-08-2001");
  });

  it("rejects blank / non-integer / out-of-range ages", () => {
    expect(dobFromAgeUsingToday("", today)).toBeNull();
    expect(dobFromAgeUsingToday("  ", today)).toBeNull();
    expect(dobFromAgeUsingToday("12.5", today)).toBeNull();
    expect(dobFromAgeUsingToday("-1", today)).toBeNull();
    expect(dobFromAgeUsingToday("151", today)).toBeNull();
    expect(dobFromAgeUsingToday("abc", today)).toBeNull();
  });

  it("accepts age 0", () => {
    expect(dobFromAgeUsingToday("0", today)).toBe("01-08-2026");
  });

  it("clamps leap-day safely when target year is not a leap year", () => {
    const leapToday = new Date(2024, 1, 29); // 29-02-2024
    expect(dobFromAgeUsingToday("1", leapToday)).toBe("28-02-2023");
  });
});

describe("canAutoFillDobFromAge / shouldApplyDobFromAge", () => {
  it("allows fill only when DOB is blank", () => {
    expect(canAutoFillDobFromAge("")).toBe(true);
    expect(canAutoFillDobFromAge("   ")).toBe(true);
    expect(canAutoFillDobFromAge(null)).toBe(true);
    expect(canAutoFillDobFromAge(undefined)).toBe(true);
    expect(canAutoFillDobFromAge("15-06-1980")).toBe(false);
    expect(canAutoFillDobFromAge("10-05-1980")).toBe(false);
  });

  it("does not overwrite existing DOB unless it was auto-filled from Age", () => {
    expect(shouldApplyDobFromAge("15-06-1980", false)).toBe(false);
    expect(shouldApplyDobFromAge("15-06-1980", true)).toBe(true);
    expect(shouldApplyDobFromAge("", false)).toBe(true);
  });

  it("typing Age 6 then 60 may keep updating auto-filled DOB", () => {
    const today = new Date(2026, 7, 1);
    const first = dobFromAgeUsingToday("6", today)!;
    expect(first).toBe("01-08-2020");
    expect(shouldApplyDobFromAge(first, true)).toBe(true);
    expect(dobFromAgeUsingToday("60", today)).toBe("01-08-1966");
  });
});
