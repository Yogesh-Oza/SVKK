import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  buildWalletSampleCsv,
  formatWalletTxnType,
  normalizeWalletCategory,
  normalizeWalletMonth,
  parseWalletAmount,
  parseWalletCsvDate,
  parseWalletCsvType,
  parseWalletLedgerType,
  resolveWalletCsvHeader,
  WALLET_TXN_EXPORT_HEADERS,
  WALLET_USAGE_CSV_HEADERS,
} from "./wallet-csv-format.js";
import { assertWalletCsvHeaders } from "./wallet-csv-import.js";
import { parseCsv } from "../policy/policy-csv-parse.js";
import { buildWalletTransactionsExportCsv } from "./wallet.export.js";

describe("wallet-csv-format", () => {
  it("normalizes categories case-insensitively", () => {
    expect(normalizeWalletCategory("a")).toBe("A");
    expect(normalizeWalletCategory("STAFF")).toBe("Staff");
    expect(normalizeWalletCategory("svga")).toBe("SVGA");
    expect(normalizeWalletCategory("xyz")).toBe("xyz");
    expect(normalizeWalletCategory("Category B")).toBe("B");
    expect(normalizeWalletCategory("")).toBe("");
  });

  it("normalizes month names and numbers", () => {
    expect(normalizeWalletMonth("6")).toBe("June");
    expect(normalizeWalletMonth("june")).toBe("June");
    expect(normalizeWalletMonth("-")).toBe("");
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

  it("accepts prototype and legacy headers", () => {
    expect(resolveWalletCsvHeader("catagory")).toBe("Category");
    expect(resolveWalletCsvHeader("Category")).toBe("Category");
    expect(resolveWalletCsvHeader("Date")).toBe("Date of Submission");
    expect(resolveWalletCsvHeader("Date of Submission")).toBe("Date of Submission");
    expect(resolveWalletCsvHeader("Particulars")).toBe("Remark");
    expect(resolveWalletCsvHeader("Amount")).toBe("Deposited/Deducted Amount");
    expect(resolveWalletCsvHeader("Deposited/Deducted Amount")).toBe("Deposited/Deducted Amount");
    expect(resolveWalletCsvHeader("Holder's Name")).toBe("Holder's Name");
    expect(resolveWalletCsvHeader("holders name")).toBe("Holder's Name");
    expect(resolveWalletCsvHeader("CD Account")).toBe("CD Account Used");
    expect(resolveWalletCsvHeader("Reference")).toBe("Reference");
  });

  it("parses CSV type defaulting to Debit", () => {
    expect(parseWalletCsvType("Credit")).toBe("CREDIT");
    expect(parseWalletCsvType("DEBIT")).toBe("DEBIT");
    expect(parseWalletCsvType("")).toBe("DEBIT");
  });

  it("parses ledger types including TOP-UP", () => {
    expect(parseWalletLedgerType("TOP-UP")).toBe("TOP_UP");
    expect(parseWalletLedgerType("adjustment")).toBe("ADJUSTMENT");
    expect(parseWalletLedgerType("nope")).toBeNull();
  });

  it("serializes TOP_UP as TOP-UP and keeps CREDIT/ADJUSTMENT", () => {
    expect(formatWalletTxnType("TOP_UP")).toBe("TOP-UP");
    expect(formatWalletTxnType("DEBIT")).toBe("DEBIT");
    expect(formatWalletTxnType("CREDIT")).toBe("CREDIT");
    expect(formatWalletTxnType("ADJUSTMENT")).toBe("ADJUSTMENT");
  });

  it("sample CSV headers match importer contract", () => {
    const csv = buildWalletSampleCsv().replace(/^\uFEFF/, "");
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...WALLET_USAGE_CSV_HEADERS]);
    assertWalletCsvHeaders(rows[0]!);
  });

  it("sample CSV rows are all valid for import rules", () => {
    const csv = buildWalletSampleCsv().replace(/^\uFEFF/, "");
    const rows = parseCsv(csv);
    const header = rows[0]!;
    const idx = (name: string) => header.findIndex((h) => resolveWalletCsvHeader(h) === name);
    const catIdx = idx("Category");
    const amtIdx = idx("Deposited/Deducted Amount");
    const dateIdx = idx("Date of Submission");
    for (const row of rows.slice(1)) {
      expect(normalizeWalletCategory(row[catIdx])).not.toBe("");
      const amt = parseWalletAmount(row[amtIdx]);
      expect(amt && amt.gt(0)).toBe(true);
      expect(parseWalletCsvDate(row[dateIdx])).not.toBe("invalid");
    }
  });

  it("transaction export CSV includes Transaction ID, Policy ID, Policy Number, Created By", () => {
    const csv = buildWalletTransactionsExportCsv([
      {
        id: "txn-1",
        dateOfSubmission: "2026-06-16",
        month: "June",
        year: "2026",
        type: "DEBIT",
        holderName: "Kiran",
        village: "Bhachau",
        category: "A",
        group: "SVKK",
        policyType: "Individual",
        cdAccountUsed: "Yes",
        cdAmount: "5000.00",
        remark: "Print",
        amount: "250.00",
        balanceAfter: "750.00",
        policyId: "pol-1",
        policyNumber: "PO-1",
        createdBy: "Admin",
      },
    ]).replace(/^\uFEFF/, "");
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...WALLET_TXN_EXPORT_HEADERS]);
    expect(rows[0]).toEqual(
      expect.arrayContaining(["Transaction ID", "Policy ID", "Policy Number", "Created By"]),
    );
    expect(rows[1]?.[0]).toBe("txn-1");
    expect(rows[1]?.[15]).toBe("pol-1");
    expect(rows[1]?.[16]).toBe("PO-1");
    expect(rows[1]?.[17]).toBe("Admin");
  });
});
