import { describe, expect, it } from "vitest";
import {
  POLICY_CSV_EXPORT_HEADERS,
  POLICY_CSV_FLAT_HEADERS,
  POLICY_CSV_VERSION,
  buildPolicyCsvExportHeaderLine,
  buildPolicyCsvSample,
  detectFormatFromHeaders,
  parseCsvWithOptionalVersion,
} from "./policy-csv-format.js";
import { parseCsv } from "./policy-csv-parse.js";

describe("policy-csv-format v2", () => {
  it("flat headers include PRE. END DATE and Member 1 block", () => {
    expect(POLICY_CSV_FLAT_HEADERS).toContain("PRE. END DATE");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("Member 1 Name");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("MEMBER 1 DATE OF JOINING");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("policy remarK");
  });

  it("export header line includes extended member and payment slots in grouped order", () => {
    const headerLine = buildPolicyCsvExportHeaderLine();
    const [header] = parseCsv(`${headerLine}\r\n`);
    expect(header).toHaveLength(POLICY_CSV_EXPORT_HEADERS.length);
    expect(header).toContain("Member 1 Name");
    expect(header).toContain("Member 2 Name");
    expect(header).toContain("Payment 2 amount");
    expect(header?.at(-1)).toBe("url");
    expect(header?.indexOf("Payment 2 amount")).toBeLessThan(header?.indexOf("Gross premium") ?? -1);
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
