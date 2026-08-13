import { describe, expect, it } from "vitest";
import { ClaimLinkMode, ClaimPolicyMatchStatus, CsvImportMode } from "@prisma/client";
import {
  classifyClaimEvent,
  decideClaimImportAction,
  normalizeLodgeTypeBucket,
  type ClaimEventIdentity,
} from "./claim-duplicate.js";

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function ident(over: Partial<ClaimEventIdentity> = {}): ClaimEventIdentity {
  return {
    claimNo: "CCN-1",
    policyId: "pol-1",
    policyNo: "ABC123",
    admissionDate: utc(2025, 6, 1),
    lodgeDate: null,
    claimReceivedDate: null,
    actualLodgeType: "Cashless",
    claimType: "Cashless",
    ...over,
  };
}

describe("normalizeLodgeTypeBucket", () => {
  it("maps cashless / reimbursement aliases", () => {
    expect(normalizeLodgeTypeBucket("Cash Less")).toBe("cashless");
    expect(normalizeLodgeTypeBucket("Cashless")).toBe("cashless");
    expect(normalizeLodgeTypeBucket("Non Cash Less")).toBe("reimbursement");
    expect(normalizeLodgeTypeBucket(null, "Reimbursement")).toBe("reimbursement");
    expect(normalizeLodgeTypeBucket("Reconsideration")).toBe("other");
    expect(normalizeLodgeTypeBucket(null, null)).toBe("");
  });
});

describe("classifyClaimEvent", () => {
  it("returns NEW when no existing CCN", () => {
    expect(classifyClaimEvent(ident(), null)).toBe("NEW");
  });

  it("same policy + admission day + lodge type → SAME_EVENT", () => {
    expect(classifyClaimEvent(ident(), ident({ policyNo: "abc 123" }))).toBe("SAME_EVENT");
  });

  it("different admission day → DIFFERENT_EVENT", () => {
    expect(classifyClaimEvent(ident(), ident({ admissionDate: utc(2025, 7, 1) }))).toBe("DIFFERENT_EVENT");
  });

  it("different lodge type → DIFFERENT_EVENT", () => {
    expect(classifyClaimEvent(ident(), ident({ actualLodgeType: "Reimbursement" }))).toBe("DIFFERENT_EVENT");
  });

  it("CI Received / Additional Payment on the same policy is the same claim", () => {
    expect(
      classifyClaimEvent(
        ident({ claimType: "CI Received", admissionDate: utc(2025, 8, 1) }),
        ident({ claimType: "Non Cash Less", actualLodgeType: "Non Cash Less" }),
      ),
    ).toBe("SAME_EVENT");
  });

  it("weak identity (no dates and no lodge type) → WEAK_IDENTITY", () => {
    const weak = ident({
      admissionDate: null,
      lodgeDate: null,
      claimReceivedDate: null,
      actualLodgeType: null,
      claimType: null,
    });
    expect(classifyClaimEvent(weak, ident())).toBe("WEAK_IDENTITY");
    expect(classifyClaimEvent(ident(), weak)).toBe("WEAK_IDENTITY");
  });

  it("matches policy by normalized Policy Number when policyId is missing", () => {
    const a = ident({ policyId: null, policyNo: "ABC 123" });
    const b = ident({ policyId: null, policyNo: "abc123" });
    expect(classifyClaimEvent(a, b)).toBe("SAME_EVENT");
  });
});

describe("decideClaimImportAction", () => {
  it("STRICT_MATCH rejects UNLINKED; ALLOW_UNLINKED still rejects CONFLICT", () => {
    const incoming = ident();
    expect(
      decideClaimImportAction({
        matchStatus: ClaimPolicyMatchStatus.UNLINKED,
        linkMode: ClaimLinkMode.STRICT_MATCH,
        existing: null,
        incoming,
      }).disposition,
    ).toBe("WILL_REJECT");
    expect(
      decideClaimImportAction({
        matchStatus: ClaimPolicyMatchStatus.UNLINKED,
        linkMode: ClaimLinkMode.ALLOW_UNLINKED,
        existing: null,
        incoming,
      }).disposition,
    ).toBe("WILL_CREATE");
    expect(
      decideClaimImportAction({
        matchStatus: ClaimPolicyMatchStatus.CONFLICT,
        linkMode: ClaimLinkMode.ALLOW_UNLINKED,
        existing: null,
        incoming,
      }).dispositionReason,
    ).toBe("conflict");
  });

  it("CREATE_ONLY same event → WILL_UPDATE", () => {
    const incoming = ident();
    const d = decideClaimImportAction({
      matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
      linkMode: ClaimLinkMode.STRICT_MATCH,
      existing: ident(),
      incoming,
      importMode: CsvImportMode.CREATE_ONLY,
    });
    expect(d.disposition).toBe("WILL_UPDATE");
    expect(d.eventClassification).toBe("SAME_EVENT");
  });

  it("different event → WILL_REJECT different_event", () => {
    const d = decideClaimImportAction({
      matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
      linkMode: ClaimLinkMode.STRICT_MATCH,
      existing: ident({ admissionDate: utc(2024, 1, 1) }),
      incoming: ident(),
    });
    expect(d.disposition).toBe("WILL_REJECT");
    expect(d.dispositionReason).toBe("different_event");
    expect(d.eventClassification).toBe("DIFFERENT_EVENT");
  });

  it("weak identity → WILL_UPDATE + event_identity_weak", () => {
    const weak = ident({
      admissionDate: null,
      lodgeDate: null,
      claimReceivedDate: null,
      actualLodgeType: "",
      claimType: "",
    });
    const d = decideClaimImportAction({
      matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
      linkMode: ClaimLinkMode.STRICT_MATCH,
      existing: ident(),
      incoming: weak,
    });
    expect(d.disposition).toBe("WILL_UPDATE");
    expect(d.extraWarnings).toContain("event_identity_weak");
  });

  it("new CCN → WILL_CREATE", () => {
    const d = decideClaimImportAction({
      matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
      linkMode: ClaimLinkMode.STRICT_MATCH,
      existing: null,
      incoming: ident(),
    });
    expect(d.disposition).toBe("WILL_CREATE");
    expect(d.eventClassification).toBe("NEW");
  });
});
