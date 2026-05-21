import { describe, expect, it } from "vitest";
import { classifyPolicyRenewalBucket, utcDayStart } from "./renewal-pending.js";

describe("classifyPolicyRenewalBucket", () => {
  const asOf = new Date("2026-05-21T12:00:00.000Z");

  it("classifies expired when max end is before as-of", () => {
    const key = classifyPolicyRenewalBucket([new Date("2026-01-01")], asOf);
    expect(key).toBe("expired");
  });

  it("classifies due_2 when end is within 2 days", () => {
    const end = new Date(utcDayStart(asOf).getTime() + 2 * 24 * 60 * 60 * 1000);
    const key = classifyPolicyRenewalBucket([end], asOf);
    expect(key).toBe("due_2");
  });

  it("classifies active when end is beyond 60 days", () => {
    const end = new Date("2027-01-01");
    const key = classifyPolicyRenewalBucket([end], asOf);
    expect(key).toBe("active");
  });

  it("returns no_end_date when no policy end", () => {
    expect(classifyPolicyRenewalBucket([null], asOf)).toBe("no_end_date");
  });
});
