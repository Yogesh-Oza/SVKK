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
});
