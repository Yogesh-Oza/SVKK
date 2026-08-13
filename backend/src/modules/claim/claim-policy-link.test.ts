import { ClaimPolicyMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  claimMatchInputFromFields,
  linkFieldsFromMatchResult,
  applyMatchedPolicySnapshots,
  isPlaceholderVillage,
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
        policyNo: "PO-1",
        svkkPublicId: "RTYJAN0038",
        holderName: "Rekha",
        village: "Bhachau",
        policyGrouping: "RTY",
        categoryText: "Category B",
        yearLabel: "2024-25",
        policyTypeName: "Family Floater",
      }),
      "PO-1",
    );
    expect(out.policyId).toBe("pol-1");
    expect(out.policyYearId).toBe("py-1");
    expect(out.insuredPartyId).toBe("party-1");
    expect(out.matchedPolicyNo).toBe("PO-1");
    expect(out.svkkPublicId).toBe("RTYJAN0038");
    expect(out.village).toBe("Bhachau");
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
    expect(out.matchedPolicyNo).toBeNull();
    expect(out.svkkPublicId).toBeNull();
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

describe("applyMatchedPolicySnapshots", () => {
  const linked = linkFieldsFromMatchResult(
    match({
      matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
      matchReason: "MATCHED",
      policyId: "pol-1",
      svkkPublicId: "RTYJAN0038",
      yearLabel: "2024-25",
      village: "Bhachau",
      holderName: "Rekha Hasmukh Satra",
      policyTypeName: "Family Floater",
      policyGrouping: "RTY",
      categoryText: "b",
    }),
    "PO-1",
  );

  it("fills blank SVKK ID and numeric-only village from the matched policy", () => {
    const out = applyMatchedPolicySnapshots(
      { svkkPublicId: "", village: "72624", policyYear: "2025-26" },
      linked,
    );
    expect(out.svkkPublicId).toBe("RTYJAN0038");
    expect(out.village).toBe("Bhachau");
    expect(out.policyYear).toBeUndefined();
  });

  it("does not overwrite a SVKK ID the user already entered", () => {
    const out = applyMatchedPolicySnapshots({ svkkPublicId: "CUSTOM" }, linked);
    expect(out.svkkPublicId).toBeUndefined();
  });

  it("fills nothing when the claim is unlinked", () => {
    const unlinked = linkFieldsFromMatchResult(
      match({
        matchStatus: ClaimPolicyMatchStatus.UNLINKED,
        matchReason: "UNLINKED",
      }),
      "",
    );
    expect(applyMatchedPolicySnapshots({ svkkPublicId: "" }, unlinked)).toEqual({});
  });
});

describe("isPlaceholderVillage", () => {
  it("treats blank and numeric CSV leftovers as placeholders", () => {
    expect(isPlaceholderVillage("")).toBe(true);
    expect(isPlaceholderVillage("72624")).toBe(true);
    expect(isPlaceholderVillage("Bhachau")).toBe(false);
  });
});
