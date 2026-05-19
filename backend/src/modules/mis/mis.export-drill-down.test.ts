import { describe, expect, it } from "vitest";
import {
  buildPolicyMemberDrillDownCsv,
  drillDownExportFilename,
  drillDownSectionTitle,
  formatDrillDownCell,
} from "./mis.export-drill-down.js";

describe("formatDrillDownCell", () => {
  it("formats money like the UI", () => {
    expect(formatDrillDownCell("sumVkk", 19747)).toMatch(/19,747/);
    expect(formatDrillDownCell("sumVkk", 19747)).toContain("₹");
  });

  it("formats counts with grouping", () => {
    expect(formatDrillDownCell("totalPolicies", 3)).toBe("3");
  });
});

describe("drillDownSectionTitle", () => {
  it("matches dialog heading", () => {
    expect(drillDownSectionTitle("area", "Ambarnath-East", "d category")).toBe(
      "area ambarnath-east — d category",
    );
  });
});

describe("buildPolicyMemberDrillDownCsv", () => {
  it("exports UI-style sections with headers and formatted values", () => {
    const csv = buildPolicyMemberDrillDownCsv({
      drillType: "area",
      drillLabel: "Ambarnath-East",
      sections: [
        {
          categoryKey: "D",
          categoryLabel: "d category",
          rows: [
            {
              label: "RTY",
              totalPolicies: 1,
              membersPlusPolicies: 3,
              cntAshaKiran: 0,
              cntFamilyFloater: 1,
              cntIndividual: 0,
              sumVkk: 19747,
              sumCo: 19747,
              sumGross: 16735,
              sumComm: 2510,
              sumTwoLac: 19747,
              sumPolHolder: 19747,
              sumGaam: 0,
              sumRefund: 0,
              sumCd: 0,
              age0_18: 1,
              age19_35: 0,
              age36_45: 1,
              age46_50: 0,
              age51_55: 0,
              age56_60: 0,
              age61_65: 0,
              age65p: 0,
            },
            {
              label: "SVKK",
              totalPolicies: 0,
              membersPlusPolicies: 0,
              cntAshaKiran: 0,
              cntFamilyFloater: 0,
              cntIndividual: 0,
              sumVkk: 0,
              sumCo: 0,
              sumGross: 0,
              sumComm: 0,
              sumTwoLac: 0,
              sumPolHolder: 0,
              sumGaam: 0,
              sumRefund: 0,
              sumCd: 0,
              age0_18: 0,
              age19_35: 0,
              age36_45: 0,
              age46_50: 0,
              age51_55: 0,
              age56_60: 0,
              age61_65: 0,
              age65p: 0,
            },
          ],
        },
        {
          categoryKey: "A",
          categoryLabel: "a category",
          rows: [
            {
              label: "OTHER",
              totalPolicies: 0,
              membersPlusPolicies: 0,
              cntAshaKiran: 0,
              cntFamilyFloater: 0,
              cntIndividual: 0,
              sumVkk: 0,
              sumCo: 0,
              sumGross: 0,
              sumComm: 0,
              sumTwoLac: 0,
              sumPolHolder: 0,
              sumGaam: 0,
              sumRefund: 0,
              sumCd: 0,
              age0_18: 0,
              age19_35: 0,
              age36_45: 0,
              age46_50: 0,
              age51_55: 0,
              age56_60: 0,
              age61_65: 0,
              age65p: 0,
            },
          ],
        },
      ],
    });

    expect(csv).toContain("area ambarnath-east — d category");
    expect(csv).toContain("Type of PO,Total policies,Members + policies");
    expect(csv).toContain("RTY,1,3");
    expect(csv).toMatch(/RTY,1,3,0,1,0,.*19,747/);
    expect(csv).toContain("\n\narea ambarnath-east — a category");
    expect(csv).not.toContain("drillType");
  });
});

describe("drillDownExportFilename", () => {
  it("slugifies drill label", () => {
    expect(drillDownExportFilename("area", "Ambarnath-East")).toBe(
      "policy-member-area-ambarnath-east.csv",
    );
  });
});
