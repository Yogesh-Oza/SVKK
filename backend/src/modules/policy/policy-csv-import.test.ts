import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  processLegacyPolicyCsvRow,
  validateLegacyPolicyCsvRow,
} from "./policy-csv-import.js";
import type { PolicyTypeCache } from "./policy-csv-resolve.js";
import { normalizeProductType } from "./policy-csv-resolve.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("./policy-csv-create.js", () => ({
  validateCreateRequiredFields: vi.fn(),
  createPolicyFromCsvRow: vi.fn(),
}));

vi.mock("./policy-csv-resolve.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./policy-csv-resolve.js")>();
  return {
    ...actual,
    resolvePolicyForCsvImport: vi.fn(),
    resolvePolicyForCsvUpdate: vi.fn(),
  };
});

import { resolvePolicyForCsvImport, resolvePolicyForCsvUpdate } from "./policy-csv-resolve.js";
import { validateCreateRequiredFields } from "./policy-csv-create.js";

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

const baseCtx = {
  userId: "user-1",
  permissions: new Set(["upload:csv", "policy:create", "policy:update"]),
  scope: { villages: [], areas: [] } as never,
  typeCache: mockTypeCache(),
};

const testHeader = [
  "ref no",
  "SVKK ID",
  "policy no",
  "Holder name",
  "Village",
  "Product Type",
  "Sum insured",
  "year",
  "month",
  "grouping",
  "Primary Mobile Number",
];
const testRow = [
  "REF-CSV-1",
  "SVKK-CSV-1",
  "PN-CSV-1",
  "Test Holder",
  "Test Village",
  "Family Floater",
  "500000",
  "2026-27",
  "May",
  "A",
  "9876543210",
];

describe("policy-csv-import IMPORT_MODE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("UPDATE_ONLY throws when policy not found", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
    });
    await expect(
      processLegacyPolicyCsvRow(testHeader, testRow, { ...baseCtx, importMode: "UPDATE_ONLY" }),
    ).rejects.toThrow(/UPDATE_ONLY/);
  });

  it("CREATE_ONLY throws when policy exists", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: { id: "p1" } as never,
      matchedBy: "svkkId",
    });
    await expect(
      processLegacyPolicyCsvRow(testHeader, testRow, {
        ...baseCtx,
        importMode: "CREATE_ONLY",
      }),
    ).rejects.toThrow(/CREATE_ONLY/);
  });

  it("dry-run UPSERT returns created when no match", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: null,
      matchedBy: null,
    });
    const result = await processLegacyPolicyCsvRow(testHeader, testRow, {
      ...baseCtx,
      importMode: "UPSERT",
      dryRun: true,
    });
    expect(result).toBe("created");
    expect(validateCreateRequiredFields).toHaveBeenCalled();
  });

  it("dry-run returns updated when match found", async () => {
    vi.mocked(resolvePolicyForCsvImport).mockResolvedValue({
      match: { id: "p1" } as never,
      matchedBy: "policyNo",
    });
    const result = await processLegacyPolicyCsvRow(testHeader, testRow, {
      ...baseCtx,
      importMode: "UPSERT",
      dryRun: true,
    });
    expect(result).toBe("updated");
  });

  it("validateLegacyPolicyCsvRow requires ref no for UPDATE_ONLY", () => {
    const header = ["year", "month"];
    const row = ["2026-27", "May"];
    expect(() => validateLegacyPolicyCsvRow(header, row, "UPDATE_ONLY")).toThrow(
      /ref no is required for policy update/,
    );
  });

  const updateHeader = ["ref no", "policy no", "Policy start", "Courier Status"];
  const updateRow = ["REF-UPD-1", "PN-NEW", "01-04-2026", "YES"];

  it("FULL dry-run returns updated when policy found by ref no", async () => {
    vi.mocked(resolvePolicyForCsvUpdate).mockResolvedValue({
      match: { id: "p1" } as never,
    });
    const result = await processLegacyPolicyCsvRow(updateHeader, updateRow, {
      ...baseCtx,
      importMode: "UPDATE_ONLY",
      updateMode: "FULL",
      dryRun: true,
    });
    expect(result).toBe("updated");
    expect(resolvePolicyForCsvImport).not.toHaveBeenCalled();
  });

  it("FULL throws when policy not found for ref no", async () => {
    vi.mocked(resolvePolicyForCsvUpdate).mockResolvedValue({ match: null });
    await expect(
      processLegacyPolicyCsvRow(updateHeader, updateRow, {
        ...baseCtx,
        importMode: "UPDATE_ONLY",
        updateMode: "FULL",
        dryRun: true,
      }),
    ).rejects.toThrow(/ref no=REF-UPD-1/);
  });

  it("FULL requires ref no", async () => {
    await expect(
      processLegacyPolicyCsvRow(["policy no"], ["PN-1"], {
        ...baseCtx,
        importMode: "UPDATE_ONLY",
        updateMode: "FULL",
        dryRun: true,
      }),
    ).rejects.toThrow(/ref no is required/);
  });

  it("POLICY_COURIER dry-run returns updated when policy found by ref no", async () => {
    vi.mocked(resolvePolicyForCsvUpdate).mockResolvedValue({
      match: { id: "p1" } as never,
    });
    const result = await processLegacyPolicyCsvRow(updateHeader, updateRow, {
      ...baseCtx,
      importMode: "UPDATE_ONLY",
      updateMode: "POLICY_COURIER",
      dryRun: true,
    });
    expect(result).toBe("updated");
    expect(resolvePolicyForCsvImport).not.toHaveBeenCalled();
  });

  it("POLICY_COURIER throws when policy not found for ref no", async () => {
    vi.mocked(resolvePolicyForCsvUpdate).mockResolvedValue({ match: null });
    await expect(
      processLegacyPolicyCsvRow(updateHeader, updateRow, {
        ...baseCtx,
        importMode: "UPDATE_ONLY",
        updateMode: "POLICY_COURIER",
        dryRun: true,
      }),
    ).rejects.toThrow(/ref no=REF-UPD-1/);
  });

  it("POLICY_COURIER requires ref no", async () => {
    await expect(
      processLegacyPolicyCsvRow(["policy no"], ["PN-1"], {
        ...baseCtx,
        importMode: "UPDATE_ONLY",
        updateMode: "POLICY_COURIER",
        dryRun: true,
      }),
    ).rejects.toThrow(/ref no is required/);
  });
});
