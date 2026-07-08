import { describe, expect, it } from "vitest";
import {
  datesEqualUtc,
  holderNamesMatch,
  normalizePersonName,
  parseClaimDate,
  parseClaimDecimal,
  sumInsuredMatches,
} from "./claim-csv-normalize.js";
import {
  mapStatusTextToEnum,
  normalizeStatusText,
  DEFAULT_CLAIM_STATUS_MAP,
} from "./claim-status-map.js";
import { ClaimStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { canonicalClaimHeader } from "./claim-csv-format.js";
import { parseClaimRow } from "./claim-csv-import.js";

describe("claim-csv-normalize", () => {
  it("parses ISO and DD-MM-YYYY dates", () => {
    expect(parseClaimDate("2024-03-15")?.toISOString().slice(0, 10)).toBe("2024-03-15");
    expect(parseClaimDate("15-03-2024")?.toISOString().slice(0, 10)).toBe("2024-03-15");
  });

  it("parses US M/D/YY field-software dates as month-first", () => {
    expect(parseClaimDate("1/22/25")?.toISOString().slice(0, 10)).toBe("2025-01-22");
    expect(parseClaimDate("12/3/25")?.toISOString().slice(0, 10)).toBe("2025-12-03");
    // slash + 4-digit year stays day-first (legacy TPA sheets)
    expect(parseClaimDate("15/03/2024")?.toISOString().slice(0, 10)).toBe("2024-03-15");
  });

  it("compares dates by UTC day", () => {
    const a = new Date(Date.UTC(2024, 2, 15));
    const b = new Date(Date.UTC(2024, 2, 15, 12, 0, 0));
    expect(datesEqualUtc(a, b)).toBe(true);
  });

  it("matches holder name variants with token overlap", () => {
    expect(holderNamesMatch("YOGESH OZA", "Yogesh M. Oza")).toBe(true);
    expect(normalizePersonName("  Yogesh   Oza ")).toBe("yogesh oza");
  });

  it("parses decimals and sum insured", () => {
    expect(parseClaimDecimal("1,50,000")).toBe(150000);
    expect(sumInsuredMatches(200000, new Prisma.Decimal("200000.00"))).toBe(true);
  });
});

describe("claim-status-map", () => {
  it("maps TPA status aliases", () => {
    expect(mapStatusTextToEnum("Paid", DEFAULT_CLAIM_STATUS_MAP)).toBe(ClaimStatus.APPROVED);
    expect(mapStatusTextToEnum("under process", DEFAULT_CLAIM_STATUS_MAP)).toBe(ClaimStatus.PENDING);
    expect(normalizeStatusText("  Under   Process ")).toBe("under process");
  });
});

describe("claim CSV header aliases", () => {
  it("normalizes lodge/paid headers used in TPA sheets", () => {
    expect(canonicalClaimHeader("Claim Lodge Amt")).toBe("Claim Amount");
    expect(canonicalClaimHeader("Paid Amount")).toBe("Approved Amt");
    expect(canonicalClaimHeader("Claim LodgeType")).toBe("Claim Type");
    expect(canonicalClaimHeader("Claim  No. ( CCN)")).toBe("Claim Number");
  });

  it("normalizes field-software (Claim data 25-26) headers", () => {
    expect(canonicalClaimHeader("MD ID")).toBe("MD ID");
    expect(canonicalClaimHeader("Actual Lodge Type")).toBe("Actual Lodge Type");
    expect(canonicalClaimHeader("Treatment Type")).toBe("Treatment Type");
    // double-space variant is the distinct procedure column
    expect(canonicalClaimHeader("Treatment  Type")).toBe("Treatment Procedure");
    expect(canonicalClaimHeader("Disease Category")).toBe("Disease Category");
    expect(canonicalClaimHeader("Reported_LodgeAmt")).toBe("Reported Lodge Amt");
    expect(canonicalClaimHeader("Discount Amt")).toBe("Discount Amt");
    expect(canonicalClaimHeader("Payment In Faver Of")).toBe("Payment In Favour Of");
    expect(canonicalClaimHeader("PRSDate/CRS Date")).toBe("PRS/CRS Date");
    expect(canonicalClaimHeader("Claim Lodge Date")).toBe("Claim Lodge Date");
    expect(canonicalClaimHeader("DIAGNOSIS")).toBe("Illness");
  });

  it("parses claim amount and approved amount from aliased headers", () => {
    const map = new Map<string, string>([
      ["Claim Number", "MDI123"],
      ["Policy Number", "PO-1"],
      ["Policy Holder Name", "Test Holder"],
      ["Policy Type", "Family Floater"],
      ["Policy Start Date", "01-01-2025"],
      ["Policy End Date", "31-12-2025"],
      ["Claim Amount", "12,345"],
      ["Approved Amt", "10,001"],
      ["Status", "Paid"],
    ]);
    const row = parseClaimRow(2, map, {
      paid: ClaimStatus.APPROVED,
      "under process": ClaimStatus.PENDING,
      denied: ClaimStatus.REJECTED,
    });
    expect(row.claimNo).toBe("MDI123");
    expect(row.claimAmount).toBe(12345);
    expect(row.approvedAmount).toBe(10001);
  });

  it("parses a real field-software row (M/D/YY dates, Non Cash Less)", () => {
    const map = new Map<string, string>([
      ["Claim Number", "CCN-900"],
      ["Policy Number", "PO-9"],
      ["Policy Holder Name", "Field Holder"],
      ["MD ID", "MD-77"],
      ["Category", "A"],
      ["Actual Lodge Type", "Non Cash Less"],
      ["Claim Type", "Non Cash Less"],
      ["Treatment Type", "Surgical"],
      ["Treatment Procedure", "Cataract"],
      ["Disease Category", "Ophthalmology"],
      ["Claim Lodge Date", "1/22/25"],
      ["Payment Date", "2/5/25"],
      ["PRS/CRS Date", "2/1/25"],
      ["Reported Lodge Amt", "40,000"],
      ["Discount Amt", "1,000"],
      ["Approved Amt", "38,000"],
      ["Payment In Favour Of", "Eye Care Hospital"],
      ["Remark", "field verified"],
      ["Status", "End OS"],
    ]);
    const row = parseClaimRow(3, map, {
      paid: ClaimStatus.APPROVED,
      "end os": ClaimStatus.PENDING,
      repudiated: ClaimStatus.REJECTED,
    });
    expect(row.mdId).toBe("MD-77");
    expect(row.actualLodgeType).toBe("Non Cash Less");
    expect(row.treatmentType).toBe("Surgical");
    expect(row.treatmentProcedure).toBe("Cataract");
    expect(row.diseaseCategory).toBe("Ophthalmology");
    expect(row.reportedLodgeAmount).toBe(40000);
    expect(row.discountAmount).toBe(1000);
    expect(row.approvedAmount).toBe(38000);
    expect(row.paymentInFavourOf).toBe("Eye Care Hospital");
    expect(row.remark).toBe("field verified");
    expect(row.lodgeDate?.toISOString().slice(0, 10)).toBe("2025-01-22");
    expect(row.paymentDate?.toISOString().slice(0, 10)).toBe("2025-02-05");
    expect(row.prsCrsDate?.toISOString().slice(0, 10)).toBe("2025-02-01");
    expect(row.status).toBe(ClaimStatus.PENDING);
  });
});
