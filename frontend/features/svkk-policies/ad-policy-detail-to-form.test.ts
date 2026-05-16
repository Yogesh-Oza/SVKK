import { describe, expect, it } from "vitest";
import { monthFromReferenceNo } from "./ad-policy-detail-to-form";
import { resolveAdProductFormValue } from "./ad-product-variant";

describe("monthFromReferenceNo", () => {
  it("parses JAN from NVKK reference", () => {
    expect(monthFromReferenceNo("NVKK2026JAN0003")).toBe("January");
  });
});

describe("resolveAdProductFormValue", () => {
  it("maps ASHA_KIRAN variant to Asha-Kiran", () => {
    expect(resolveAdProductFormValue("ASHA_KIRAN", "AD Policy", "ad_policy")).toBe("Asha-Kiran");
  });
});
