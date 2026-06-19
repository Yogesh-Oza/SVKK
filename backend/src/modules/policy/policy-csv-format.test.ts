import { describe, expect, it } from "vitest";
import {
  POLICY_CSV_EXPORT_HEADERS,
  POLICY_CSV_FLAT_HEADERS,
  POLICY_CSV_VERSION,
  buildLegacyPolicyCsvCells,
  buildPolicyCsvExportHeaderLine,
  buildPolicyCsvSample,
  detectFormatFromHeaders,
  formatPolicyUrlForCsvExport,
  parseCsvWithOptionalVersion,
} from "./policy-csv-format.js";
import { buildPaymentExportPlan, paymentCsvHeader } from "./policy-csv-payment-columns.js";
import { parseCsv } from "./policy-csv-parse.js";
import {
  buildCombinedRemarksFromParts,
  parseRemarks,
  resolvePolicyRemarkCsvCells,
} from "./policy-csv-utils.js";

describe("policy-csv-format v2", () => {
  it("flat headers include PRE. END DATE and Member 1 block", () => {
    expect(POLICY_CSV_FLAT_HEADERS).toContain("PRE. END DATE");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("Member 1 Name");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("MEMBER 1 DATE OF JOINING");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("policy remarK");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("category change remark");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("loan_repayment");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("loan_pending_amt");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("nominee_dob");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("bank_ac_holder_name");
  });

  it("export header line includes extended member and payment slots in grouped order", () => {
    const headerLine = buildPolicyCsvExportHeaderLine();
    const [header] = parseCsv(`${headerLine}\r\n`);
    expect(header).toHaveLength(POLICY_CSV_EXPORT_HEADERS.length);
    expect(header).toContain("Member 1 Name");
    expect(header).toContain("Member 2 Name");
    expect(header).toContain(paymentCsvHeader(2, "method"));
    expect(header?.at(-1)).toBe("url");
    expect(header?.indexOf(paymentCsvHeader(2, "method"))).toBeLessThan(
      header?.indexOf("Gross premium") ?? -1,
    );
    expect(header?.indexOf("Member 2 Name")).toBeLessThan(header?.indexOf("nominee_name") ?? -1);
    expect(header?.indexOf("url")).toBeGreaterThan(header?.indexOf("Member 2 Name") ?? -1);
  });

  it("sample CSV has header row only without CSV_VERSION row", () => {
    const rows = parseCsv(buildPolicyCsvSample());
    expect(rows[0]?.[0]).toBe("year");
    expect(rows[0]).not.toContain("CSV_VERSION");
    expect(rows.length).toBe(2);
  });

  it("detects v2 from headers", () => {
    expect(detectFormatFromHeaders([...POLICY_CSV_FLAT_HEADERS])).toBe(POLICY_CSV_VERSION);
  });

  it("parses optional CSV_VERSION row", () => {
    const parsed = parseCsvWithOptionalVersion([
      ["CSV_VERSION", "v2"],
      ["year", "month"],
      ["2026-27", "May"],
    ]);
    expect(parsed.csvVersion).toBe("v2");
    expect(parsed.header[0]).toBe("year");
    expect(parsed.dataRows).toHaveLength(1);
  });
});

describe("formatPolicyUrlForCsvExport", () => {
  const oneDrive =
    "https://1drv.ms/i/c/52807dc0312d4da3/IQCIsC2JTCmBQJ4qujAzUweCAWNcu4IzQTVJjcEPTO85UmQ";

  it("exports a single OneDrive URL from JSON array storage", () => {
    expect(formatPolicyUrlForCsvExport(JSON.stringify([oneDrive]))).toBe(oneDrive);
  });

  it("exports a legacy plain URL as-is", () => {
    expect(formatPolicyUrlForCsvExport(oneDrive)).toBe(oneDrive);
  });

  it("does not export document count summaries", () => {
    expect(formatPolicyUrlForCsvExport(JSON.stringify([oneDrive, "https://example.com/doc2"]))).not.toContain(
      "document(s)",
    );
  });
});

describe("policy remark CSV columns", () => {
  it("splits combined Policy.remarks into gen remark, policy remarK, and category change remark", () => {
    const combined = buildCombinedRemarksFromParts("test 1", "policy note", "category note");
    expect(parseRemarks(combined)).toEqual({
      generalRemark: "test 1",
      policyChangeRemark: "policy note",
      categoryChangeRemark: "category note",
    });
    expect(resolvePolicyRemarkCsvCells(combined, "Sample import row")).toEqual({
      genRemark: "test 1",
      policyRemark: "policy note",
      categoryChangeRemark: "category note",
    });
  });

  it("falls back to yearRemarks for policy remarK when no policy change remark stored", () => {
    expect(resolvePolicyRemarkCsvCells("Legacy general note", "Sample import row")).toEqual({
      genRemark: "Legacy general note",
      policyRemark: "Sample import row",
      categoryChangeRemark: "",
    });
  });

  it("exports split remark columns without label prefixes", () => {
    const combined = buildCombinedRemarksFromParts("test 1", "policy note", "category note");
    const row = {
      remarks: combined,
      years: [{ yearRemarks: "Sample import row", members: [], payments: [] }],
    } as Parameters<typeof buildLegacyPolicyCsvCells>[0];
    const headers = ["gen remark", "policy remarK", "category change remark"];
    const paymentPlan = buildPaymentExportPlan([], 1);
    const cells = buildLegacyPolicyCsvCells(
      row,
      null,
      row.years[0],
      new Map(),
      headers,
      paymentPlan,
    );
    expect(cells[headers.indexOf("gen remark")]).toBe("test 1");
    expect(cells[headers.indexOf("policy remarK")]).toBe("policy note");
    expect(cells[headers.indexOf("category change remark")]).toBe("category note");
  });
});
