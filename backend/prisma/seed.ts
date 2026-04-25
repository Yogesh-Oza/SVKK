import {
  PrismaClient,
  UserRole,
  ChartMode,
  PolicyChartKind,
  CategoryType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const holderMatrix = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "18-35", minAge: 18, maxAge: 35 },
    { label: "36-45", minAge: 36, maxAge: 45 },
    { label: "46-60", minAge: 46, maxAge: 60 },
    { label: "61-100", minAge: 61, maxAge: 100 },
  ],
  siColumns: [300000, 500000, 1000000],
  matrix: [
    [1200, 2000, 3500],
    [2500, 4000, 7000],
    [3500, 5700, 9500],
    [4500, 7200, 12000],
    [6000, 9000, 15000],
  ],
  daughterDiscountPercent: 50,
};

const memberMatrix = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "18-35", minAge: 18, maxAge: 35 },
    { label: "36-45", minAge: 36, maxAge: 45 },
    { label: "46-60", minAge: 46, maxAge: 60 },
    { label: "61-100", minAge: 61, maxAge: 100 },
  ],
  siColumns: [300000, 500000, 1000000],
  matrix: [
    [1200, 2000, 3500],
    [2500, 4000, 7000],
    [3500, 4500, 9500],
    [4500, 7200, 12000],
    [6000, 9000, 15000],
  ],
  daughterDiscountPercent: 50,
};

async function main() {
  const passwordHash = await bcrypt.hash("admin123!", 12);

  await prisma.user.upsert({
    where: { email: "admin@svkk.local" },
    update: {},
    create: {
      email: "admin@svkk.local",
      passwordHash,
      name: "Super Admin",
      role: UserRole.SUPER_ADMIN,
    },
  });

  const supervisorHash = await bcrypt.hash("supervisor123!", 12);
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@svkk.local" },
    update: { name: "Supervisor One" },
    create: {
      email: "supervisor@svkk.local",
      passwordHash: supervisorHash,
      name: "Supervisor One",
      role: UserRole.SUPERVISOR,
    },
  });

  await prisma.userVillage.deleteMany({ where: { userId: supervisor.id } });
  for (const village of ["DemoVillageA", "DemoVillageB"]) {
    await prisma.userVillage.create({
      data: { userId: supervisor.id, village },
    });
  }

  const ash = await prisma.policyType.upsert({
    where: { key: "asha_kiran" },
    update: { chartMode: ChartMode.HOLDER_MEMBER },
    create: {
      key: "asha_kiran",
      name: "Asha Kiran",
      chartMode: ChartMode.HOLDER_MEMBER,
      description: "Separate holder and member charts",
    },
  });

  await prisma.policyChart.deleteMany({ where: { policyTypeId: ash.id, version: 1 } });

  await prisma.policyChart.createMany({
    data: [
      {
        policyTypeId: ash.id,
        version: 1,
        effectiveFrom: new Date("2025-01-01"),
        chartKind: PolicyChartKind.HOLDER,
        premiumMatrix: holderMatrix,
      },
      {
        policyTypeId: ash.id,
        version: 1,
        effectiveFrom: new Date("2025-01-01"),
        chartKind: PolicyChartKind.MEMBER,
        premiumMatrix: memberMatrix,
      },
    ],
  });

  const ad = await prisma.policyType.upsert({
    where: { key: "ad_policy" },
    update: { chartMode: ChartMode.HOLDER_MEMBER },
    create: {
      key: "ad_policy",
      name: "AD Policy",
      chartMode: ChartMode.HOLDER_MEMBER,
      description: "Data-entry policy (Family Floater / Individual / Asha Kiran) with full AD form",
    },
  });
  await prisma.policyChart.deleteMany({ where: { policyTypeId: ad.id, version: 1 } });
  await prisma.policyChart.createMany({
    data: [
      {
        policyTypeId: ad.id,
        version: 1,
        effectiveFrom: new Date("2025-01-01"),
        chartKind: PolicyChartKind.HOLDER,
        premiumMatrix: holderMatrix,
      },
      {
        policyTypeId: ad.id,
        version: 1,
        effectiveFrom: new Date("2025-01-01"),
        chartKind: PolicyChartKind.MEMBER,
        premiumMatrix: memberMatrix,
      },
    ],
  });

  const perms = [
    { role: UserRole.SUPER_ADMIN, module: "*", action: "*" },
    { role: UserRole.ADMIN, module: "policy", action: "manage" },
  ];
  for (const p of perms) {
    const exists = await prisma.rolePermission.findFirst({
      where: { role: p.role, module: p.module, action: p.action },
    });
    if (!exists) await prisma.rolePermission.create({ data: p });
  }

  const catSeed: { key: string; name: string; type: CategoryType }[] = [
    { key: "a", name: "Category A", type: CategoryType.GOV },
    { key: "b", name: "Category B", type: CategoryType.GOV },
    { key: "c", name: "Category C", type: CategoryType.GOV },
    { key: "d", name: "Category D", type: CategoryType.GOV },
    { key: "asha_kiran_cat", name: "Asha Kiran", type: CategoryType.SCHEME },
  ];
  for (const c of catSeed) {
    await prisma.category.upsert({
      where: { key: c.key },
      update: { name: c.name, type: c.type },
      create: c,
    });
  }

  const userHash = await bcrypt.hash("user123!", 12);
  await prisma.user.upsert({
    where: { email: "user@svkk.local" },
    update: {},
    create: {
      email: "user@svkk.local",
      passwordHash: userHash,
      name: "Data Entry",
      role: UserRole.USER,
    },
  });

  console.log(
    "Seed OK — admin@svkk.local / admin123! | supervisor@svkk.local / supervisor123! | user@svkk.local / user123!",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
