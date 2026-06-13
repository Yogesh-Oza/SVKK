import { describe, expect, it } from "vitest";
import {
  hasPolicyCourierUpdateFields,
  describePolicyCourierUpdateFields,
  listPolicyCourierUpdateFieldValues,
  validatePolicyCourierUpdateRow,
} from "./policy-csv-update-scope.js";
import { rowToHeaderMap } from "./policy-csv-parse.js";
import {
  buildPolicyCourierUpdateSample,
  buildPolicyCourierUpdateSampleHeaders,
  isPolicyCourierUpdateCsvFormat,
} from "./policy-csv-format.js";
import { parseCsv } from "./policy-csv-parse.js";

describe("policy-csv-update-scope", () => {
  it("requires ref no and at least one updatable field", () => {
    const header = ["ref no", "policy no"];
    const map = rowToHeaderMap(header, ["REF-1", ""]);
    expect(() => validatePolicyCourierUpdateRow(map)).toThrow(/At least one updatable field/);

    const validMap = rowToHeaderMap(header, ["REF-1", "PN-NEW"]);
    expect(() => validatePolicyCourierUpdateRow(validMap)).not.toThrow();
  });

  it("detects courier fields as updatable", () => {
    const map = rowToHeaderMap(["ref no", "Courier Status"], ["REF-1", "YES"]);
    expect(hasPolicyCourierUpdateFields(map)).toBe(true);
  });

  it("describes fields to update", () => {
    const map = rowToHeaderMap(
      ["ref no", "policy no", "Policy start", "Courier Status"],
      ["REF-1", "PN-NEW", "01-04-2026", "YES"],
    );
    expect(describePolicyCourierUpdateFields(map)).toBe(
      "policy no = PN-NEW; Policy start = 01-04-2026; Courier Status = YES",
    );
  });

  it("lists field values for preview", () => {
    const map = rowToHeaderMap(
      ["ref no", "policy no", "pod"],
      ["REF-1", "PN-NEW", "POD-99"],
    );
    expect(listPolicyCourierUpdateFieldValues(map)).toEqual([
      { field: "policy no", value: "PN-NEW" },
      { field: "pod", value: "POD-99" },
    ]);
  });
});

describe("policy courier update sample CSV", () => {
  it("uses export-aligned headers", () => {
    const headers = buildPolicyCourierUpdateSampleHeaders();
    expect(headers).toContain("ref no");
    expect(headers).toContain("policy no");
    expect(headers).toContain("Policy start");
    expect(headers).toContain("Policy end");
    expect(headers).toContain("Courier Status");
    expect(headers).toContain("courier_date");
    expect(headers).toContain("pod");
    expect(isPolicyCourierUpdateCsvFormat(headers)).toBe(true);
  });

  it("builds a valid one-row sample", () => {
    const rows = parseCsv(buildPolicyCourierUpdateSample());
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(isPolicyCourierUpdateCsvFormat(rows[0]!)).toBe(true);
    expect(rows[1]![0]).toBe("REF-DEMO-001");
  });
});
