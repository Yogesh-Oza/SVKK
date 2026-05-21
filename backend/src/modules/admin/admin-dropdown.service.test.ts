import { describe, expect, it, vi, beforeEach } from "vitest";

const tx = {
  rbacRoleVillage: { deleteMany: vi.fn() },
  rbacRoleArea: { deleteMany: vi.fn() },
  dropdownOption: { delete: vi.fn() },
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    dropdownOption: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  },
}));

import { prisma } from "../../lib/prisma.js";
import { deleteDropdownOption } from "./admin-dropdown.service.js";

describe("deleteDropdownOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.rbacRoleVillage.deleteMany.mockResolvedValue({ count: 0 });
    tx.rbacRoleArea.deleteMany.mockResolvedValue({ count: 0 });
    tx.dropdownOption.delete.mockResolvedValue({});
  });

  it("removes role geography links then deletes the option", async () => {
    vi.mocked(prisma.dropdownOption.findUnique).mockResolvedValue({
      id: "opt1",
      label: "DemoVillageAsystem",
      type: "VILLAGE",
    } as never);
    tx.rbacRoleVillage.deleteMany.mockResolvedValue({ count: 2 });

    await deleteDropdownOption("opt1");

    expect(tx.rbacRoleVillage.deleteMany).toHaveBeenCalledWith({
      where: { dropdownOptionId: "opt1" },
    });
    expect(tx.rbacRoleArea.deleteMany).toHaveBeenCalledWith({
      where: { dropdownOptionId: "opt1" },
    });
    expect(tx.dropdownOption.delete).toHaveBeenCalledWith({ where: { id: "opt1" } });
  });
});
