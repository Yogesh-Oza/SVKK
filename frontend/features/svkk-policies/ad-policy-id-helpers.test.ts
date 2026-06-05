import { describe, expect, it } from "vitest";
import {
  extractPolicyGroupingFromReferenceNo,
  extractPolicyGroupingFromSvkkPublicId,
  resolvePolicyGroupingForAutoId,
} from "./ad-policy-id-helpers";

describe("ad-policy-id-helpers", () => {
  it("extracts grouping from reference no", () => {
    expect(extractPolicyGroupingFromReferenceNo("OTHER2025JUN3001")).toBe("OTHER");
    expect(extractPolicyGroupingFromReferenceNo("RTY2024DEC0042")).toBe("RTY");
  });

  it("extracts grouping from SVKK public id", () => {
    expect(extractPolicyGroupingFromSvkkPublicId("OTHERJUN3001")).toBe("OTHER");
  });

  it("prefers form policy group over parsed reference no", () => {
    expect(
      resolvePolicyGroupingForAutoId({
        policyGroup: "NVKK",
        refNo: "OTHER2025JUN3001",
      }),
    ).toBe("NVKK");
  });

  it("falls back to reference no when policy group is blank", () => {
    expect(
      resolvePolicyGroupingForAutoId({
        policyGroup: "",
        refNo: "OTHER2025JUN3001",
      }),
    ).toBe("OTHER");
  });

  it("falls back to OTHER when nothing is available", () => {
    expect(resolvePolicyGroupingForAutoId({})).toBe("OTHER");
  });
});
