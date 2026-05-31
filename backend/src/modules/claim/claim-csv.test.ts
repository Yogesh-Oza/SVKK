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
