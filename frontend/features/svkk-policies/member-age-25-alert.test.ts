import { describe, expect, it } from "vitest";
import type { AdMemberRow } from "./ad-member-types";
import {
  buildCarryForwardTurning25AlertMessage,
  membersTurning25OnCarryForward,
  projectPolicyEndAfterCarryForward,
  resolveMemberAge,
} from "./member-age-25-alert";

function member(partial: Partial<AdMemberRow>): AdMemberRow {
  return {
    name: "",
    relationship: "",
    dob: "",
    age: "",
    dateOfJoining: "",
    sumInsured: "",
    cumulativeBonus: "",
    phNo: "",
    addOnsAmount: "",
    basicPremium: "",
    gender: "M",
    ...partial,
  };
}

describe("carry forward turning 25 alert", () => {
  it("projects the next policy end one calendar year ahead", () => {
    expect(projectPolicyEndAfterCarryForward("2025-04-30")).toBe("2026-04-30");
  });

  it("flags male members turning 24 to 25 via DOB", () => {
    const names = membersTurning25OnCarryForward(
      [member({ name: "Ravi", dob: "2001-06-15", gender: "M" })],
      "2025-06-15",
      "2026-06-15",
    );
    expect(names).toEqual(["Ravi"]);
  });

  it("flags male members with manual age 24 on carry forward", () => {
    const names = membersTurning25OnCarryForward(
      [member({ name: "Ravi", age: "24", gender: "M" })],
      "2025-05-01",
      "2026-05-01",
    );
    expect(names).toEqual(["Ravi"]);
  });

  it("does not flag when prior age is not 24", () => {
    const names = membersTurning25OnCarryForward(
      [member({ name: "Ravi", age: "25", gender: "M" })],
      "2025-05-01",
      "2026-05-01",
    );
    expect(names).toEqual([]);
  });

  it("does not flag female members turning 24 to 25", () => {
    const names = membersTurning25OnCarryForward(
      [member({ name: "Anita", dob: "2001-06-15", gender: "F" })],
      "2025-06-15",
      "2026-06-15",
    );
    expect(names).toEqual([]);
  });

  it("does not flag when birthday has not occurred in the new policy year", () => {
    const names = membersTurning25OnCarryForward(
      [member({ name: "Ravi", dob: "2001-08-15", gender: "M" })],
      "2025-06-15",
      "2026-06-15",
    );
    expect(names).toEqual([]);
  });

  it("derives age from DOB when age field is empty", () => {
    const age = resolveMemberAge(member({ dob: "2000-06-01", age: "" }), "2026-06-01");
    expect(age).toBe(26);
  });

  it("formats the alert message for a single member", () => {
    const message = buildCarryForwardTurning25AlertMessage(
      [member({ name: "Ravi Kumar", age: "24", gender: "M" })],
      "2025-05-01",
      "2026-05-01",
    );
    expect(message).toBe(
      "Ravi Kumar is now 25 so need to take action - new policy or make him policy holder",
    );
  });
});
