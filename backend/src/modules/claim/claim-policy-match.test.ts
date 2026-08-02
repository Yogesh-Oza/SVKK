import { describe, expect, it } from "vitest";
import { ClaimPolicyMatchStatus } from "@prisma/client";
import type { PolicyTypeCache } from "../policy/policy-csv-resolve.js";
import {
  claimCoverageDate,
  policyYearContainsDate,
  resolveClaimPolicyMatch,
  type ClaimMatchInput,
  type PolicyYearMatch,
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

function makeYear(opts: {
  id: string;
  policyId: string;
  policyNo: string;
  svkk: string;
  yearLabel: string;
  start: Date;
  end: Date;
  typeId?: string;
  typeName?: string;
  holderName?: string;
  sumInsured?: number;
  insuranceCompany?: string | null;
}): PolicyYearMatch {
  const typeId = opts.typeId ?? "pt-1";
  return {
    id: opts.id,
    policyId: opts.policyId,
    yearLabel: opts.yearLabel,
    policyStart: opts.start,
    policyEnd: opts.end,
    sumInsured: opts.sumInsured != null ? ({ toString: () => String(opts.sumInsured) } as never) : null,
    deletedAt: null,
    policy: {
      id: opts.policyId,
      policyNo: opts.policyNo,
      deletedAt: null,
      village: "V1",
      area: "A1",
      insuranceCompany: opts.insuranceCompany ?? null,
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
    },
  } as unknown as PolicyYearMatch;
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
    // Matching (claimCoverageDate): admission → lodge → received
    // MIS (claimActivityDateExpr): claimReceivedDate → admissionDate → createdAt
    // These must NOT share the same helper/order.
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

describe("resolveClaimPolicyMatch Steps A–E", () => {
  const y2025 = makeYear({
    id: "py-25",
    policyId: "pol-1",
    policyNo: "ABC123",
    svkk: "SVKK001",
    yearLabel: "2025-26",
    start: utc(2025, 4, 1),
    end: utc(2026, 3, 31),
  });
  const y2024 = makeYear({
    id: "py-24",
    policyId: "pol-1",
    policyNo: "ABC123",
    svkk: "SVKK001",
    yearLabel: "2024-25",
    start: utc(2024, 4, 1),
    end: utc(2025, 3, 31),
  });
  const otherOwner = makeYear({
    id: "py-other",
    policyId: "pol-2",
    policyNo: "ABC123",
    svkk: "SVKK002",
    yearLabel: "2025-26",
    start: utc(2025, 4, 1),
    end: utc(2026, 3, 31),
  });

  it("blank Policy Number → UNLINKED", () => {
    const r = resolveClaimPolicyMatch([y2025], baseInput({ policyNo: "  " }), emptyTypeCache());
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
    expect(r.matchReason).toContain("Policy Number is blank");
  });

  it("unique Policy No + SVKK + exact CSV dates → MATCHED", () => {
    const r = resolveClaimPolicyMatch(
      [y2024, y2025],
      baseInput({
        svkkPublicId: "SVKK001",
        policyStartDate: utc(2025, 4, 1),
        policyEndDate: utc(2026, 3, 31),
      }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyYearId).toBe("py-25");
    expect(r.matchReason).toContain("MATCHED");
    expect(r.matchReason).toContain("2025-26");
  });

  it("SVKK mismatch → UNLINKED (never link wrong owner)", () => {
    const r = resolveClaimPolicyMatch(
      [otherOwner],
      baseInput({ svkkPublicId: "SVKK001", policyNo: "ABC123" }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
    expect(r.matchReason).toContain("CSV SVKK ID does not match policy owner");
    expect(r.policyId).toBeUndefined();
  });

  it("explicit CSV dates contradict years → UNLINKED (no coverage override)", () => {
    const r = resolveClaimPolicyMatch(
      [y2025],
      baseInput({
        svkkPublicId: "SVKK001",
        policyStartDate: utc(2020, 4, 1),
        policyEndDate: utc(2021, 3, 31),
        admissionDate: utc(2025, 6, 1),
      }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
    expect(r.matchReason).toContain("do not match any PolicyYear");
  });

  it("coverage fallback links the single containing year", () => {
    const r = resolveClaimPolicyMatch(
      [y2024, y2025],
      baseInput({
        svkkPublicId: "SVKK001",
        admissionDate: utc(2025, 6, 15),
      }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyYearId).toBe("py-25");
  });

  it("coverage fallback with two overlapping windows → CONFLICT", () => {
    const overlapA = makeYear({
      id: "py-a",
      policyId: "pol-a",
      policyNo: "ABC123",
      svkk: "SVKK001",
      yearLabel: "A",
      start: utc(2025, 1, 1),
      end: utc(2025, 12, 31),
    });
    const overlapB = makeYear({
      id: "py-b",
      policyId: "pol-b",
      policyNo: "ABC123",
      svkk: "SVKK001",
      yearLabel: "B",
      start: utc(2025, 6, 1),
      end: utc(2026, 5, 31),
    });
    const r = resolveClaimPolicyMatch(
      [overlapA, overlapB],
      baseInput({ svkkPublicId: "SVKK001", admissionDate: utc(2025, 7, 1) }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.CONFLICT);
    expect(r.matchReason).toContain("Multiple policy years");
  });

  it("coverage fallback with zero containing years → UNLINKED", () => {
    const r = resolveClaimPolicyMatch(
      [y2024, y2025],
      baseInput({ svkkPublicId: "SVKK001", admissionDate: utc(2023, 1, 1) }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.UNLINKED);
  });

  it("multiple years without coverage date → CONFLICT", () => {
    const r = resolveClaimPolicyMatch(
      [y2024, y2025],
      baseInput({ svkkPublicId: "SVKK001" }),
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.CONFLICT);
  });

  it("policy type narrows candidates when resolvable", () => {
    const floater = makeYear({
      id: "py-f",
      policyId: "pol-f",
      policyNo: "ABC123",
      svkk: "SVKK001",
      yearLabel: "2025-26",
      start: utc(2025, 4, 1),
      end: utc(2026, 3, 31),
      typeId: "pt-floater",
      typeName: "Floater",
    });
    const other = makeYear({
      id: "py-o",
      policyId: "pol-o",
      policyNo: "ABC123",
      svkk: "SVKK001",
      yearLabel: "2025-26",
      start: utc(2025, 4, 1),
      end: utc(2026, 3, 31),
      typeId: "pt-other",
      typeName: "Other",
    });
    const cache = typeCacheWith("pt-floater", "floater", "Floater");
    const r = resolveClaimPolicyMatch(
      [floater, other],
      baseInput({
        svkkPublicId: "SVKK001",
        policyTypeText: "Floater",
        policyStartDate: utc(2025, 4, 1),
        policyEndDate: utc(2026, 3, 31),
      }),
      cache,
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.MATCHED_EXACT);
    expect(r.policyId).toBe("pol-f");
  });
});
