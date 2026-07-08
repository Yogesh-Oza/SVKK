import { describe, expect, it } from "vitest";
import { ClaimStatus } from "@prisma/client";
import { claimUpdateBodySchema } from "./claim-update.schema.js";

describe("claimUpdateBodySchema", () => {
  it("parses status and amounts", () => {
    const out = claimUpdateBodySchema.parse({
      status: ClaimStatus.APPROVED,
      approvedAmount: 1000,
      claimAmount: 1500,
    });
    expect(out.status).toBe(ClaimStatus.APPROVED);
    expect(out.approvedAmount).toBe(1000);
  });

  it("parses DD-MM-YYYY dates to UTC midnight", () => {
    const out = claimUpdateBodySchema.parse({ claimReceivedDate: "15-03-2025" });
    expect(out.claimReceivedDate?.toISOString()).toBe("2025-03-15T00:00:00.000Z");
  });

  it("parses hospital PPN yes/no", () => {
    expect(claimUpdateBodySchema.parse({ hospitalInPpn: "Y" }).hospitalInPpn).toBe(true);
    expect(claimUpdateBodySchema.parse({ hospitalInPpn: "N" }).hospitalInPpn).toBe(false);
  });

  it("accepts the field-software columns", () => {
    const out = claimUpdateBodySchema.parse({
      mdId: "MD-42",
      categoryText: "A",
      actualLodgeType: "Non Cash Less",
      treatmentType: "Surgical",
      treatmentProcedure: "Appendectomy",
      diseaseCategory: "General Surgery",
      reportedLodgeAmount: 5000,
      discountAmount: 250,
      remark: "verified by field team",
      paymentInFavourOf: "City Hospital",
    });
    expect(out.actualLodgeType).toBe("Non Cash Less");
    expect(out.reportedLodgeAmount).toBe(5000);
    expect(out.discountAmount).toBe(250);
    expect(out.paymentInFavourOf).toBe("City Hospital");
  });

  it("parses the new date fields to UTC midnight", () => {
    const out = claimUpdateBodySchema.parse({
      lodgeDate: "1/22/25",
      paymentDate: "15-03-2025",
      prsCrsDate: "2025-04-01",
    });
    expect(out.lodgeDate?.toISOString()).toBe("2025-01-22T00:00:00.000Z");
    expect(out.paymentDate?.toISOString()).toBe("2025-03-15T00:00:00.000Z");
    expect(out.prsCrsDate?.toISOString()).toBe("2025-04-01T00:00:00.000Z");
  });

  it("rejects negative amounts and over-long text", () => {
    expect(() => claimUpdateBodySchema.parse({ discountAmount: -1 })).toThrow();
    expect(() => claimUpdateBodySchema.parse({ mdId: "x".repeat(101) })).toThrow();
  });
});
