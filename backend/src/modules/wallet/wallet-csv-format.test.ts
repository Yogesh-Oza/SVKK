import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  buildWalletSampleCsv,
  formatWalletTxnType,
  normalizeWalletCategory,
  parseWalletAmount,
  parseWalletCsvDate,
  resolveWalletCsvHeader,
  WALLET_ALLOWED_CATEGORIES,
  WALLET_USAGE_CSV_HEADERS,
} from "./wallet-csv-format.js";
import { assertWalletCsvHeaders } from "./wallet-csv-import.js";
import { parseCsv } from "../policy/policy-csv-parse.js";

describe("wallet-csv-format", () => {
  it("normalizes categories case-insensitively", () => {
    expect(normalizeWalletCategory("a")).toBe("A");
    expect(normalizeWalletCategory("STAFF")).toBe("Staff");
    expect(normalizeWalletCategory("svga")).toBe("SVGA");
    expect(normalizeWalletCategory("xyz")).toBe("");
  });

  it("parses amounts stripping currency and commas", () => {
    expect(parseWalletAmount("₹1,250.50")?.toString()).toBe("1250.5");
    expect(parseWalletAmount("0")).toEqual(new Prisma.Decimal(0));
    expect(parseWalletAmount("-10")?.toString()).toBe("-10");
    expect(parseWalletAmount("abc")).toBeNull();
    expect(parseWalletAmount("")).toBeNull();
  });

  it("parses dates or marks invalid", () => {
    expect(parseWalletCsvDate("")).toBeNull();
    expect(parseWalletCsvDate("2026-06-16")).toBeInstanceOf(Date);
    expect(parseWalletCsvDate("16-06-2026")).toBeInstanceOf(Date);
    expect(parseWalletCsvDate("not-a-date")).toBe("invalid");
  });

  it("accepts catagory typo header", () => {
    expect(resolveWalletCsvHeader("catagory")).toBe("Category");
    expect(resolveWalletCsvHeader("Category")).toBe("Category");
  });

  it("serializes TOP_UP as TOP-UP", () => {
    expect(formatWalletTxnType("TOP_UP")).toBe("TOP-UP");
    expect(formatWalletTxnType("DEBIT")).toBe("DEBIT");
  });

  it("sample CSV headers match importer contract and include all categories", () => {
    const csv = buildWalletSampleCsv().replace(/^\uFEFF/, "");
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...WALLET_USAGE_CSV_HEADERS]);
    assertWalletCsvHeaders(rows[0]!);
    const cats = rows.slice(1).map((r) => r[1]);
    for (const c of WALLET_ALLOWED_CATEGORIES) {
      expect(cats).toContain(c);
    }
  });

  it("sample CSV rows are all valid for import rules", () => {
    const csv = buildWalletSampleCsv().replace(/^\uFEFF/, "");
    const rows = parseCsv(csv);
    for (const row of rows.slice(1)) {
      expect(normalizeWalletCategory(row[1])).not.toBe("");
      const amt = parseWalletAmount(row[3]);
      expect(amt && amt.gt(0)).toBe(true);
      expect(parseWalletCsvDate(row[0])).not.toBe("invalid");
    }
  });
});
