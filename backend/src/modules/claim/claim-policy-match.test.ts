import { describe, expect, it } from "vitest";
import { ClaimPolicyMatchStatus } from "@prisma/client";
import type { PolicyTypeCache } from "../policy/policy-csv-resolve.js";
import {
  claimCoverageDate,
  policyYearContainsDate,
  resolveClaimPolicyMatch,
  type ClaimMatchInput,
  type PolicyMatchCandidate,
} from "./claim-policy-match.js";

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function emptyTypeCache(): PolicyTypeCache {
  return {
    types: [],
    byKey: new Map(),
    byKeyNormalized: new Map(),
    byNameNormalized: new Map(),
    aliasToKey: new Map(),
    allowedLabels: () => "",
    fuzzyMatch: () => [],
  };
}

function typeCacheWith(id: string, key: string, name: string): PolicyTypeCache {
  const resolved = { id, key, name, chartMode: "SINGLE" as const };
  const cache = emptyTypeCache();
  cache.types = [resolved];
  cache.byKey.set(key, resolved);
  cache.byKeyNormalized.set(key, resolved);
  cache.byNameNormalized.set(name.toLowerCase(), resolved);
  return cache;
}

function makePolicy(opts: {
  id: string;
  policyNo: string;
  svkk: string;
  typeId?: string;
  typeName?: string;
  holderName?: string;
  insuranceCompany?: string | null;
  years?: Array<{
    id: string;
    yearLabel: string;
    start: Date;
    end: Date;
    sumInsured?: number;
  }>;
}): PolicyMatchCandidate {
  const typeId = opts.typeId ?? "pt-1";
  const years = (opts.years ?? []).map((y) => ({
    id: y.id,
    yearLabel: y.yearLabel,
    policyStart: y.start,
    policyEnd: y.end,
    sumInsured: y.sumInsured != null ? { toString: () => String(y.sumInsured) } : null,
    deletedAt: null,
  }));
  return {
    id: opts.id,
    policyNo: opts.policyNo,
    village: "V1",
    area: "A1",
    insuranceCompany: opts.insuranceCompany ?? null,
    holderName: opts.holderName ?? "Holder",
    insuredPartyId: `party-${opts.svkk}`,
    insuredParty: {
      id: `party-${opts.svkk}`,
      svkkPublicId: opts.svkk,
      name: opts.holderName ?? "Holder",
    },
    policyType: {
      id: typeId,
      key: "floater",
      name: opts.typeName ?? "Floater",
    },
    years,
  };
}

function baseInput(over: Partial<ClaimMatchInput> = {}): ClaimMatchInput {
  return {
    policyNo: "ABC123",
    svkkPublicId: "",
    policyHolderName: "",
    policyTypeText: "",
    policyStartDate: null,
    policyEndDate: null,
    sumInsured: null,
    insuranceCompany: null,
    admissionDate: null,
    lodgeDate: null,
    claimReceivedDate: null,
    ...over,
  };
}

const y2025 = { id: "py-25", yearLabel: "2025-26", start: utc(2025, 4, 1), end: utc(2026, 3, 31) };
const y2024 = { id: "py-24", yearLabel: "2024-25", start: utc(2024, 4, 1), end: utc(2025, 3, 31) };

const polOne = makePolicy({
  id: "pol-1",
  policyNo: "ABC123",
  svkk: "SVKK001",
  years: [y2024, y2025],
});

describe("claimCoverageDate", () => {
  it("prefers admission → lodge → received", () => {
    const adm = utc(2025, 5, 1);
    const lodge = utc(2025, 5, 2);
    const recv = utc(2025, 5, 3);
    expect(claimCoverageDate(baseInput({ admissionDate: adm, lodgeDate: lodge, claimReceivedDate: recv }))).toBe(adm);
    expect(claimCoverageDate(baseInput({ lodgeDate: lodge, claimReceivedDate: recv }))).toBe(lodge);
    expect(claimCoverageDate(baseInput({ claimReceivedDate: recv }))).toBe(recv);
  });

  it("matching coverage order must stay distinct from MIS reporting date order", () => {
    const matchingOrder = ["admissionDate", "lodgeDate", "claimReceivedDate"];
    const misReportingOrder = ["claimReceivedDate", "admissionDate", "createdAt"];
    expect(matchingOrder).not.toEqual(misReportingOrder);
    expect(matchingOrder[0]).toBe("admissionDate");
    expect(misReportingOrder[0]).toBe("claimReceivedDate");
    expect(matchingOrder).toContain("lodgeDate");
    expect(misReportingOrder).not.toContain("lodgeDate");
  });
});

describe("policyYearContainsDate", () => {
  it("includes boundary days", () => {
    const py = { policyStart: utc(2025, 4, 1), policyEnd: utc(2026, 3, 31) };
    expect(policyYearContainsDate(py, utc(2025, 4, 1))).toBe(true);
    expect(policyYearContainsDate(py, utc(2026, 3, 31))).toBe(true);
    expect(policyYearContainsDate(py, utc(2025, 3, 31))).toBe(false);
  });
});

describe("resolveClaimPolicyMatch (Policy Number only)", () => {
  it("blank Policy Number → UNLINKED even when SVKK is present", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({ policyNo: "  ", svkkPublicId: "SVKK001" }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
    expect(r.matchReason).toContain("Policy Number is blank");
    expect(r.policyId).toBeUndefined();
  });

  it("unique Policy Number → MATCHED", () => {
    const r = resolveClaimPolicyMatch([polOne], baseInput(), emptyTypeCache());
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.matchReason).toContain("MATCHED");
    expect(r.matchReason).toContain("ABC123");
  });

  it("normalizes Policy Number (trim, collapse spaces, case-insensitive)", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({ policyNo: "  abc  123 " }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
  });

  it("SVKK mismatch still MATCHED + svkk warning", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({ svkkPublicId: "SVKK999" }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.verificationWarnings).toContain("svkk");
  });

  it("type mismatch still MATCHED + policy_type warning", () => {
    const cache = typeCacheWith("pt-other", "other", "Other");
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({ policyTypeText: "Other" }),
      cache,
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.verificationWarnings).toContain("policy_type");
  });

  it("date mismatch still MATCHED + policy_dates warning", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({
        policyStartDate: utc(2020, 4, 1),
        policyEndDate: utc(2021, 3, 31),
        admissionDate: utc(2025, 6, 1),
      }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.verificationWarnings).toContain("policy_dates");
  });

  it("zero policies → UNLINKED", () => {
    const r = resolveClaimPolicyMatch([], baseInput(), emptyTypeCache());
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
    expect(r.matchReason).toContain("No policy found");
  });

  it("two policies with the same normalized Policy Number → CONFLICT", () => {
    const a = makePolicy({ id: "pol-a", policyNo: "ABC123", svkk: "SVKK001", typeId: "pt-f" });
    const b = makePolicy({ id: "pol-b", policyNo: "abc 123", svkk: "SVKK002", typeId: "pt-o" });
    const r = resolveClaimPolicyMatch([a, b], baseInput({ policyNo: "ABC123" }), emptyTypeCache());
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.CONFLICT);
    expect(r.policyId).toBeUndefined();
    expect(r.matchReason).toContain("Multiple policies share Policy Number");
  });

  it("single Policy, two years, exact dates pick one year", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({
        policyStartDate: utc(2025, 4, 1),
        policyEndDate: utc(2026, 3, 31),
      }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyYearId).toBe("py-25");
    expect(r.yearLabel).toBe("2025-26");
  });

  it("single Policy, two years, coverage date picks one year", () => {
    const r = resolveClaimPolicyMatch(
      [polOne],
      baseInput({ admissionDate: utc(2025, 6, 15) }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyYearId).toBe("py-25");
  });

  it("single Policy, two years, dates ambiguous → MATCHED with year unset + warning", () => {
    const r = resolveClaimPolicyMatch([polOne], baseInput(), emptyTypeCache());
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.policyYearId).toBeUndefined();
    expect(r.verificationWarnings).toContain("policy_year_ambiguous");
  });

  it("overlapping coverage windows do not CONFLICT when Policy Number is unique", () => {
    const overlap = makePolicy({
      id: "pol-1",
      policyNo: "ABC123",
      svkk: "SVKK001",
      years: [
        { id: "py-a", yearLabel: "A", start: utc(2025, 1, 1), end: utc(2025, 12, 31) },
        { id: "py-b", yearLabel: "B", start: utc(2025, 6, 1), end: utc(2026, 5, 31) },
      ],
    });
    const r = resolveClaimPolicyMatch(
      [overlap],
      baseInput({ admissionDate: utc(2025, 7, 1) }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-1");
    expect(r.policyYearId).toBeUndefined();
    expect(r.verificationWarnings).toContain("policy_year_ambiguous");
  });

  it("two distinct claim rows with the same Policy Number resolve to the same policyId", () => {
    const r1 = resolveClaimPolicyMatch([polOne], baseInput({ policyNo: "ABC123" }), emptyTypeCache());
    const r2 = resolveClaimPolicyMatch([polOne], baseInput({ policyNo: "abc 123" }), emptyTypeCache());
    expect(r1.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r2.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r1.policyId).toBe("pol-1");
    expect(r2.policyId).toBe(r1.policyId);
  });

  it("copies catalog policy type name onto MATCHED result", () => {
    const r = resolveClaimPolicyMatch([polOne], baseInput(), emptyTypeCache());
    expect(r.policyTypeName).toBe("Floater");
  });
});
