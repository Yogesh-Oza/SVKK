import { describe, expect, it } from "vitest";
import { createPolicyBodySchema, patchPolicyBodySchema, memberCreateSchema } from "./policy.schemas.js";

const minimalCreateBody = {
  mobile: "9999999999",
  partyName: "Test Holder",
  email: "test@example.com",
  policyTypeId: "ptype-1",
  policyChartId: "chart-1",
  yearLabel: "2025-26",
  sumInsured: 100000,
  village: "test-village",
  whatsappNo: "9999999999",
  area: "test-area",
  personsInsuredCount: 1,
  periodMonthText: "January",
  members: [],
};

const validMember = {
  name: "Member One",
  dob: "1990-01-01",
  relationship: "Self",
};

describe("policy schemas - create body members.min(0)", () => {
  it("accepts an empty members array (holder-only policy)", () => {
    const result = createPolicyBodySchema.safeParse({
      ...minimalCreateBody,
      members: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a single-member policy", () => {
    const result = createPolicyBodySchema.safeParse({
      ...minimalCreateBody,
      members: [validMember],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multi-member policies", () => {
    const result = createPolicyBodySchema.safeParse({
      ...minimalCreateBody,
      members: [validMember, { ...validMember, name: "Member Two" }, { ...validMember, name: "Member Three" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects create body when members is omitted (still required field)", () => {
    // Intentionally omit `members` - still required on create.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { members, ...withoutMembers } = minimalCreateBody;
    const result = createPolicyBodySchema.safeParse(withoutMembers);
    expect(result.success).toBe(false);
  });

  it("rejects create body when sumInsured is non-positive (unrelated invariant still enforced)", () => {
    const result = createPolicyBodySchema.safeParse({
      ...minimalCreateBody,
      sumInsured: 0,
      members: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("policy schemas - patch body members.min(0)", () => {
  it("accepts patch with empty members array (when yearLabel is provided)", () => {
    const result = patchPolicyBodySchema.safeParse({
      yearLabel: "2025-26",
      members: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts patch that omits members entirely (members remains optional)", () => {
    const result = patchPolicyBodySchema.safeParse({
      yearLabel: "2025-26",
    });
    expect(result.success).toBe(true);
  });

  it("rejects patch that includes members[] without yearLabel (superRefine guard)", () => {
    const result = patchPolicyBodySchema.safeParse({
      members: [validMember],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /yearLabel is required when replacing members/i.test(m))).toBe(true);
    }
  });
});

describe("policy schemas - member row schema", () => {
  it("requires name, dob, and relationship on each member", () => {
    expect(memberCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(memberCreateSchema.safeParse({ name: "X" }).success).toBe(false);
    expect(memberCreateSchema.safeParse({ name: "X", dob: "1990-01-01" }).success).toBe(false);
    expect(memberCreateSchema.safeParse(validMember).success).toBe(true);
  });

  it("accepts basicPremium and other optional numeric fields", () => {
    const result = memberCreateSchema.safeParse({
      ...validMember,
      basicPremium: 5000,
      sumInsured: 100000,
      addOnsAmount: 0,
      ageAtEntry: 35,
    });
    expect(result.success).toBe(true);
  });
});
