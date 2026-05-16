import { describe, expect, it } from "vitest";
import {
  buildPolicyLogDisplayPayload,
  policyDisplayRefFromPayload,
  policyPrimaryLabel,
} from "./activity-log-policy-ref.js";

describe("policyDisplayRefFromPayload", () => {
  it("reads reference and policy number from create payload", () => {
    const ref = policyDisplayRefFromPayload(null, {
      policyId: "cuid123",
      yearId: "yearcuid",
      referenceNo: "NVKK2025JAN0003",
      policyNo: "PO-123",
      holderName: "Test User",
    });
    expect(ref?.referenceNo).toBe("NVKK2025JAN0003");
    expect(policyPrimaryLabel(ref!)).toBe("NVKK2025JAN0003");
  });
});

describe("buildPolicyLogDisplayPayload", () => {
  it("omits internal cuid ids from display payload", () => {
    const ref = {
      referenceNo: "REF-1",
      policyNo: "PO-1",
      svkkPublicId: "SVKK-9",
      holderName: "Ram",
      village: "Kolhapur",
      yearLabel: "2025-26",
    };
    const display = buildPolicyLogDisplayPayload(
      { policyId: "cuid", yearId: "ycuid", holderName: "Ram" },
      ref,
    );
    expect(display).not.toHaveProperty("policyId");
    expect(display).not.toHaveProperty("yearId");
    expect(display?.referenceNo).toBe("REF-1");
    expect(display?.policyNo).toBe("PO-1");
  });
});
