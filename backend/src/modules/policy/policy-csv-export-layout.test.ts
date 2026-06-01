import { describe, expect, it } from "vitest";
import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import {
  buildPolicyCsvHeadersForExport,
  flatMember1FieldHeaders,
  flatPayment1FieldHeaders,
  resolveExportSlotCounts,
} from "./policy-csv-export-layout.js";
import { memberSlotHeader } from "./policy-csv-slots.js";

describe("resolveExportSlotCounts", () => {
  it("uses batch max members and payments", () => {
    const counts = resolveExportSlotCounts([
      { members: [{}, {}], payments: [{}] },
      { members: [{}, {}, {}], payments: [] },
    ]);
    expect(counts).toEqual({ maxMembers: 3, maxPayments: 1 });
  });

  it("uses at least one member and one payment slot when data is empty", () => {
    expect(resolveExportSlotCounts([{ members: [], payments: [] }])).toEqual({
      maxMembers: 1,
      maxPayments: 1,
    });
  });
});

describe("buildPolicyCsvHeadersForExport", () => {
  it("includes the full flat template when counts are zero (blank member/payment slots)", () => {
    const headers = buildPolicyCsvHeadersForExport(0, 0);
    expect(headers).toEqual([...POLICY_CSV_FLAT_HEADERS]);
  });

  it("matches flat column order and appends member 2 only when needed", () => {
    const headers = buildPolicyCsvHeadersForExport(2, 1);
    expect(headers.slice(0, POLICY_CSV_FLAT_HEADERS.length)).toEqual([
      ...POLICY_CSV_FLAT_HEADERS,
    ]);
    expect(headers).toContain(memberSlotHeader(2, "Name"));
    expect(headers).not.toContain(memberSlotHeader(3, "Name"));
    expect(headers).not.toContain("Payment 2 amount");
    expect(headers.indexOf("url")).toBeLessThan(headers.indexOf(memberSlotHeader(2, "Name")));
  });

  it("adds payment 2 columns only when maxPayments >= 2", () => {
    const one = buildPolicyCsvHeadersForExport(1, 1);
    const two = buildPolicyCsvHeadersForExport(1, 2);
    expect(one).not.toContain("Payment 2 amount");
    expect(two).toContain("Payment 2 amount");
    expect(two).not.toContain("Payment 3 amount");
  });

  it("flat member1 and payment1 blocks match layout slices", () => {
    const full = buildPolicyCsvHeadersForExport(12, 8);
    for (const h of flatMember1FieldHeaders()) {
      expect(full).toContain(h);
    }
    for (const h of flatPayment1FieldHeaders()) {
      expect(full).toContain(h);
    }
  });
});
