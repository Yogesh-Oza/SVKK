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

  it("formats email sent with recipient and template", () => {
    const s = formatActivityLogSummary({
      id: "4",
      module: "email",
      action: "EMAIL_SENT",
      entityType: "Policy",
      entityId: "p1",
      beforeData: null,
      afterData: {
        to: "holder@example.com",
        templateId: "mediclaim_new_policy_ack",
        holderName: "Ram Patil",
        policyNo: "AD-100",
      },
      createdAt: new Date(),
    });
    expect(s).toContain("Sent email");
    expect(s).toContain("holder@example.com");
    expect(s).toContain("Ram Patil");
  });

  it("formats email skipped with reason", () => {
    const s = formatActivityLogSummary({
      id: "5",
      module: "email",
      action: "EMAIL_SKIPPED",
      entityType: "Policy",
      entityId: "p1",
      beforeData: null,
      afterData: { reason: "no_recipient", subject: "Hello" },
      createdAt: new Date(),
    });
    expect(s).toContain("Email not sent");
    expect(s).toContain("no recipient");
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

  it("formats csv import from created/updated fields", () => {
    const s = formatActivityLogSummary({
      id: "3b",
      module: "upload",
      action: "CSV_IMPORTED",
      entityType: "CsvImportJob",
      entityId: "j2",
      beforeData: null,
      afterData: {
        created: 0,
        updated: 1576,
        fail: 0,
        importMode: "UPDATE_ONLY",
        fileName: "policy no udate.csv",
      },
      createdAt: new Date(),
    });
    expect(s).toContain("1576 ok");
    expect(s).toContain("0 failed");
    expect(s).toContain("update");
    expect(s).toContain("policy no udate.csv");
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

  it("includes csv import outcome details", () => {
    const d = formatActivityLogDetails({
      id: "2",
      module: "upload",
      action: "CSV_IMPORTED",
      entityType: "CsvImportJob",
      entityId: "j1",
      beforeData: null,
      afterData: {
        fileName: "policy no udate.csv",
        rowCount: 1576,
        created: 0,
        updated: 1576,
        fail: 0,
        importMode: "UPDATE_ONLY",
        updateMode: "FULL",
        durationMs: 62220,
      },
      createdAt: new Date(),
    });
    expect(d.some((line) => line.includes("policy no udate.csv"))).toBe(true);
    expect(d.some((line) => line.includes("Updated: 1576"))).toBe(true);
    expect(d.some((line) => line.includes("Rows: 1576"))).toBe(true);
  });
});
