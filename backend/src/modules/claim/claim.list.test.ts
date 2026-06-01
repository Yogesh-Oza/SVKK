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
});
