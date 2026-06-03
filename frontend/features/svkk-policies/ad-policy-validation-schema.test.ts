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
});
