import { describe, expect, it } from "vitest";
import { formatGenderForCsvExport, resolveHolderJoiningYearForExport } from "./policy-csv-export-fill.js";
import type { PolicyExportRow } from "./policy.export-csv.js";

describe("policy-csv-export-fill", () => {
  it("maps gender codes to profile labels", () => {
    expect(formatGenderForCsvExport("O")).toBe("Other");
    expect(formatGenderForCsvExport("M")).toBe("Male");
  });

  it("uses holder joining date year when holderJoiningYear is empty", () => {
    const row = {
      holderJoiningDate: new Date("2018-11-02T00:00:00.000Z"),
    } as PolicyExportRow;
    expect(resolveHolderJoiningYearForExport(row, undefined)).toBe("2018");
    expect(
      resolveHolderJoiningYearForExport(row, {
        holderJoiningYear: "2019-20",
      } as PolicyExportRow["years"][number]),
    ).toBe("2019-20");
  });
});
