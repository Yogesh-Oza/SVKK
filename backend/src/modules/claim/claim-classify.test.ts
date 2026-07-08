import { describe, expect, it } from "vitest";
import { isCashlessLodgeType } from "./claim.summary.js";

describe("isCashlessLodgeType (MIS cashless/reimbursement rule)", () => {
  it("classifies Cash Less as cashless", () => {
    expect(isCashlessLodgeType("Cash Less")).toBe(true);
    expect(isCashlessLodgeType("Cashless")).toBe(true);
  });

  it("classifies Non Cash Less as reimbursement (not cashless)", () => {
    expect(isCashlessLodgeType("Non Cash Less")).toBe(false);
    expect(isCashlessLodgeType("NON CASH LESS")).toBe(false);
    expect(isCashlessLodgeType("Non-Cash")).toBe(false);
  });

  it("falls back to claimType only when Actual Lodge Type is blank", () => {
    expect(isCashlessLodgeType("", "Cashless")).toBe(true);
    expect(isCashlessLodgeType(null, "Non Cash Less")).toBe(false);
    // Actual Lodge Type wins over claimType when present
    expect(isCashlessLodgeType("Non Cash Less", "Cashless")).toBe(false);
    expect(isCashlessLodgeType("Cash Less", "Non Cash Less")).toBe(true);
  });

  it("treats empty/unknown as not cashless", () => {
    expect(isCashlessLodgeType(null, null)).toBe(false);
    expect(isCashlessLodgeType("Reconsideration")).toBe(false);
  });
});
