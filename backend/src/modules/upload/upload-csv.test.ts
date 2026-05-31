import { describe, expect, it } from "vitest";
import { buildErrorReportCsv } from "../policy/policy-csv-errors.js";
import {
  detectFormatFromHeaders,
  parseCsvWithOptionalVersion,
  POLICY_CSV_FLAT_HEADERS,
} from "../policy/policy-csv-format.js";
import { collectDeprecatedHeaderWarnings } from "../policy/policy-csv-slots.js";

describe("upload CSV pipeline helpers", () => {
  it("builds error report CSV for failed rows", () => {
    const csv = buildErrorReportCsv([
      { row: 15, error: "Invalid Product Type", svkkId: "RTYJUNE0019" },
      { row: 22, error: "Policy not found (UPDATE_ONLY mode)", policyNo: "PN-99" },
    ]);
    expect(csv).toContain("Row,Error,SVKK ID,Policy No,Ref No");
    expect(csv).toContain("15,Invalid Product Type,RTYJUNE0019,,");
    expect(csv).toContain("22,Policy not found");
  });

  it("detects v2 format for legacy import path", () => {
    expect(detectFormatFromHeaders([...POLICY_CSV_FLAT_HEADERS])).toBe("v2");
  });

  it("supports optional CSV_VERSION metadata row", () => {
    const parsed = parseCsvWithOptionalVersion([
      ["CSV_VERSION", "v2"],
      ["year", "SVKK ID"],
      ["2026-27", "ABC001"],
    ]);
    expect(parsed.csvVersion).toBe("v2");
    expect(parsed.dataRows).toHaveLength(1);
  });

  it("warns on deprecated Member 3 headers", () => {
    const warnings = collectDeprecatedHeaderWarnings([
      "year",
      "Member 3 Name",
      "policy remar",
    ]);
    expect(warnings.some((w) => w.includes("Member 3"))).toBe(true);
    expect(warnings.some((w) => w.includes("policy remar"))).toBe(true);
  });
});
