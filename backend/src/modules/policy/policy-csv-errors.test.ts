import { describe, expect, it } from "vitest";
import { buildErrorReportCsv } from "./policy-csv-errors.js";
import { parseCsv } from "./policy-csv-parse.js";

describe("policy-csv-errors", () => {
  it("builds error report CSV with header", () => {
    const csv = buildErrorReportCsv([
      { row: 15, error: "Invalid Product Type", svkkId: "SVKK1" },
      { row: 22, error: "Policy not found", policyNo: "PN-99" },
    ]);
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    expect(rows[0]).toEqual(["Row", "Error", "SVKK ID", "Policy No", "Ref No"]);
    expect(rows[1]?.[0]).toBe("15");
    expect(rows[1]?.[1]).toBe("Invalid Product Type");
  });
});
