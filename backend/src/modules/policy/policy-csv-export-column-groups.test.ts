import { describe, expect, it } from "vitest";
import {
  allPolicyCsvExportHeaderKeys,
  allPolicyCsvExportUiKeys,
  buildPolicyCsvExportColumnGroups,
  expandExportColumnSelection,
  pickExportHeaders,
  sanitizeSelectedExportHeaders,
  serializePolicyCsvExportColumnGroups,
} from "./policy-csv-export-column-groups.js";

describe("policy CSV export column groups", () => {
  it("excludes commission columns without permission", () => {
    const groups = buildPolicyCsvExportColumnGroups({ includeCommission: false });
    const keys = allPolicyCsvExportHeaderKeys(groups);
    expect(keys).not.toContain("VKK commission");
    expect(keys).not.toContain("Commission amount");
  });

  it("includes commission columns with permission", () => {
    const groups = buildPolicyCsvExportColumnGroups({ includeCommission: true });
    const keys = allPolicyCsvExportHeaderKeys(groups);
    expect(keys).toContain("VKK commission");
    expect(keys).toContain("Commission amount");
  });

  it("shows each payment and member field once, expanding to every slot", () => {
    const groups = buildPolicyCsvExportColumnGroups();
    const payments = groups.find((g) => g.id === "payments");
    const members = groups.find((g) => g.id === "members");
    expect(payments?.columns.length).toBeGreaterThan(1);
    expect(members?.columns.length).toBeGreaterThan(1);
    expect(payments?.columns.map((c) => c.label)).not.toContain("Payment 1");
    expect(members?.columns.map((c) => c.label)).not.toContain("Member 2 Name");

    const mode = payments?.columns.find((c) => c.label === "Mode of Payment");
    expect(mode?.expandsTo).toContain("Payment 1 Mode of Payment");
    expect(mode?.expandsTo).toContain("Payment 8 Mode of Payment");

    const name = members?.columns.find((c) => c.label === "Name");
    expect(name?.expandsTo).toContain("Member 1 Name");
    expect(name?.expandsTo).toContain("Member 12 Name");
    expect(allPolicyCsvExportUiKeys(groups).length).toBeLessThan(100);
  });

  it("serializePolicyCsvExportColumnGroups omits expandsTo for the client", () => {
    const groups = buildPolicyCsvExportColumnGroups();
    const client = serializePolicyCsvExportColumnGroups(groups);
    const payments = client.find((g) => g.id === "payments");
    expect(payments?.columns[0]).toEqual({ key: expect.any(String), label: expect.any(String) });
    expect(payments?.columns[0]).not.toHaveProperty("expandsTo");
    expect(payments?.columns[0]).not.toHaveProperty("description");
  });

  it("expandExportColumnSelection maps field keys across all slots", () => {
    const groups = buildPolicyCsvExportColumnGroups();
    const expanded = expandExportColumnSelection(groups, ["payments:method", "SVKK ID"]);
    expect(expanded).toContain("SVKK ID");
    expect(expanded).toContain("Payment 1 Mode of Payment");
    expect(expanded).toContain("Payment 4 Mode of Payment");
    expect(expanded).not.toContain("payments:method");
  });

  it("pickExportHeaders preserves layout order", () => {
    const layout = ["a", "b", "c", "d"];
    expect(pickExportHeaders(layout, ["d", "b"])).toEqual(["b", "d"]);
    expect(pickExportHeaders(layout, [])).toEqual(layout);
    expect(pickExportHeaders(layout, null)).toEqual(layout);
  });

  it("sanitizeSelectedExportHeaders removes commission keys", () => {
    const selected = ["Gross premium", "VKK commission", "policy no"];
    expect(sanitizeSelectedExportHeaders(selected, false)).toEqual(["Gross premium", "policy no"]);
  });
});
