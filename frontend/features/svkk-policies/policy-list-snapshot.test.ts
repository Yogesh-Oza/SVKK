import { describe, expect, it } from "vitest";
import { buildPolicySnapshotFields, latestRemarkForSnapshot } from "./policy-list-snapshot";

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

  it("prefers policy change remark over general", () => {
    const text = latestRemarkForSnapshot(
      "General Remark: hello\nPolicy Change Remark: updated note",
    );
    expect(text).toBe("updated note");
  });
});
