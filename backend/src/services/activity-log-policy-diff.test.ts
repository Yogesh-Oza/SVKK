import { describe, expect, it } from "vitest";
import { computePolicyFieldChanges } from "./activity-log-policy-diff.js";

describe("computePolicyFieldChanges", () => {
  it("returns only changed scalar fields", () => {
    const changes = computePolicyFieldChanges(
      {
        policy: { village: "A", referenceNo: "REF-1", years: [{ yearLabel: "2026-27", sumInsured: 100000 }] },
        yearLabel: "2026-27",
      },
      {
        policy: {
          village: "B",
          referenceNo: "REF-1",
          policyUrl: '["https://example.com/doc"]',
          years: [{ yearLabel: "2026-27", sumInsured: 200000 }],
        },
        yearLabel: "2026-27",
      },
    );
    const labels = changes.map((c) => c.label);
    expect(labels).toContain("Village");
    expect(labels).toContain("Sum insured");
    expect(labels).toContain("Document link");
    expect(labels).not.toContain("Reference");
    expect(changes.find((c) => c.label === "Village")).toEqual({
      field: "policy.village",
      label: "Village",
      before: "A",
      after: "B",
    });
  });

  it("ignores unchanged version and timestamps", () => {
    const changes = computePolicyFieldChanges(
      { policy: { version: 4, updatedAt: "2026-05-13T06:47:29.744Z" } },
      { policy: { version: 5, updatedAt: "2026-05-13T06:47:44.544Z" } },
    );
    expect(changes).toHaveLength(0);
  });

  it("detects payment rows added on policy year", () => {
    const changes = computePolicyFieldChanges(
      {
        policy: {
          referenceNo: "OTHER2026NOV0001",
          years: [{ yearLabel: "2026-27", diffPaidByHolder: 3000 }],
        },
        yearLabel: "2026-27",
      },
      {
        policy: {
          referenceNo: "OTHER2026NOV0001",
          years: [
            {
              yearLabel: "2026-27",
              diffPaidByHolder: 3000,
              payments: [{ method: "CASH", amount: 3000, status: "PENDING" }],
              members: [],
            },
          ],
        },
        yearLabel: "2026-27",
      },
    );
    expect(changes.some((c) => c.label === "Payments")).toBe(true);
    expect(changes.find((c) => c.label === "Payments")?.after).toContain("CASH");
  });
});
