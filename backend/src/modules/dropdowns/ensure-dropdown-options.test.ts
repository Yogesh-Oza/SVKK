import { describe, expect, it, vi, beforeEach } from "vitest";
import { DropdownType } from "@prisma/client";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    dropdownOption: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma.js";
import {
  dropdownOptionSlug,
  ensureDropdownOptions,
  parseDropdownImportLabel,
} from "./ensure-dropdown-options.js";

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
      { id: "1", value: "bhachau", label: "Bhachau", isActive: true },
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
      { id: "v1", value: "rav", label: "Rav", isActive: false },
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
