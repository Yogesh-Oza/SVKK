/**
 * One-time: map UserVillage strings → DropdownOption (VILLAGE) → RbacRoleVillage per role.
 * Run: npx tsx backend/scripts/migrate-role-geo-from-user-village.ts
 */
import { DropdownType, PrismaClient } from "@prisma/client";
import { normalizeGeoToken } from "../src/services/geo-normalize.js";

const prisma = new PrismaClient();

async function findOrCreateVillageOption(village: string): Promise<string> {
  const value = normalizeGeoToken(village);
  const existing = await prisma.dropdownOption.findFirst({
    where: { type: DropdownType.VILLAGE, value },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.dropdownOption.create({
    data: {
      type: DropdownType.VILLAGE,
      value,
      label: village.trim(),
      isActive: true,
    },
  });
  return created.id;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { userVillages: { some: {} } },
    select: {
      roleId: true,
      userVillages: { select: { village: true } },
    },
  });

  const byRole = new Map<string, Set<string>>();
  for (const u of users) {
    if (!u.roleId) continue;
    const set = byRole.get(u.roleId) ?? new Set<string>();
    for (const uv of u.userVillages) {
      const v = (uv.village ?? "").trim();
      if (v) set.add(v);
    }
    byRole.set(u.roleId, set);
  }

  for (const [roleId, villages] of byRole) {
    const optionIds: string[] = [];
    for (const village of villages) {
      optionIds.push(await findOrCreateVillageOption(village));
    }
    await prisma.rbacRoleVillage.deleteMany({ where: { roleId } });
    if (optionIds.length) {
      await prisma.rbacRoleVillage.createMany({
        data: optionIds.map((dropdownOptionId) => ({ roleId, dropdownOptionId })),
        skipDuplicates: true,
      });
    }
    console.log(`Role ${roleId}: ${optionIds.length} villages`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
