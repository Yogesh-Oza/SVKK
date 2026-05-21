import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Hard-delete a dropdown master row. Unlinks RBAC role village/area rules that pointed at it first.
 */
export async function deleteDropdownOption(id: string): Promise<void> {
  const row = await prisma.dropdownOption.findUnique({
    where: { id },
    select: { id: true, label: true, type: true },
  });
  if (!row) {
    throw new AppError("NOT_FOUND", "Dropdown option not found", 404);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.rbacRoleVillage.deleteMany({ where: { dropdownOptionId: id } });
      await tx.rbacRoleArea.deleteMany({ where: { dropdownOptionId: id } });
      await tx.dropdownOption.delete({ where: { id } });
    });
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
