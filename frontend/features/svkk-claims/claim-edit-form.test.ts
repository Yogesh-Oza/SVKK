import { describe, expect, it } from "vitest";
import {
  claimDetailToForm,
  emptyClaimEditForm,
  formToClaimPatch,
  mergeEmptyClaimFieldsFromPolicy,
} from "./claim-edit-form";
import type { ClaimDetail } from "./claim-detail-types";

describe("formToClaimPatch", () => {
  it("round-trips policy number and grouping snapshots", () => {
    const form = emptyClaimEditForm();
    form.svkkPublicId = "SVKK1";
    form.policyYear = "2025-26";
    form.policyNoText = "MDI123";
    form.policyGroupingText = "Group A";
    const parsed = formToClaimPatch(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body.policyNoText).toBe("MDI123");
    expect(parsed.body.policyGroupingText).toBe("Group A");
  });

  it("serializes empty snapshots as null", () => {
    const parsed = formToClaimPatch(emptyClaimEditForm());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body.policyNoText).toBeNull();
    expect(parsed.body.policyGroupingText).toBeNull();
  });

  it("rejects over-long policy snapshot text", () => {
    const form = emptyClaimEditForm();
    form.policyNoText = "x".repeat(121);
    const parsed = formToClaimPatch(form);
    expect(parsed.ok).toBe(false);
  });

  it("fills default status text only when statusText is empty", () => {
    const emptyText = emptyClaimEditForm();
    emptyText.status = "APPROVED";
    const withDefault = formToClaimPatch(emptyText);
    expect(withDefault.ok).toBe(true);
    if (withDefault.ok) expect(withDefault.body.statusText).toBe("APPROVED");

    const custom = emptyClaimEditForm();
    custom.status = "APPROVED";
    custom.statusText = "Paid";
    const withCustom = formToClaimPatch(custom);
    expect(withCustom.ok).toBe(true);
    if (withCustom.ok) expect(withCustom.body.statusText).toBe("Paid");
  });
});

describe("claimDetailToForm", () => {
  it("maps snapshot fields from detail", () => {
    const detail: ClaimDetail = {
      id: "c1",
      claimNo: "CCN-1",
      svkkPublicId: "SVKK1",
      policyYear: "2025-26",
      status: "PENDING",
      policyNoText: "PO-99",
      policyGroupingText: "RTY",
    };
    const form = claimDetailToForm(detail);
    expect(form.policyNoText).toBe("PO-99");
    expect(form.policyGroupingText).toBe("RTY");
  });

  it("maps all view fields for a payment row", () => {
    const detail: ClaimDetail = {
      id: "c1",
      claimNo: "MDI9918783",
      svkkPublicId: "SVKK1",
      policyYear: "2024-25",
      status: "APPROVED",
      statusText: "Paid",
      patientName: "Patient A",
      hospitalName: "City Hospital",
      illness: "Fever",
      claimAmount: "31206",
      approvedAmount: "31206",
      claimType: "Additional Payment",
      actualLodgeType: "Cash Less",
      paymentDetails: "AXISCN1168346615",
    };
    const form = claimDetailToForm(detail);
    expect(form.patientName).toBe("Patient A");
    expect(form.hospitalName).toBe("City Hospital");
    expect(form.illness).toBe("Fever");
    expect(form.claimAmount).toBe("31206");
    expect(form.approvedAmount).toBe("31206");
    expect(form.claimType).toBe("Additional Payment");
    expect(form.paymentDetails).toBe("AXISCN1168346615");
  });
});

describe("mergeEmptyClaimFieldsFromPolicy", () => {
  it("fills blank SVKK and numeric village from the matched policy", () => {
    const form = emptyClaimEditForm();
    form.village = "72624";
    const next = mergeEmptyClaimFieldsFromPolicy(form, {
      svkkPublicId: "RTYJAN0038",
      village: "Bhachau",
      policyYear: "2024-25",
    });
    expect(next.svkkPublicId).toBe("RTYJAN0038");
    expect(next.village).toBe("Bhachau");
    expect(next.policyYear).toBe("2024-25");
  });

  it("does not overwrite an SVKK ID the user already typed", () => {
    const form = emptyClaimEditForm();
    form.svkkPublicId = "CUSTOM";
    const next = mergeEmptyClaimFieldsFromPolicy(form, { svkkPublicId: "RTYJAN0038" });
    expect(next.svkkPublicId).toBe("CUSTOM");
  });
});
