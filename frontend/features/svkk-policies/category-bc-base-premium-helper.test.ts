import { describe, expect, it } from "vitest";
import {
  CATEGORY_BC_HELPER_BASE_SI,
  categoryBcHelperBaseSiLabel,
  categoryBcHelperFieldHint,
  formatCategoryBcHelperPremiumValue,
  isCategoryBc,
  resolveCategoryBcBasePremiumEligibility,
  shouldOpenCategoryBcBasePremiumOnTriggerChange,
} from "./category-bc-base-premium-helper";

describe("resolveCategoryBcBasePremiumEligibility", () => {
  it("Cat B + Individual + ₹1L → no popup", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "individual",
      sumInsured: "100000",
    });
    expect(r.eligible).toBe(false);
    expect(r.baseSi).toBe(CATEGORY_BC_HELPER_BASE_SI.individual);
  });

  it("Cat B + Individual + ₹2L → popup, base ₹1L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "B",
      policyType: "individual",
      sumInsured: "200000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(100_000);
    expect(r.fingerprint).toBe("b|individual|200000");
  });

  it("Cat C + Individual + ₹5L → popup, base ₹1L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "c",
      policyType: "individual",
      sumInsured: "500000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(100_000);
    expect(r.fingerprint).toBe("c|individual|500000");
  });

  it("Cat B + Family Floater + ₹1L → no popup", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "family_floater",
      sumInsured: "100000",
    });
    expect(r.eligible).toBe(false);
  });

  it("Cat B + Family Floater + ₹2L → popup, base ₹2L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "family_floater",
      sumInsured: "2,00,000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(200_000);
    expect(r.fingerprint).toBe("b|family_floater|200000");
  });

  it("Cat C + Family Floater + ₹5L → popup, base ₹2L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "c",
      policyType: "family_floater",
      sumInsured: "500000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(200_000);
  });

  it("Cat B + Asha Kiran + ₹2.5L → no popup", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "asha_kiran",
      sumInsured: "250000",
    });
    expect(r.eligible).toBe(false);
  });

  it("Cat B + Asha Kiran + ₹3L → popup, base ₹3L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "asha_kiran",
      sumInsured: "300000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(300_000);
    expect(r.fingerprint).toBe("b|asha_kiran|300000");
  });

  it("Cat C + Asha Kiran + ₹5L → popup, base ₹3L", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "c",
      policyType: "asha_kiran",
      sumInsured: "1000000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(300_000);
  });

  it("Category A → no popup regardless of SI", () => {
    expect(
      resolveCategoryBcBasePremiumEligibility({
        category: "a",
        policyType: "individual",
        sumInsured: "1000000",
      }).eligible,
    ).toBe(false);
    expect(
      resolveCategoryBcBasePremiumEligibility({
        category: "d",
        policyType: "family_floater",
        sumInsured: "1000000",
      }).eligible,
    ).toBe(false);
  });

  it("future SI slabs above threshold still trigger", () => {
    const r = resolveCategoryBcBasePremiumEligibility({
      category: "b",
      policyType: "individual",
      sumInsured: "1750000",
    });
    expect(r.eligible).toBe(true);
    expect(r.baseSi).toBe(100_000);
    expect(r.fingerprint).toBe("b|individual|1750000");
  });
});

describe("shouldOpenCategoryBcBasePremiumOnTriggerChange", () => {
  it("opens on each eligible SI change including returning to a prior SI", () => {
    let prev: string | null = null;

    let d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "b|asha_kiran|400000",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(true);
    prev = d.nextPreviousFingerprint;

    d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "b|asha_kiran|300000",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(true);
    prev = d.nextPreviousFingerprint;

    d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "b|asha_kiran|400000",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(true);
    expect(d.nextPreviousFingerprint).toBe("b|asha_kiran|400000");
  });

  it("does not reopen while the same eligible combo stays selected", () => {
    const d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "b|individual|200000",
      previousFingerprint: "b|individual|200000",
    });
    expect(d.open).toBe(false);
    expect(d.nextPreviousFingerprint).toBe("b|individual|200000");
  });

  it("resets tracking when crossing below threshold so later eligible SI opens again", () => {
    let prev: string | null = "b|asha_kiran|400000";

    let d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: false,
      fingerprint: "",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(false);
    expect(d.nextPreviousFingerprint).toBeNull();
    prev = d.nextPreviousFingerprint;

    d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "b|asha_kiran|400000",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(true);
  });

  it("opens when category returns to B/C while SI stays eligible", () => {
    let prev: string | null = "b|family_floater|500000";

    let d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: false,
      fingerprint: "",
      previousFingerprint: prev,
    });
    prev = d.nextPreviousFingerprint;

    d = shouldOpenCategoryBcBasePremiumOnTriggerChange({
      eligible: true,
      fingerprint: "c|family_floater|500000",
      previousFingerprint: prev,
    });
    expect(d.open).toBe(true);
  });
});

describe("category B/C helpers", () => {
  it("isCategoryBc only for b/c", () => {
    expect(isCategoryBc("b")).toBe(true);
    expect(isCategoryBc("C")).toBe(true);
    expect(isCategoryBc("a")).toBe(false);
  });

  it("uses dynamic base labels (AK is 3L, not 2L floater)", () => {
    expect(categoryBcHelperBaseSiLabel("individual")).toMatch(/1 Lakh/i);
    expect(categoryBcHelperBaseSiLabel("family_floater")).toMatch(/2 Lakh/i);
    expect(categoryBcHelperBaseSiLabel("asha_kiran")).toMatch(/3 Lakh/i);
    expect(categoryBcHelperFieldHint("asha_kiran")).toMatch(/3 Lakh Asha Kiran/i);
    expect(categoryBcHelperFieldHint("asha_kiran")).not.toMatch(/2 Lakh Floater/i);
  });

  it("formatCategoryBcHelperPremiumValue keeps zero and decimals", () => {
    expect(formatCategoryBcHelperPremiumValue(0)).toBe("0");
    expect(formatCategoryBcHelperPremiumValue(1500.5)).toBe("1500.5");
    expect(formatCategoryBcHelperPremiumValue(NaN)).toBe("");
  });
});
