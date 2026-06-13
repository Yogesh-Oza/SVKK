import { describe, expect, it } from "vitest";
import { buildCategoryByKeyMap } from "@/lib/svkk/category-display";
import {
  buildPolicySnapshotFields,
  categoryLabelForSnapshot,
  latestRemarkForSnapshot,
  policyTypeLabelForSnapshot,
} from "./policy-list-snapshot";

describe("policy-list-snapshot", () => {
  it("uses latest year policy number", () => {
    const fields = buildPolicySnapshotFields({
      policyNo: "OLD",
      periodMonthText: "March",
      periodYearText: "2026",
      village: "Bharudia",
      area: "Byculla",
      remarks: null,
      policyGrouping: "G1",
      whatsappNo: "9999999999",
      insuredParty: { name: "Test Holder", email: "a@b.com", customerId: "C1" },
      policyType: { name: "AD" },
      category: { key: "CAT", name: "Category A" },
      years: [{ yearLabel: "2026", policyNo: "PO-NEW" }],
    });
    expect(fields.find((f) => f.label === "Policy no.")?.value).toBe("PO-NEW");
    expect(fields.find((f) => f.label === "Year")?.value).toBe("2026");
  });

  it("prefers policy type name over ad product variant for list label", () => {
    const label = policyTypeLabelForSnapshot({
      policyNo: null,
      village: null,
      area: null,
      remarks: null,
      adProductVariant: "FAMILY_FLOATER",
      insuredParty: { name: "H", customerId: null },
      policyType: { name: "Asha Kiran" },
      category: null,
      years: [],
    });
    expect(label).toBe("Asha Kiran");
  });

  it("falls back to categoryText when category relation is missing", () => {
    expect(
      categoryLabelForSnapshot({
        policyNo: null,
        village: null,
        area: null,
        remarks: null,
        insuredParty: { name: "H", customerId: null },
        policyType: { name: "AD" },
        category: null,
        categoryText: "D",
        years: [],
      }),
    ).toBe("D");
    const byKey = buildCategoryByKeyMap([{ key: "d", name: "Category D" }]);
    expect(
      categoryLabelForSnapshot(
        {
          policyNo: null,
          village: null,
          area: null,
          remarks: null,
          insuredParty: { name: "H", customerId: null },
          policyType: { name: "AD" },
          category: null,
          categoryText: "d",
          years: [],
        },
        byKey,
      ),
    ).toBe("Category D");
    const fields = buildPolicySnapshotFields({
      policyNo: null,
      periodMonthText: "May",
      periodYearText: "2026-27",
      village: "Manafara",
      area: "Borivali-West",
      remarks: null,
      insuredParty: { name: "H", email: null, customerId: "ME1" },
      policyType: { name: "Asha Kiran" },
      category: null,
      categoryText: "D",
      adProductVariant: "FAMILY_FLOATER",
      years: [{ yearLabel: "2026-27", policyNo: null }],
    });
    expect(fields.find((f) => f.label === "Category")?.value).toBe("D");
    const fieldsNamed = buildPolicySnapshotFields(
      {
        policyNo: null,
        periodMonthText: "May",
        periodYearText: "2026-27",
        village: "Manafara",
        area: "Borivali-West",
        remarks: null,
        insuredParty: { name: "H", email: null, customerId: "ME1" },
        policyType: { name: "Asha Kiran" },
        category: null,
        categoryText: "d",
        adProductVariant: "FAMILY_FLOATER",
        years: [{ yearLabel: "2026-27", policyNo: null }],
      },
      buildCategoryByKeyMap([{ key: "d", name: "Category D" }]),
    );
    expect(fieldsNamed.find((f) => f.label === "Category")?.value).toBe("Category D");
    expect(fields.find((f) => f.label === "Policy type")?.value).toBe("Asha Kiran");
  });

  it("shows all three remark fields on snapshot", () => {
    const fields = buildPolicySnapshotFields({
      policyNo: "PO-1",
      periodMonthText: "March",
      periodYearText: "2026",
      village: "Bharudia",
      area: "Byculla",
      remarks: "General Remark:\nhello\n\nPolicy Change Remark:\nupdated",
      yearRemarks: "year note",
      policyGrouping: "G1",
      whatsappNo: "9999999999",
      insuredParty: { name: "Test Holder", email: "a@b.com", customerId: "C1" },
      policyType: { name: "AD" },
      category: { key: "CAT", name: "Category A" },
      years: [{ yearLabel: "2026", policyNo: "PO-NEW" }],
    });
    expect(fields.find((f) => f.label === "General Remark")?.value).toBe("hello");
    expect(fields.find((f) => f.label === "Policy Change Remark")?.value).toBe("updated");
    expect(fields.find((f) => f.label === "Policy Remark")?.value).toBe("year note");
  });

  it("prefers policy change remark over general", () => {
    const text = latestRemarkForSnapshot(
      "General Remark: hello\nPolicy Change Remark: updated note",
    );
    expect(text).toBe("updated note");
  });
});
