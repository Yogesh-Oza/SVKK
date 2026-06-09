import { describe, expect, it } from "vitest";
import {
  buildPolicyMemberDrillDownCsv,
  drillDownExportFilename,
  drillDownSectionTitle,
  formatDrillDownCell,
  sumPolicyMemberDrillRows,
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
    expect(csv).toContain("TOTAL,1,3");
    expect(csv).not.toContain("drillType");
  });
});

describe("sumPolicyMemberDrillRows", () => {
  it("sums SVKK/NVKK/RTY/OTHER rows for a category section", () => {
    const rows = [
      {
        label: "RTY",
        totalPolicies: 1,
        membersPlusPolicies: 3,
        cntAshaKiran: 0,
        cntFamilyFloater: 1,
        cntIndividual: 0,
        sumVkk: 100,
        sumCo: 200,
        sumGross: 300,
        sumComm: 10,
        sumTwoLac: 400,
        sumPolHolder: 500,
        sumGaam: 600,
        sumRefund: 700,
        sumCd: 800,
        age0_18: 1,
        age19_35: 2,
        age36_45: 3,
        age46_50: 4,
        age51_55: 5,
        age56_60: 6,
        age61_65: 7,
        age65p: 8,
      },
      {
        label: "SVKK",
        totalPolicies: 2,
        membersPlusPolicies: 4,
        cntAshaKiran: 1,
        cntFamilyFloater: 0,
        cntIndividual: 1,
        sumVkk: 50,
        sumCo: 50,
        sumGross: 50,
        sumComm: 5,
        sumTwoLac: 50,
        sumPolHolder: 50,
        sumGaam: 50,
        sumRefund: 50,
        sumCd: 50,
        age0_18: 1,
        age19_35: 1,
        age36_45: 1,
        age46_50: 1,
        age51_55: 1,
        age56_60: 1,
        age61_65: 1,
        age65p: 1,
      },
    ];

    const total = sumPolicyMemberDrillRows(rows);
    expect(total.label).toBe("TOTAL");
    expect(total.totalPolicies).toBe(3);
    expect(total.sumVkk).toBe(150);
    expect(total.age65p).toBe(9);
  });
});

describe("drillDownExportFilename", () => {
  it("slugifies drill label", () => {
    expect(drillDownExportFilename("area", "Ambarnath-East")).toBe(
      "policy-member-area-ambarnath-east.csv",
    );
  });
});
