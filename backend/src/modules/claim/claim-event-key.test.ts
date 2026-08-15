import { describe, expect, it } from "vitest";
import { claimEventKeyFromRow } from "./claim-event-key.js";
import { hashClaimImportFile } from "./claim-csv-preview.js";

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

describe("claimEventKeyFromRow", () => {
  it("is stable for the same payment identity and ignores filename/row", () => {
    const base = {
      claimNo: "MDI9918783",
      policyNo: "PO-14010034242800004866",
      actualLodgeType: "Additional Payment",
      claimType: "Additional Payment",
      statusText: "Paid",
      claimAmount: 5000,
      reportedLodgeAmount: 5000,
      approvedAmount: 5000,
      deductionAmount: 0,
      admissionDate: utc(2026, 1, 1),
      lodgeDate: utc(2026, 1, 10),
      paymentDate: utc(2026, 2, 1),
      paymentDetails: "NEFT-1",
      paymentInFavourOf: "Hospital",
    };
    expect(claimEventKeyFromRow(base)).toBe(claimEventKeyFromRow({ ...base }));
    expect(claimEventKeyFromRow(base)).toHaveLength(64);
  });

  it("changes when lodge type or amount changes (Test 2 payment rows)", () => {
    const a = claimEventKeyFromRow({
      claimNo: "CCN-001",
      policyNo: "PO-001",
      actualLodgeType: "Non Cash Less",
      claimAmount: 50000,
    });
    const b = claimEventKeyFromRow({
      claimNo: "CCN-001",
      policyNo: "PO-001",
      actualLodgeType: "Additional Payment",
      claimAmount: 5000,
    });
    const c = claimEventKeyFromRow({
      claimNo: "CCN-001",
      policyNo: "PO-001",
      actualLodgeType: "Deductions Payment",
      claimAmount: 2000,
    });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("does not collide for the same CCN with a different admission date", () => {
    const a = claimEventKeyFromRow({
      claimNo: "CCN-001",
      policyNo: "PO-001",
      actualLodgeType: "Non Cash Less",
      claimAmount: 50000,
      admissionDate: utc(2026, 1, 1),
    });
    const b = claimEventKeyFromRow({
      claimNo: "CCN-001",
      policyNo: "PO-001",
      actualLodgeType: "Non Cash Less",
      claimAmount: 50000,
      admissionDate: utc(2026, 2, 15),
    });
    expect(a).not.toBe(b);
  });
});

describe("hashClaimImportFile (duplicate protection)", () => {
  it("Test 5 — same filename with different contents produces a different hash", () => {
    const hashA = hashClaimImportFile("Claim Number,Policy Number\nCCN-001,PO-001\n");
    const hashB = hashClaimImportFile("Claim Number,Policy Number\nCCN-002,PO-001\n");
    expect(hashA).not.toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it("Test 6 — identical contents hash the same regardless of filename", () => {
    const contents = "Claim Number,Policy Number\nCCN-001,PO-001\n";
    expect(hashClaimImportFile(contents)).toBe(hashClaimImportFile(Buffer.from(contents)));
  });
});
