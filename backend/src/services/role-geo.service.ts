import { DropdownType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";
import { normalizeGeoToken } from "./geo-normalize.js";

export type RoleGeoValues = {
  villageOptionIds: string[];
  areaOptionIds: string[];
  villageValues: string[];
  areaValues: string[];
};

export async function loadRoleGeoValues(roleId: string): Promise<RoleGeoValues> {
  const [villages, areas] = await Promise.all([
    prisma.rbacRoleVillage.findMany({
      where: { roleId },
      select: { dropdownOptionId: true, option: { select: { value: true } } },
    }),
    prisma.rbacRoleArea.findMany({
      where: { roleId },
      select: { dropdownOptionId: true, option: { select: { value: true } } },
    }),
  ]);

  return {
    villageOptionIds: villages.map((r) => r.dropdownOptionId),
    areaOptionIds: areas.map((r) => r.dropdownOptionId),
    villageValues: villages.map((r) => normalizeGeoToken(r.option.value)).filter(Boolean),
    areaValues: areas.map((r) => normalizeGeoToken(r.option.value)).filter(Boolean),
  };
}

export async function validateGeoOptionIds(
  villageOptionIds: string[],
  areaOptionIds: string[],
): Promise<{ villageOptionIds: string[]; areaOptionIds: string[] }> {
  const vIds = [...new Set(villageOptionIds.map((id) => id.trim()).filter(Boolean))];
  const aIds = [...new Set(areaOptionIds.map((id) => id.trim()).filter(Boolean))];

  if (vIds.length) {
    const rows = await prisma.dropdownOption.findMany({
      where: { id: { in: vIds }, type: DropdownType.VILLAGE, isActive: true },
      select: { id: true },
    });
    if (rows.length !== vIds.length) {
      throw new AppError("VALIDATION_ERROR", "One or more village options are invalid or inactive", 400);
    }
  }

  if (aIds.length) {
    const rows = await prisma.dropdownOption.findMany({
      where: { id: { in: aIds }, type: DropdownType.AREA, isActive: true },
      select: { id: true },
    });
    if (rows.length !== aIds.length) {
      throw new AppError("VALIDATION_ERROR", "One or more area options are invalid or inactive", 400);
    }
  }

  return { villageOptionIds: vIds, areaOptionIds: aIds };
}

export async function replaceRoleGeo(
  tx: Pick<typeof prisma, "rbacRoleVillage" | "rbacRoleArea">,
  roleId: string,
  villageOptionIds: string[],
  areaOptionIds: string[],
): Promise<void> {
  await tx.rbacRoleVillage.deleteMany({ where: { roleId } });
  await tx.rbacRoleArea.deleteMany({ where: { roleId } });
  if (villageOptionIds.length) {
    await tx.rbacRoleVillage.createMany({
      data: villageOptionIds.map((dropdownOptionId) => ({ roleId, dropdownOptionId })),
    });
  }
  if (areaOptionIds.length) {
    await tx.rbacRoleArea.createMany({
      data: areaOptionIds.map((dropdownOptionId) => ({ roleId, dropdownOptionId })),
    });
  }
}

export async function listGeoMasterOptions(): Promise<{
  villages: { id: string; value: string; label: string }[];
  areas: { id: string; value: string; label: string }[];
}> {
  const rows = await prisma.dropdownOption.findMany({
    where: { isActive: true, type: { in: [DropdownType.VILLAGE, DropdownType.AREA] } },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, type: true, value: true, label: true },
  });
  const villages: { id: string; value: string; label: string }[] = [];
  const areas: { id: string; value: string; label: string }[] = [];
  for (const r of rows) {
    const item = { id: r.id, value: r.value, label: r.label };
    if (r.type === DropdownType.VILLAGE) villages.push(item);
    else areas.push(item);
  }
  return { villages, areas };
}
