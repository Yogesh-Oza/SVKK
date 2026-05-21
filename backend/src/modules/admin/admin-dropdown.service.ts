import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";

export async function deleteDropdownOption(id: string): Promise<void> {
  const row = await prisma.dropdownOption.findUnique({
    where: { id },
    select: { id: true, label: true, type: true },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Dropdown option not found", 404);
  }

  const [roleVillageCount, roleAreaCount] = await Promise.all([
    prisma.rbacRoleVillage.count({ where: { dropdownOptionId: id } }),
    prisma.rbacRoleArea.count({ where: { dropdownOptionId: id } }),
  ]);

  if (roleVillageCount > 0 || roleAreaCount > 0) {
    const parts: string[] = [];
    if (roleVillageCount > 0) {
      parts.push(
        `used in ${roleVillageCount} role village rule${roleVillageCount === 1 ? "" : "s"}`,
      );
    }
    if (roleAreaCount > 0) {
      parts.push(
        `used in ${roleAreaCount} role area rule${roleAreaCount === 1 ? "" : "s"}`,
      );
    }
    throw new AppError(
      "CONFLICT",
      `Cannot delete "${row.label}" (${row.type}): ${parts.join(" and ")}. Remove it from role geography in RBAC settings first, or set inactive instead.`,
      409,
    );
  }

  try {
    await prisma.dropdownOption.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw new AppError(
        "CONFLICT",
        `Cannot delete "${row.label}": it is still referenced by other records.`,
        409,
      );
    }
    throw e;
  }
}
