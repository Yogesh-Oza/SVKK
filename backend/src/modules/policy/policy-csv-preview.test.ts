import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildPolicyImportPreview,
  emptyPolicyPreviewSummary,
  evaluatePolicyPreviewRow,
  POLICY_PREVIEW_ROW_LIMIT,
} from "./policy-csv-preview.js";
import type { PolicyTypeCache } from "./policy-csv-resolve.js";
import { normalizeProductType } from "./policy-csv-resolve.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {},
}));

vi.mock("./policy-csv-import.js", () => ({
  processLegacyPolicyCsvRow: vi.fn(),
}));

vi.mock("./policy-csv-resolve.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./policy-csv-resolve.js")>();
  return {
    ...actual,
    resolvePolicyForCsvImport: vi.fn(),
  };
});

import { processLegacyPolicyCsvRow } from "./policy-csv-import.js";
import { resolvePolicyForCsvImport } from "./policy-csv-resolve.js";

function mockTypeCache(): PolicyTypeCache {
  const types = [{ id: "pt-1", key: "family_floater", name: "Family Floater" }];
  return {
    types,
    byKey: new Map(types.map((t) => [t.key, t])),
    byKeyNormalized: new Map(types.map((t) => [t.key, t])),
    byNameNormalized: new Map(types.map((t) => [normalizeProductType(t.name), t])),
    aliasToKey: new Map(),
    allowedLabels: () => "Family Floater",
    fuzzyMatch: () => [],
  };
}

const previewCtx = {
  userId: "user-1",
  permissions: new Set(["upload:csv"]),
  scope: { villages: [], areas: [] } as never,
  typeCache: mockTypeCache(),
  importMode: "CREATE_ONLY" as const,
};

const header = [
  "ref no",
  "SVKK ID",
  "policy no",
  "Holder name",
  "Village",
  "Product Type",
];
const row = ["REF-1", "SVKK-1", "PN-1", "Holder A", "Village A", "Family Floater"];

describe("policy-csv-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emptyPolicyPreviewSummary returns zeros", () => {
    expect(emptyPolicyPreviewSummary()).toEqual({
      totalRows: 0,
      ready: 0,
      alreadyExists: 0,
      errors: 0,
      conflicts: 0,
    });
  });

  it("evaluatePolicyPreviewRow marks EXISTS for CREATE_ONLY when policy matches", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: { id: "p1" } as never,
      matchedBy: "policyNo",
    });

    const result = await evaluatePolicyPreviewRow(header, row, 2, previewCtx);
    expect(result.status).toBe("EXISTS");
    expect(result.errorMessage).toMatch(/CREATE_ONLY/);
    expect(processLegacyPolicyCsvRow).not.toHaveBeenCalled();
  });

  it("evaluatePolicyPreviewRow marks CONFLICT when resolve returns conflict", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
      conflict: "Multiple policies match identifiers",
    });

    const result = await evaluatePolicyPreviewRow(header, row, 2, previewCtx);
    expect(result.status).toBe("CONFLICT");
    expect(result.errorMessage).toContain("Multiple policies");
  });

  it("evaluatePolicyPreviewRow marks READY after dry-run import succeeds", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
    });
    vi.mocked(processLegacyPolicyCsvRow).mockResolvedValue("created");

    const result = await evaluatePolicyPreviewRow(header, row, 2, previewCtx);
    expect(result.status).toBe("READY");
    expect(result.refNo).toBe("REF-1");
    expect(processLegacyPolicyCsvRow).toHaveBeenCalledWith(
      header,
      row,
      expect.objectContaining({ dryRun: true, importMode: "CREATE_ONLY" }),
    );
  });

  it("evaluatePolicyPreviewRow marks ERROR when dry-run throws", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
    });
    vi.mocked(processLegacyPolicyCsvRow).mockRejectedValue(new Error("Invalid Product Type"));

    const result = await evaluatePolicyPreviewRow(header, row, 2, previewCtx);
    expect(result.status).toBe("ERROR");
    expect(result.errorMessage).toBe("Invalid Product Type");
  });

  it("buildPolicyImportPreview caps previewRows at POLICY_PREVIEW_ROW_LIMIT", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
    });
    vi.mocked(processLegacyPolicyCsvRow).mockResolvedValue("created");

    const dataRows = Array.from({ length: POLICY_PREVIEW_ROW_LIMIT + 5 }, () => [...row]);
    const { previewRows, summary } = await buildPolicyImportPreview(header, dataRows, 2, previewCtx);

    expect(previewRows).toHaveLength(POLICY_PREVIEW_ROW_LIMIT);
    expect(summary.totalRows).toBe(POLICY_PREVIEW_ROW_LIMIT + 5);
    expect(summary.ready).toBe(POLICY_PREVIEW_ROW_LIMIT + 5);
  });
});
