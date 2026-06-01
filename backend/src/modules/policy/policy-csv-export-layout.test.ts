import { describe, expect, it } from "vitest";
import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import {
  buildPolicyCsvFlatExportHeaders,
  buildPolicyCsvHeadersForExport,
  flatMember1FieldHeaders,
  flatPayment1FieldHeaders,
  resolveExportSlotCounts,
} from "./policy-csv-export-layout.js";
import { memberSlotHeader, paymentSlotHeader } from "./policy-csv-slots.js";

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
  it("includes every flat column once in export order (1 member, 1 payment)", () => {
    const headers = buildPolicyCsvHeadersForExport(0, 0);
    expect(new Set(headers)).toEqual(new Set(POLICY_CSV_FLAT_HEADERS));
    expect(headers).toEqual(buildPolicyCsvFlatExportHeaders());
  });

  it("groups payments then members before nominee/address tail", () => {
    const headers = buildPolicyCsvHeadersForExport(2, 2);
    expect(headers.indexOf("mode of payment")).toBeLessThan(headers.indexOf("Gross premium"));
    expect(headers.indexOf(paymentSlotHeader(2, "amount"))).toBeLessThan(
      headers.indexOf("Gross premium"),
    );
    expect(headers.indexOf("Gross premium")).toBeLessThan(headers.indexOf("Member 1 Name"));
    expect(headers.indexOf("Member 1 Name")).toBeLessThan(headers.indexOf(memberSlotHeader(2, "Name")));
    expect(headers.indexOf(memberSlotHeader(2, "Name"))).toBeLessThan(headers.indexOf("nominee_name"));
    expect(headers.indexOf("url")).toBeGreaterThan(headers.indexOf(memberSlotHeader(2, "Name")));
    expect(headers).not.toContain(memberSlotHeader(3, "Name"));
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
