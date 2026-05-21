import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "../../errors/app-error.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    dropdownOption: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    rbacRoleVillage: { count: vi.fn() },
    rbacRoleArea: { count: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { deleteDropdownOption } from "./admin-dropdown.service.js";

describe("deleteDropdownOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when option is linked to role geography", async () => {
    vi.mocked(prisma.dropdownOption.findUnique).mockResolvedValue({
      id: "opt1",
      label: "Village A",
      type: "VILLAGE",
    } as never);
    vi.mocked(prisma.rbacRoleVillage.count).mockResolvedValue(2);
    vi.mocked(prisma.rbacRoleArea.count).mockResolvedValue(0);

    await expect(deleteDropdownOption("opt1")).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    } satisfies Partial<AppError>);
    expect(prisma.dropdownOption.delete).not.toHaveBeenCalled();
  });

  it("deletes when no role references exist", async () => {
    vi.mocked(prisma.dropdownOption.findUnique).mockResolvedValue({
      id: "opt1",
      label: "Village B",
      type: "VILLAGE",
    } as never);
    vi.mocked(prisma.rbacRoleVillage.count).mockResolvedValue(0);
    vi.mocked(prisma.rbacRoleArea.count).mockResolvedValue(0);
    vi.mocked(prisma.dropdownOption.delete).mockResolvedValue({} as never);

    await deleteDropdownOption("opt1");
    expect(prisma.dropdownOption.delete).toHaveBeenCalledWith({ where: { id: "opt1" } });
  });
});
