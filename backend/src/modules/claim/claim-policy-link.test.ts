import { ClaimPolicyMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  claimMatchInputFromFields,
  linkFieldsFromMatchResult,
} from "./claim-policy-link.js";
import type { ClaimMatchResult } from "./claim-policy-match.js";

function match(partial: Partial<ClaimMatchResult> & Pick<ClaimMatchResult, "matchStatus" | "matchReason">): ClaimMatchResult {
  return {
    verificationWarnings: [],
    ...partial,
  };
}

describe("claimMatchInputFromFields", () => {
  it("trims policy number and maps optional fields like CSV import", () => {
    const input = claimMatchInputFromFields({
      policyNo: "  ABC 123  ",
      svkkPublicId: " SV1 ",
      policyHolderName: null,
      sumInsured: 1000,
      admissionDate: null,
    });
    expect(input.policyNo).toBe("ABC 123");
    expect(input.svkkPublicId).toBe("SV1");
    expect(input.policyHolderName).toBe("");
    expect(input.sumInsured).toBe(1000);
  });
});

describe("linkFieldsFromMatchResult", () => {
  it("sets policyId on MATCHED_EXACT", () => {
    const out = linkFieldsFromMatchResult(
      match({
        matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
        matchReason: "MATCHED — Policy Number PO-1",
        policyId: "pol-1",
        policyYearId: "py-1",
        insuredPartyId: "party-1",
        policyArea: "Area A",
      }),
      "PO-1",
    );
    expect(out.policyId).toBe("pol-1");
    expect(out.policyYearId).toBe("py-1");
    expect(out.insuredPartyId).toBe("party-1");
    expect(out.linkWarning).toBeNull();
  });

  it("clears policyId and warns when policy number is UNLINKED", () => {
    const out = linkFieldsFromMatchResult(
      match({
        matchStatus: ClaimPolicyMatchStatus.UNLINKED,
        matchReason: "UNLINKED — No policy found for Policy Number MISSING",
      }),
      "MISSING",
    );
    expect(out.policyId).toBeNull();
    expect(out.policyYearId).toBeNull();
    expect(out.insuredPartyId).toBeNull();
    expect(out.linkWarning).toContain("No policy found");
  });

  it("clears policyId and warns on CONFLICT (no auto-pick)", () => {
    const out = linkFieldsFromMatchResult(
      match({
        matchStatus: ClaimPolicyMatchStatus.CONFLICT,
        matchReason: "CONFLICT — Multiple policies share Policy Number DUP",
        conflictDetail: "2 policies",
      }),
      "DUP",
    );
    expect(out.policyId).toBeNull();
    expect(out.linkWarning).toContain("CONFLICT");
  });

  it("clears link without warning when policy number is blank", () => {
    const out = linkFieldsFromMatchResult(
      match({
        matchStatus: ClaimPolicyMatchStatus.UNLINKED,
        matchReason: "UNLINKED — Policy Number is blank",
      }),
      "",
    );
    expect(out.policyId).toBeNull();
    expect(out.linkWarning).toBeNull();
  });
});
