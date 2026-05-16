import { describe, expect, it } from "vitest";
import { formatActivityLogDetails, formatActivityLogSummary } from "./activity-log-format.js";

describe("formatActivityLogSummary", () => {
  it("formats policy created with context", () => {
    const s = formatActivityLogSummary({
      id: "1",
      module: "policy",
      action: "POLICY_CREATED",
      entityType: "Policy",
      entityId: "p1",
      beforeData: null,
      afterData: {
        policyNo: "AD-100",
        holderName: "Ram Patil",
        village: "Kolhapur",
        yearLabel: "2024-25",
      },
      createdAt: new Date(),
    });
    expect(s).toContain("Created policy");
    expect(s).toContain("AD-100");
    expect(s).toContain("Ram Patil");
  });

  it("formats policy updated with changed fields", () => {
    const s = formatActivityLogSummary({
      id: "2",
      module: "policy",
      action: "POLICY_UPDATED",
      entityType: "Policy",
      entityId: "p1",
      beforeData: { policy: { village: "A", policyNo: "X" } },
      afterData: { policy: { village: "B", policyNo: "X" }, yearLabel: "2024-25" },
      createdAt: new Date(),
    });
    expect(s).toContain("Updated policy");
    expect(s).toContain("village");
  });

  it("formats csv import counts", () => {
    const s = formatActivityLogSummary({
      id: "3",
      module: "upload",
      action: "CSV_IMPORTED",
      entityType: "CsvImportJob",
      entityId: "j1",
      beforeData: null,
      afterData: { success: 10, fail: 2 },
      createdAt: new Date(),
    });
    expect(s).toContain("10 ok");
    expect(s).toContain("2 failed");
  });
});

describe("formatActivityLogDetails", () => {
  it("includes business reference instead of cuid", () => {
    const d = formatActivityLogDetails({
      id: "1",
      module: "policy",
      action: "POLICY_CREATED",
      entityType: "Policy",
      entityId: "p1",
      beforeData: null,
      afterData: { referenceNo: "NVKK2025JAN0003", policyNo: "PO-1" },
      createdAt: new Date(),
    });
    expect(d.some((line) => line.includes("NVKK2025JAN0003"))).toBe(true);
    expect(d.some((line) => line.includes("p1"))).toBe(false);
  });
});
