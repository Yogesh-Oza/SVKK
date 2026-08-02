import { describe, expect, it } from "vitest";
import { ClaimStatus } from "@prisma/client";
import {
  CLAIM_CSV_PUBLIC_HEADERS,
  buildSampleClaimCsv,
  canonicalClaimHeader,
  claimExportFilename,
} from "./claim-csv-format.js";
import { parseClaimRow } from "./claim-csv-import.js";
import { buildClaimsExportCsv } from "./claim.export-csv.js";
import { csvCell } from "../policy/policy-csv-utils.js";
import type { ClaimListRow } from "./claim.list.js";
import { shouldRejectDuplicateClaim } from "./claim-duplicate.js";
import { CsvImportMode } from "@prisma/client";

describe("canonical 39-column CSV contract", () => {
  it("has exactly 39 public headers", () => {
    expect(CLAIM_CSV_PUBLIC_HEADERS).toHaveLength(39);
  });

  it("sample CSV headers match public headers exactly", () => {
    const sample = buildSampleClaimCsv();
    const headerLine = sample.replace(/^\uFEFF/, "").split(/\r?\n/)[0]!;
    const headers = headerLine.split(",").map((h) => h.replace(/^"|"$/g, ""));
    expect(headers).toEqual([...CLAIM_CSV_PUBLIC_HEADERS]);
  });

  it("export filename uses SVKK_Claims_YYYY-MM-DD.csv", () => {
    expect(claimExportFilename(new Date("2026-08-02T12:00:00"))).toBe("SVKK_Claims_2026-08-02.csv");
  });

  it("maps public headers to internal parse keys", () => {
    expect(canonicalClaimHeader("Claim  No. ( CCN)")).toBe("Claim Number");
    expect(canonicalClaimHeader(" Claim Lodge Amt")).toBe("Claim Amount");
    expect(canonicalClaimHeader("Paid Amount")).toBe("Approved Amt");
    expect(canonicalClaimHeader("SVKK ID")).toBe("SVKK ID");
    expect(canonicalClaimHeader("Policy Grouping")).toBe("Policy Grouping");
    expect(canonicalClaimHeader("Treatment  Type")).toBe("Treatment Procedure");
  });

  it("escapes commas/quotes in csvCell", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("round-trips export → parse without losing claimNo/amounts/SVKK/policyNo", () => {
    const row = {
      claimNo: "CCN2024001",
      svkkPublicId: "SVKK001",
      policyNoText: "MDI123",
      policyGroupingText: "Group A",
      categoryText: "A",
      policyTypeText: "Floater",
      insuranceCompany: "New India",
      policyHolderName: "Ramesh",
      mdId: "M001",
      patientName: "Ramesh",
      patientAge: 45,
      patientGender: "M",
      patientRelation: "Self",
      sumInsured: 500000,
      hospitalName: "Shree",
      hospitalArea: "Anand",
      treatmentType: "In-Patient",
      treatmentProcedure: "In-Patient",
      illness: "Appendicitis",
      diseaseCategory: "Digestive",
      admissionDate: new Date(Date.UTC(2024, 3, 15)),
      dischargeDate: new Date(Date.UTC(2024, 3, 20)),
      claimAmount: 85000,
      lodgeDate: new Date(Date.UTC(2024, 3, 22)),
      claimType: "Cashless",
      actualLodgeType: "Cashless",
      deductionAmount: 5000,
      discountAmount: 0,
      deductionDetails: null,
      remark: null,
      approvedAmount: 80000,
      paymentInFavourOf: "New India",
      prsCrsDate: new Date(Date.UTC(2024, 3, 24)),
      paymentDetails: "NEFT/1",
      paymentDate: new Date(Date.UTC(2024, 3, 25)),
      statusText: "Paid",
      status: "APPROVED",
      reportedLodgeAmount: 85000,
      policyStartDate: new Date(Date.UTC(2024, 3, 1)),
      policyEndDate: new Date(Date.UTC(2025, 2, 31)),
      policy: null,
      policyYearRow: null,
    } as unknown as ClaimListRow;

    const csv = buildClaimsExportCsv([row]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(CLAIM_CSV_PUBLIC_HEADERS.map(csvCell).join(","));
    const values = lines[1]!.split(",").map((c) => c.replace(/^"|"$/g, ""));
    const map = new Map<string, string>();
    CLAIM_CSV_PUBLIC_HEADERS.forEach((h, i) => {
      map.set(canonicalClaimHeader(h), values[i] ?? "");
    });
    const parsed = parseClaimRow(2, map, {
      paid: ClaimStatus.APPROVED,
    });
    expect(parsed.claimNo).toBe("CCN2024001");
    expect(parsed.svkkPublicIdCsv).toBe("SVKK001");
    expect(parsed.policyNo).toBe("MDI123");
    expect(parsed.policyGroupingText).toBe("Group A");
    expect(parsed.claimAmount).toBe(85000);
    expect(parsed.approvedAmount).toBe(80000);
    expect(parsed.categoryText).toBe("A");
  });

  it("re-import of same claimNo is rejected by CREATE_ONLY (no silent duplicates)", () => {
    expect(shouldRejectDuplicateClaim(CsvImportMode.CREATE_ONLY, "CCN2024001")).toBe(true);
  });
});
