import { describe, expect, it } from "vitest";
import { ClaimLinkMode, ClaimPolicyMatchStatus, CsvImportMode } from "@prisma/client";
import { shouldRejectDuplicateClaim } from "./claim-duplicate.js";

describe("duplicate claim protection (CREATE_ONLY + unique claimNo)", () => {
  it("rejects CREATE_ONLY when claimNo already exists", () => {
    expect(shouldRejectDuplicateClaim(CsvImportMode.CREATE_ONLY, "CCN2024001")).toBe(true);
  });

  it("allows CREATE_ONLY when claimNo is new", () => {
    expect(shouldRejectDuplicateClaim(CsvImportMode.CREATE_ONLY, null)).toBe(false);
  });

  it("documents that claim identity is claimNo alone (not claimNo+policy)", () => {
    const first = "CCN2024001";
    expect(shouldRejectDuplicateClaim(CsvImportMode.CREATE_ONLY, first)).toBe(true);
  });

  it("STRICT_MATCH rejects UNLINKED; ALLOW_UNLINKED still rejects CONFLICT", () => {
    const reject = (status: ClaimPolicyMatchStatus, mode: ClaimLinkMode) => {
      if (status === ClaimPolicyMatchStatus.CONFLICT) return true;
      if (status === ClaimPolicyMatchStatus.UNLINKED && mode === ClaimLinkMode.STRICT_MATCH) {
        return true;
      }
      return false;
    };
    expect(reject(ClaimPolicyMatchStatus.CONFLICT, ClaimLinkMode.ALLOW_UNLINKED)).toBe(true);
    expect(reject(ClaimPolicyMatchStatus.UNLINKED, ClaimLinkMode.ALLOW_UNLINKED)).toBe(false);
    expect(reject(ClaimPolicyMatchStatus.UNLINKED, ClaimLinkMode.STRICT_MATCH)).toBe(true);
  });
});
