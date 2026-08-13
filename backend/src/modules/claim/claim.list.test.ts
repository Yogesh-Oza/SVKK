import { describe, expect, it } from "vitest";
import { buildClaimListWhere } from "./claim.list.js";

describe("buildClaimListWhere received-date filter", () => {
  const fullScope = { kind: "full" as const };

  it("does not filter claimReceivedDate when date range omitted", () => {
    const where = buildClaimListWhere(fullScope, {});
    expect(JSON.stringify(where)).not.toContain("claimReceivedDate");
  });

  it("filters claimReceivedDate when dateTo is set", () => {
    const where = buildClaimListWhere(fullScope, { dateTo: "2026-06-01" });
    expect(JSON.stringify(where)).toContain("claimReceivedDate");
  });

  it("category filter matches categoryText or policy category", () => {
    const where = buildClaimListWhere(fullScope, { categoryKeys: ["A"] });
    expect(JSON.stringify(where)).toContain("categoryText");
  });

  it("search includes mdId, insuranceCompany, and policyNoText", () => {
    const where = buildClaimListWhere(fullScope, { search: "MD-1" });
    const s = JSON.stringify(where);
    expect(s).toContain("mdId");
    expect(s).toContain("insuranceCompany");
    expect(s).toContain("policyNoText");
  });

  it("policyId-only filter does not OR svkkPublicId", () => {
    const where = buildClaimListWhere(fullScope, { policyId: "pol-1" });
    const s = JSON.stringify(where);
    expect(s).toContain("pol-1");
    expect(s).not.toContain("OR");
  });
});
