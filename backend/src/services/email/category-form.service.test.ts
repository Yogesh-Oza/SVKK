import { describe, expect, it } from "vitest";
import {
  isEmailableHolderEmail,
  renderCategoryFormDraft,
  CATEGORY_FORM_VARIABLES,
} from "./category-form.service.js";

describe("category-form.service", () => {
  it("exposes expected template variables", () => {
    expect(CATEGORY_FORM_VARIABLES).toContain("holderName");
    expect(CATEGORY_FORM_VARIABLES).toContain("policyNo");
    expect(CATEGORY_FORM_VARIABLES).toContain("policyDocumentLink");
  });

  it("renders placeholders in subject and body", () => {
    const rendered = renderCategoryFormDraft(
      "Form for {{policyNo}}",
      "<p>Hello {{holderName}}</p>",
      { holderName: "Asha", policyNo: "PO-1" },
    );
    expect(rendered.subject).toBe("Form for PO-1");
    expect(rendered.html).toContain("Hello Asha");
    expect(rendered.html).toContain("TEAM MEDICLAIM");
  });

  it("accepts valid holder emails", () => {
    expect(isEmailableHolderEmail("holder@example.com")).toBe(true);
  });

  it("rejects import placeholder emails", () => {
    expect(isEmailableHolderEmail("9999999999@import.svkk.local")).toBe(false);
  });

  it("rejects blank or invalid emails", () => {
    expect(isEmailableHolderEmail("")).toBe(false);
    expect(isEmailableHolderEmail(null)).toBe(false);
    expect(isEmailableHolderEmail("not-an-email")).toBe(false);
  });
});
