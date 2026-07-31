import { describe, expect, it, vi } from "vitest";
import {
  pickPolicyYearForCsvUpdate,
  policyMatchesCsvYear,
  resolvePolicyForCsvImport,
  resolvePolicyForCsvUpdate,
} from "./policy-csv-resolve.js";

type YearRow = { id: string; yearLabel: string; deletedAt: null };

function makePolicy(opts: {
  id: string;
  svkk: string;
  year: string;
  policyNo?: string;
  refNo?: string;
}) {
  const yearRow: YearRow = { id: `y-${opts.id}`, yearLabel: opts.year, deletedAt: null };
  return {
    id: opts.id,
    deletedAt: null,
    policyNo: opts.policyNo ?? null,
    referenceNo: opts.refNo ?? null,
    periodYearText: opts.year,
    insuredPartyId: "party-1",
    insuredParty: { id: "party-1", svkkPublicId: opts.svkk, name: "Holder" },
    years: [yearRow],
  };
}

function mockTx(policies: ReturnType<typeof makePolicy>[]) {
  return {
    policy: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return policies.filter((p) => {
          if (p.deletedAt) return false;
          const party = where.insuredParty as { svkkPublicId?: string } | undefined;
          if (party?.svkkPublicId && p.insuredParty.svkkPublicId !== party.svkkPublicId) {
            return false;
          }
          if (where.policyNo && p.policyNo !== where.policyNo) return false;
          if (where.referenceNo && p.referenceNo !== where.referenceNo) return false;
          const or = where.OR as Array<Record<string, unknown>> | undefined;
          if (or?.length) {
            const yearOk = or.some((clause) => {
              if (clause.periodYearText) return p.periodYearText === clause.periodYearText;
              const years = clause.years as
                | { some?: { yearLabel?: string; deletedAt?: null } }
                | undefined;
              const label = years?.some?.yearLabel;
              return label ? p.years.some((y) => y.yearLabel === label) : false;
            });
            if (!yearOk) return false;
          }
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const list = await mockTx(policies).policy.findMany({ where });
        if (where.referenceNo) {
          return policies.find((p) => p.referenceNo === where.referenceNo && !p.deletedAt) ?? null;
        }
        return list[0] ?? null;
      }),
    },
  };
}

describe("policyMatchesCsvYear", () => {
  it("matches periodYearText or yearLabel", () => {
    const p = makePolicy({ id: "p1", svkk: "SVKK0259", year: "2026-27" });
    expect(policyMatchesCsvYear(p, "2026-27")).toBe(true);
    expect(policyMatchesCsvYear(p, "2025-26")).toBe(false);
  });
});

describe("pickPolicyYearForCsvUpdate", () => {
  it("requires exact year when CSV year is present", () => {
    const p = makePolicy({ id: "p1", svkk: "SVKK0259", year: "2026-27" });
    expect(pickPolicyYearForCsvUpdate(p, "2026-27").yearLabel).toBe("2026-27");
    expect(() => pickPolicyYearForCsvUpdate(p, "2025-26")).toThrow(/not found/);
  });

  it("falls back to latest year only when CSV year is blank", () => {
    const p = makePolicy({ id: "p1", svkk: "SVKK0259", year: "2026-27" });
    expect(pickPolicyYearForCsvUpdate(p, "").yearLabel).toBe("2026-27");
  });
});

describe("resolvePolicyForCsvImport year scoping", () => {
  const p2024 = makePolicy({
    id: "p24",
    svkk: "SVKK0259",
    year: "2024-25",
    policyNo: "P1001",
    refNo: "REF24",
  });
  const p2025 = makePolicy({
    id: "p25",
    svkk: "SVKK0259",
    year: "2025-26",
    policyNo: "P1002",
    refNo: "REF25",
  });
  const p2026 = makePolicy({
    id: "p26",
    svkk: "SVKK0259",
    year: "2026-27",
    policyNo: "P1003",
    refNo: "REF26",
  });

  it("matches only the targeted year for SVKK + year", async () => {
    const tx = mockTx([p2024, p2025, p2026]) as never;
    const r = await resolvePolicyForCsvImport(tx, {
      svkkId: "SVKK0259",
      policyNo: "",
      refNo: "",
      year: "2026-27",
    });
    expect(r.match?.id).toBe("p26");
    expect(r.matchedBy).toBe("svkkId");
    expect(r.conflict).toBeUndefined();
  });

  it("does not match sibling years when updating 2026-27", async () => {
    const tx = mockTx([p2024, p2025, p2026]) as never;
    const r = await resolvePolicyForCsvImport(tx, {
      svkkId: "SVKK0259",
      policyNo: "P1003",
      refNo: "",
      year: "2026-27",
    });
    expect(r.match?.id).toBe("p26");
    expect(r.match?.id).not.toBe("p24");
    expect(r.match?.id).not.toBe("p25");
  });

  it("returns null (allow create) when SVKK exists but year does not", async () => {
    const tx = mockTx([p2024, p2025]) as never;
    const r = await resolvePolicyForCsvImport(tx, {
      svkkId: "SVKK0259",
      policyNo: "",
      refNo: "",
      year: "2026-27",
    });
    expect(r.match).toBeNull();
    expect(r.conflict).toBeUndefined();
  });

  it("conflicts when SVKK has multiple years and year is omitted", async () => {
    const tx = mockTx([p2024, p2025, p2026]) as never;
    const r = await resolvePolicyForCsvImport(tx, {
      svkkId: "SVKK0259",
      policyNo: "",
      refNo: "",
      year: "",
    });
    expect(r.match).toBeNull();
    expect(r.conflict).toMatch(/Multiple policies share this SVKK ID/);
  });

  it("prefers unique ref no and validates year", async () => {
    const tx = mockTx([p2024, p2025, p2026]) as never;
    const ok = await resolvePolicyForCsvImport(tx, {
      svkkId: "SVKK0259",
      policyNo: "",
      refNo: "REF26",
      year: "2026-27",
    });
    expect(ok.match?.id).toBe("p26");

    const bad = await resolvePolicyForCsvImport(tx, {
      svkkId: "",
      policyNo: "",
      refNo: "REF26",
      year: "2024-25",
    });
    expect(bad.match).toBeNull();
    expect(bad.conflict).toMatch(/Year "2024-25" does not match/);
  });
});

describe("resolvePolicyForCsvUpdate year check", () => {
  it("rejects year mismatch after ref-no match", async () => {
    const p = makePolicy({
      id: "p26",
      svkk: "SVKK0259",
      year: "2026-27",
      refNo: "REF26",
    });
    const tx = mockTx([p]) as never;
    const r = await resolvePolicyForCsvUpdate(tx, {
      refNo: "REF26",
      year: "2025-26",
    });
    expect(r.match).toBeNull();
    expect(r.conflict).toMatch(/Year "2025-26" does not match/);
  });
});
