import {
  PrismaClient,
  UserRole,
  ChartMode,
  PolicyChartKind,
  CategoryType,
  DropdownType,
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

/**
 * Idempotent chart seeder. The pre-existing wipe-and-recreate approach blew up
 * with P2003 (FK) once real PolicyYear rows referenced these charts. Upserting
 * via the `[policyTypeId, version, chartKind]` unique key keeps existing IDs
 * intact so PolicyYear references stay valid.
 */
async function upsertPolicyChart(
  policyTypeId: string,
  version: number,
  chartKind: PolicyChartKind,
  premiumMatrix: typeof holderMatrix | typeof memberMatrix,
) {
  await prisma.policyChart.upsert({
    where: {
      policyTypeId_version_chartKind: { policyTypeId, version, chartKind },
    },
    update: {
      premiumMatrix,
      effectiveFrom: new Date("2025-01-01"),
    },
    create: {
      policyTypeId,
      version,
      effectiveFrom: new Date("2025-01-01"),
      chartKind,
      premiumMatrix,
    },
  });
}

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

  await upsertPolicyChart(ash.id, 1, PolicyChartKind.HOLDER, holderMatrix);
  await upsertPolicyChart(ash.id, 1, PolicyChartKind.MEMBER, memberMatrix);

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
  await upsertPolicyChart(ad.id, 1, PolicyChartKind.HOLDER, holderMatrix);
  await upsertPolicyChart(ad.id, 1, PolicyChartKind.MEMBER, memberMatrix);

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

  const dropdownSeed: { type: DropdownType; value: string; label: string; sortOrder: number }[] = [
    { type: DropdownType.GENDER, value: "M", label: "Male", sortOrder: 10 },
    { type: DropdownType.GENDER, value: "F", label: "Female", sortOrder: 20 },
    { type: DropdownType.GENDER, value: "O", label: "Other", sortOrder: 30 },

    { type: DropdownType.RELATION, value: "Self", label: "Self", sortOrder: 10 },
    { type: DropdownType.RELATION, value: "Spouse", label: "Spouse", sortOrder: 20 },
    { type: DropdownType.RELATION, value: "Son", label: "Son", sortOrder: 30 },
    { type: DropdownType.RELATION, value: "Daughter", label: "Daughter", sortOrder: 40 },
    { type: DropdownType.RELATION, value: "Father", label: "Father", sortOrder: 50 },
    { type: DropdownType.RELATION, value: "Mother", label: "Mother", sortOrder: 60 },
    { type: DropdownType.RELATION, value: "Brother", label: "Brother", sortOrder: 70 },
    { type: DropdownType.RELATION, value: "Sister", label: "Sister", sortOrder: 80 },
    { type: DropdownType.RELATION, value: "Grandfather", label: "Grandfather", sortOrder: 90 },
    { type: DropdownType.RELATION, value: "Grandmother", label: "Grandmother", sortOrder: 100 },
    { type: DropdownType.RELATION, value: "Father-in-law", label: "Father-in-law", sortOrder: 110 },
    { type: DropdownType.RELATION, value: "Mother-in-law", label: "Mother-in-law", sortOrder: 120 },
    { type: DropdownType.RELATION, value: "Other", label: "Other", sortOrder: 200 },

    { type: DropdownType.YES_NO, value: "YES", label: "YES", sortOrder: 10 },
    { type: DropdownType.YES_NO, value: "NO", label: "NO", sortOrder: 20 },

    { type: DropdownType.PAYMENT_MODE, value: "ONLINE", label: "Online", sortOrder: 10 },
    { type: DropdownType.PAYMENT_MODE, value: "CHEQUE", label: "Cheque", sortOrder: 20 },
    { type: DropdownType.PAYMENT_MODE, value: "CASH", label: "Cash", sortOrder: 30 },
    { type: DropdownType.PAYMENT_MODE, value: "NEFT", label: "NEFT", sortOrder: 40 },

    { type: DropdownType.TRANSACTION_STATUS, value: "CLEARED", label: "Cleared", sortOrder: 10 },
    { type: DropdownType.TRANSACTION_STATUS, value: "DISHONOURED", label: "Dishonoured", sortOrder: 20 },
    { type: DropdownType.TRANSACTION_STATUS, value: "PENDING", label: "Pending", sortOrder: 30 },

    { type: DropdownType.SUM_INSURED, value: "100000", label: "1,00,000", sortOrder: 10 },
    { type: DropdownType.SUM_INSURED, value: "200000", label: "2,00,000", sortOrder: 20 },
    { type: DropdownType.SUM_INSURED, value: "300000", label: "3,00,000", sortOrder: 30 },
    { type: DropdownType.SUM_INSURED, value: "500000", label: "5,00,000", sortOrder: 40 },
    { type: DropdownType.SUM_INSURED, value: "1000000", label: "10,00,000", sortOrder: 50 },
    { type: DropdownType.SUM_INSURED, value: "1500000", label: "15,00,000", sortOrder: 60 },
    { type: DropdownType.SUM_INSURED, value: "2000000", label: "20,00,000", sortOrder: 70 },
  ];

  for (const d of dropdownSeed) {
    await prisma.dropdownOption.upsert({
      where: { type_value: { type: d.type, value: d.value } },
      update: { label: d.label, sortOrder: d.sortOrder, isSystem: true, isActive: true },
      create: { ...d, isSystem: true, isActive: true },
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
