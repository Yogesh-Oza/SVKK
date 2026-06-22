import { describe, expect, it } from "vitest";

import { adPolicyValidationSchema } from "./ad-policy-validation-schema";

function validBase() {
  return {
    policyHolder: "Demo Policyholder",
    adProduct: "family_floater",
    area: "Demo Area",
    village: "Demo Village",
    person: "2",
    cat: "A",
    sumInsured: "500000",
    whatsappNo: "9297040600",
    email: "csv.tmpuuw448@import-test.svkk.local",
    year: "2026-27",
    month: "May",
    members: [],
  };
}

describe("adPolicyValidationSchema", () => {
  it("accepts blank PAN and Aadhaar (optional identity fields)", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        panNo: "",
        aadhaarNo: "",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects invalid PAN when provided", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        panNo: "INVALID",
      }),
    ).rejects.toThrow(/Invalid PAN format/);
  });

  it("accepts valid PAN", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        panNo: "abcde1234f",
      }),
    ).resolves.toMatchObject({ panNo: "ABCDE1234F" });
  });

  it("accepts empty paymentMode", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        paymentMode: "",
      }),
    ).resolves.toBeDefined();
  });

  it("requires loan repayment and pending amount when loan is YES", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        loanStatus: "YES",
        loanRepayment: "",
        loanPendingAmount: "",
      }),
    ).rejects.toThrow(/Repayment is required/);

    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        loanStatus: "YES",
        loanRepayment: "1000",
        loanPendingAmount: "500",
      }),
    ).resolves.toBeDefined();
  });

  it("accepts optional nominee date of birth in the past (DD-MM-YYYY)", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        nomineeDateOfBirth: "29-09-1996",
      }),
    ).resolves.toBeDefined();
  });

  it("accepts optional nominee date of birth in the past (YYYY-MM-DD)", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        nomineeDateOfBirth: "1990-05-01",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects nominee date of birth in the future", async () => {
    await expect(
      adPolicyValidationSchema.validate({
        ...validBase(),
        nomineeDateOfBirth: "01-01-2099",
      }),
    ).rejects.toThrow(/Date cannot be in the future/);
  });
});
