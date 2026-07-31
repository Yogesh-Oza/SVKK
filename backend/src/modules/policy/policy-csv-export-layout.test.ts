import { describe, expect, it } from "vitest";
import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import {
  buildPolicyCsvFlatExportHeaders,
  buildPolicyCsvHeadersForExport,
  buildPolicyCsvImportTemplateHeaders,
  buildPolicyCsvSampleHeaders,
  flatMember1FieldHeaders,
  resolveExportSlotCounts,
} from "./policy-csv-export-layout.js";
import { paymentCsvHeader } from "./policy-csv-payment-columns.js";
import {
  memberSlotHeader,
  POLICY_CSV_SAMPLE_MEMBER_SLOTS,
  POLICY_CSV_SAMPLE_PAYMENT_SLOTS,
} from "./policy-csv-slots.js";

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
  it("includes every flat column in export headers (1 member, 1 payment default)", () => {
    const headers = buildPolicyCsvHeadersForExport(0, 0);
    for (const h of POLICY_CSV_FLAT_HEADERS) {
      expect(headers).toContain(h);
    }
    expect(headers).toEqual(buildPolicyCsvFlatExportHeaders());
    expect(headers).toContain(paymentCsvHeader(1, "method"));
  });

  it("groups payments then members before nominee/address tail", () => {
    const headers = buildPolicyCsvHeadersForExport(2, 2);
    expect(headers.indexOf(paymentCsvHeader(1, "method"))).toBeLessThan(
      headers.indexOf("Gross premium"),
    );
    expect(headers.indexOf(paymentCsvHeader(2, "method"))).toBeLessThan(
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
    expect(one).not.toContain(paymentCsvHeader(2, "method"));
    expect(two).toContain(paymentCsvHeader(2, "method"));
    expect(two).not.toContain(paymentCsvHeader(3, "method"));
  });

  it("flat member1 block matches layout slice", () => {
    const full = buildPolicyCsvHeadersForExport(12, 8);
    for (const h of flatMember1FieldHeaders()) {
      expect(full).toContain(h);
    }
  });
});

describe("buildPolicyCsvSampleHeaders", () => {
  it("matches import template and includes all payment field types", () => {
    const sample = buildPolicyCsvSampleHeaders();
    const importTemplate = buildPolicyCsvImportTemplateHeaders(
      POLICY_CSV_SAMPLE_MEMBER_SLOTS,
      POLICY_CSV_SAMPLE_PAYMENT_SLOTS,
    );
    expect(sample).toEqual(importTemplate);
    for (const h of POLICY_CSV_FLAT_HEADERS) {
      expect(sample).toContain(h);
    }
    expect(sample).toContain(paymentCsvHeader(1, "bankName"));
    expect(sample).toContain(paymentCsvHeader(1, "mobileNumber"));
    expect(sample).not.toContain(paymentCsvHeader(2, "method"));
    expect(sample).not.toContain(memberSlotHeader(2, "Name"));
  });
});
