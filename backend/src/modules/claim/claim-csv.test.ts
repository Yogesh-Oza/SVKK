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
});
