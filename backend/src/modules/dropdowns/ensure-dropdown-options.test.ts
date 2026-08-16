import { describe, expect, it, vi, beforeEach } from "vitest";
import { DropdownType } from "@prisma/client";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    dropdownOption: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma.js";
import {
  dropdownOptionSlug,
  ensureDropdownOptions,
  ensureGeoDropdowns,
  backfillGeoDropdownsFromRecords,
  parseDropdownImportLabel,
} from "./ensure-dropdown-options.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("parseDropdownImportLabel", () => {
  it("trims, drops trailing commas, and skips placeholders", () => {
    expect(parseDropdownImportLabel("  Bharudia  ")).toBe("Bharudia");
    expect(parseDropdownImportLabel("Mumbai,")).toBe("Mumbai");
    expect(parseDropdownImportLabel("NA")).toBeNull();
    expect(parseDropdownImportLabel("-")).toBeNull();
    expect(parseDropdownImportLabel("")).toBeNull();
    expect(parseDropdownImportLabel(null)).toBeNull();
  });
});

describe("dropdownOptionSlug", () => {
  it("matches existing admin values like bhachau", () => {
    expect(dropdownOptionSlug("Bhachau")).toBe("bhachau");
    expect(dropdownOptionSlug("C.P. Tank")).toBe("cptank");
    expect(dropdownOptionSlug("Mumbai,")).toBe("mumbai");
  });
});

describe("ensureDropdownOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.dropdownOption.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.dropdownOption.createMany).mockResolvedValue({ count: 0 });
  });

  it("creates villages that are not in the master list", async () => {
    vi.mocked(prisma.dropdownOption.findMany).mockResolvedValue([
      { id: "1", type: DropdownType.VILLAGE, value: "bhachau", label: "Bhachau", isActive: true },
    ] as never);

    const result = await ensureDropdownOptions(DropdownType.VILLAGE, [
      "Bhachau",
      "Bharudia",
      "Kharoi",
      "NA",
      "Bharudia",
    ]);

    expect(result.created).toBe(2);
    expect(result.reused).toBe(1);
    expect(prisma.dropdownOption.createMany).toHaveBeenCalledWith({
      data: [
        {
          type: DropdownType.VILLAGE,
          value: "bharudia",
          label: "Bharudia",
          sortOrder: 0,
          isActive: true,
          isSystem: false,
        },
        {
          type: DropdownType.VILLAGE,
          value: "kharoi",
          label: "Kharoi",
          sortOrder: 0,
          isActive: true,
          isSystem: false,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("reactivates an inactive match instead of inserting a duplicate", async () => {
    vi.mocked(prisma.dropdownOption.findMany).mockResolvedValue([
      { id: "v1", type: DropdownType.VILLAGE, value: "rav", label: "Rav", isActive: false },
    ] as never);

    const result = await ensureDropdownOptions(DropdownType.VILLAGE, ["Rav"]);
    expect(result.created).toBe(0);
    expect(result.reused).toBe(1);
    expect(prisma.dropdownOption.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1"] } },
      data: { isActive: true },
    });
    expect(prisma.dropdownOption.createMany).not.toHaveBeenCalled();
  });
});

describe("CSV import geo sync query budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.dropdownOption.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dropdownOption.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.dropdownOption.createMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  });

  it("loads dropdowns once for 5,000 CSV labels (not once per row)", async () => {
    const labels = Array.from({ length: 5000 }, (_, i) => `Village-${i % 40}`);
    await ensureGeoDropdowns({
      villages: labels,
      areas: labels.map((v) => `Area-${v}`),
      cities: ["Mumbai", "Thane", "Mumbai"],
    });

    expect(prisma.dropdownOption.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dropdownOption.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.dropdownOption.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("post-import backfill uses five DISTINCT queries plus one dropdown load", async () => {
    await backfillGeoDropdownsFromRecords();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    expect(prisma.dropdownOption.findMany).toHaveBeenCalledTimes(0);
  });

  it("post-import backfill then inserts missing values in one bulk create", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ value: "Bharudia" }])
      .mockResolvedValueOnce([{ value: "Bhachau" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ value: "Kharoi" }])
      .mockResolvedValueOnce([{ value: "Mumbai" }]);
    vi.mocked(prisma.dropdownOption.findMany).mockResolvedValue([
      { id: "1", type: DropdownType.AREA, value: "bhachau", label: "Bhachau", isActive: true },
    ] as never);

    await backfillGeoDropdownsFromRecords();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
    expect(prisma.dropdownOption.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dropdownOption.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("row import modules do not sync dropdowns", () => {
  it("claim row import has no dropdown queries", () => {
    const src = readFileSync(join(here, "../claim/claim-csv-import.ts"), "utf8");
    expect(src).not.toMatch(/ensureGeoDropdowns|ensureDropdownOptions|dropdownOption/);
  });

  it("policy CSV create path does not sync dropdowns per row", () => {
    const createSrc = readFileSync(join(here, "../policy/policy-csv-create.ts"), "utf8");
    const serviceSrc = readFileSync(join(here, "../policy/policy.service.ts"), "utf8");
    const createFn = serviceSrc.slice(
      serviceSrc.indexOf("export async function createPolicyWithYear"),
      serviceSrc.indexOf("export async function updatePolicySections"),
    );
    expect(createSrc).not.toMatch(/ensureGeoDropdowns|ensureDropdownOptions/);
    expect(createFn).not.toMatch(/ensureGeoDropdowns|ensureDropdownOptions/);
  });
});
