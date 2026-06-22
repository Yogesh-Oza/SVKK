import {
  PrismaClient,
  ChartMode,
  PolicyChartKind,
  CategoryType,
  DropdownType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  upsertPermissionCatalog,
  upsertSystemRoles,
  LEGACY_ROLE_SLUGS,
} from "../src/lib/permission-seed.js";
import { migrateRbacV2Permissions } from "../src/lib/migrate-rbac-v2-permissions.js";

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
  const keyToId = await upsertPermissionCatalog(prisma);
  await migrateRbacV2Permissions(prisma);
  const slugToId = await upsertSystemRoles(prisma, keyToId);
  const superAdminRoleId = slugToId.get(LEGACY_ROLE_SLUGS.SUPER_ADMIN)!;
  const supervisorRoleId = slugToId.get(LEGACY_ROLE_SLUGS.SUPERVISOR)!;

  const passwordHash = await bcrypt.hash("admin123!", 12);

  await prisma.user.upsert({
    where: { email: "admin@svkk.local" },
    update: { roleId: superAdminRoleId },
    create: {
      email: "admin@svkk.local",
      passwordHash,
      name: "Super Admin",
      roleId: superAdminRoleId,
    },
  });

  const supervisorHash = await bcrypt.hash("supervisor123!", 12);
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@svkk.local" },
    update: { name: "Supervisor One", roleId: supervisorRoleId },
    create: {
      email: "supervisor@svkk.local",
      passwordHash: supervisorHash,
      name: "Supervisor One",
      roleId: supervisorRoleId,
    },
  });

  // Legacy UserVillage kept for rollback; authorization reads RbacRoleVillage.
  await prisma.userVillage.deleteMany({ where: { userId: supervisor.id } });
  for (const village of ["DemoVillageA", "DemoVillageB"]) {
    await prisma.userVillage.create({
      data: { userId: supervisor.id, village },
    });
  }

  // Frontend-shaped discount configs (what the calculator engine reads). These
  // also match the HTML reference's `sampleDefs[*].discount` so the engine
  // produces identical numbers.
  const ASHA_KIRAN_DISCOUNT = {
    type: "daughter",
    different: "no",
    holder: "",
    member: "",
    daughter: 50,
    byCount: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  };
  const AD_POLICY_DISCOUNT = {
    type: "count",
    different: "no",
    holder: "",
    member: "",
    daughter: "",
    byCount: { "1": 0, "2": 5, "3": 5, "4": 10, "5": 10, "6": 10, "7": 10 },
  };

  const ash = await prisma.policyType.upsert({
    where: { key: "asha_kiran" },
    update: {
      chartMode: ChartMode.HOLDER_MEMBER,
      discountConfig: ASHA_KIRAN_DISCOUNT,
    },
    create: {
      key: "asha_kiran",
      name: "Asha Kiran",
      chartMode: ChartMode.HOLDER_MEMBER,
      description: "Separate holder and member charts",
      discountConfig: ASHA_KIRAN_DISCOUNT,
    },
  });

  await upsertPolicyChart(ash.id, 1, PolicyChartKind.HOLDER, holderMatrix);
  await upsertPolicyChart(ash.id, 1, PolicyChartKind.MEMBER, memberMatrix);

  const ad = await prisma.policyType.upsert({
    where: { key: "ad_policy" },
    update: {
      chartMode: ChartMode.HOLDER_MEMBER,
      discountConfig: AD_POLICY_DISCOUNT,
    },
    create: {
      key: "ad_policy",
      name: "AD Policy",
      chartMode: ChartMode.HOLDER_MEMBER,
      description: "Data-entry policy (Family Floater / Individual / Asha Kiran) with full AD form",
      discountConfig: AD_POLICY_DISCOUNT,
    },
  });
  await upsertPolicyChart(ad.id, 1, PolicyChartKind.HOLDER, holderMatrix);
  await upsertPolicyChart(ad.id, 1, PolicyChartKind.MEMBER, memberMatrix);

  // Legacy migration expects standalone PolicyType keys (see scripts/legacy-migrate/README.md).
  const legacyMigrateTypes: { key: string; name: string }[] = [
    { key: "family_floater", name: "Family Floater" },
    { key: "individual", name: "Individual" },
    { key: "senior_citizen", name: "Senior Citizen" },
  ];
  for (const lt of legacyMigrateTypes) {
    const pt = await prisma.policyType.upsert({
      where: { key: lt.key },
      update: {
        chartMode: ChartMode.SINGLE,
        discountConfig: AD_POLICY_DISCOUNT,
      },
      create: {
        key: lt.key,
        name: lt.name,
        chartMode: ChartMode.SINGLE,
        description: `Legacy ${lt.name} policies (migration target)`,
        discountConfig: AD_POLICY_DISCOUNT,
      },
    });
    await upsertPolicyChart(pt.id, 1, PolicyChartKind.HOLDER, holderMatrix);
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

  // System defaults. Sort numbers use a simple 0,1,2,3 scheme.
  // After seeding, we normalize numbering across every type (including
  // any user-added rows) so the table is always contiguous.
  //
  // NOTE: `value` keeps its original casing for backward compatibility with
  // existing saved policies (e.g. `holderGender: "M"`, `paymentTransactions[].mode: "ONLINE"`).
  // The frontend's auto-snake_case rule only applies to new entries the admin adds.
  const dropdownSeed: { type: DropdownType; value: string; label: string; sortOrder: number }[] = [
    { type: DropdownType.GENDER, value: "M", label: "Male", sortOrder: 0 },
    { type: DropdownType.GENDER, value: "F", label: "Female", sortOrder: 1 },
    { type: DropdownType.GENDER, value: "O", label: "Other", sortOrder: 2 },

    { type: DropdownType.RELATION, value: "Self", label: "Self", sortOrder: 0 },
    { type: DropdownType.RELATION, value: "Spouse", label: "Spouse", sortOrder: 1 },
    { type: DropdownType.RELATION, value: "Son", label: "Son", sortOrder: 2 },
    { type: DropdownType.RELATION, value: "Daughter", label: "Daughter", sortOrder: 3 },
    { type: DropdownType.RELATION, value: "Father", label: "Father", sortOrder: 4 },
    { type: DropdownType.RELATION, value: "Mother", label: "Mother", sortOrder: 5 },
    { type: DropdownType.RELATION, value: "Brother", label: "Brother", sortOrder: 6 },
    { type: DropdownType.RELATION, value: "Sister", label: "Sister", sortOrder: 7 },
    { type: DropdownType.RELATION, value: "Grandfather", label: "Grandfather", sortOrder: 8 },
    { type: DropdownType.RELATION, value: "Grandmother", label: "Grandmother", sortOrder: 9 },
    { type: DropdownType.RELATION, value: "Father-in-law", label: "Father-in-law", sortOrder: 10 },
    { type: DropdownType.RELATION, value: "Mother-in-law", label: "Mother-in-law", sortOrder: 11 },
    { type: DropdownType.RELATION, value: "Other", label: "Other", sortOrder: 12 },

    { type: DropdownType.YES_NO, value: "YES", label: "YES", sortOrder: 0 },
    { type: DropdownType.YES_NO, value: "NO", label: "NO", sortOrder: 1 },

    { type: DropdownType.PAYMENT_MODE, value: "ONLINE", label: "Online", sortOrder: 0 },
    { type: DropdownType.PAYMENT_MODE, value: "CHEQUE", label: "Cheque", sortOrder: 1 },
    { type: DropdownType.PAYMENT_MODE, value: "CASH", label: "Cash", sortOrder: 2 },
    { type: DropdownType.PAYMENT_MODE, value: "UPI", label: "UPI", sortOrder: 3 },

    { type: DropdownType.TRANSACTION_STATUS, value: "CLEARED", label: "Cleared", sortOrder: 0 },
    { type: DropdownType.TRANSACTION_STATUS, value: "DISHONOURED", label: "Dishonoured", sortOrder: 1 },
    { type: DropdownType.TRANSACTION_STATUS, value: "PENDING", label: "Pending", sortOrder: 2 },

    { type: DropdownType.SUM_INSURED, value: "100000", label: "1,00,000", sortOrder: 0 },
    { type: DropdownType.SUM_INSURED, value: "200000", label: "2,00,000", sortOrder: 1 },
    { type: DropdownType.SUM_INSURED, value: "300000", label: "3,00,000", sortOrder: 2 },
    { type: DropdownType.SUM_INSURED, value: "500000", label: "5,00,000", sortOrder: 3 },
    { type: DropdownType.SUM_INSURED, value: "1000000", label: "10,00,000", sortOrder: 4 },
    { type: DropdownType.SUM_INSURED, value: "1500000", label: "15,00,000", sortOrder: 5 },
    { type: DropdownType.SUM_INSURED, value: "2000000", label: "20,00,000", sortOrder: 6 },

    // Gujarat-flavour demo data so the add-policy form has non-empty dropdowns
    // out of the box. Admins can rename/delete; re-running seed will recreate.
    { type: DropdownType.CITY, value: "ahmedabad", label: "Ahmedabad", sortOrder: 0 },
    { type: DropdownType.CITY, value: "surat", label: "Surat", sortOrder: 1 },
    { type: DropdownType.CITY, value: "vadodara", label: "Vadodara", sortOrder: 2 },
    { type: DropdownType.CITY, value: "rajkot", label: "Rajkot", sortOrder: 3 },
    { type: DropdownType.CITY, value: "gandhinagar", label: "Gandhinagar", sortOrder: 4 },

    { type: DropdownType.VILLAGE, value: "vrundavan", label: "Vrundavan", sortOrder: 0 },
    { type: DropdownType.VILLAGE, value: "gokul", label: "Gokul", sortOrder: 1 },
    { type: DropdownType.VILLAGE, value: "mathura", label: "Mathura", sortOrder: 2 },
    { type: DropdownType.VILLAGE, value: "becharaji", label: "Becharaji", sortOrder: 3 },
    { type: DropdownType.VILLAGE, value: "idar", label: "Idar", sortOrder: 4 },
    { type: DropdownType.VILLAGE, value: "demovillagea", label: "DemoVillageA", sortOrder: 5 },
    { type: DropdownType.VILLAGE, value: "demovillageb", label: "DemoVillageB", sortOrder: 6 },

    { type: DropdownType.AREA, value: "naroda", label: "Naroda", sortOrder: 0 },
    { type: DropdownType.AREA, value: "bopal", label: "Bopal", sortOrder: 1 },
    { type: DropdownType.AREA, value: "maninagar", label: "Maninagar", sortOrder: 2 },
    { type: DropdownType.AREA, value: "satellite", label: "Satellite", sortOrder: 3 },
    { type: DropdownType.AREA, value: "vastrapur", label: "Vastrapur", sortOrder: 4 },
  ];

  for (const d of dropdownSeed) {
    await prisma.dropdownOption.upsert({
      where: { type_value: { type: d.type, value: d.value } },
      update: { label: d.label, sortOrder: d.sortOrder, isSystem: true, isActive: true },
      create: { ...d, isSystem: true, isActive: true },
    });
  }

  const supervisorVillageOptions = await prisma.dropdownOption.findMany({
    where: {
      type: DropdownType.VILLAGE,
      value: { in: ["demovillagea", "demovillageb"] },
    },
    select: { id: true },
  });
  await prisma.rbacRoleVillage.deleteMany({ where: { roleId: supervisorRoleId } });
  if (supervisorVillageOptions.length) {
    await prisma.rbacRoleVillage.createMany({
      data: supervisorVillageOptions.map((o) => ({
        roleId: supervisorRoleId,
        dropdownOptionId: o.id,
      })),
      skipDuplicates: true,
    });
  }

  // Normalize sortOrder to a contiguous 0..N per type (so any drift from
  // older 10/20/30 numbering or partial admin edits gets cleaned up).
  for (const type of Object.values(DropdownType)) {
    const rows = await prisma.dropdownOption.findMany({
      where: { type },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.sortOrder !== i) {
        await prisma.dropdownOption.update({
          where: { id: row.id },
          data: { sortOrder: i },
        });
      }
    }
  }

  // Demo Policy Groupings so the add-policy "Policy Group" combobox isn't
  // empty out of the box. Idempotent via the unique `name`.
  const policyGroupingSeed: { name: string }[] = [
    { name: "SVKK" },
    { name: "NVKK" },
    { name: "RTY" },
    { name: "OTHER" },
  ];
  for (const g of policyGroupingSeed) {
    await prisma.policyGroupingOption.upsert({
      where: { name: g.name },
      update: {},
      create: g,
    });
  }

  const userRoleId = slugToId.get(LEGACY_ROLE_SLUGS.USER)!;
  const userHash = await bcrypt.hash("user123!", 12);
  await prisma.user.upsert({
    where: { email: "user@svkk.local" },
    update: { roleId: userRoleId },
    create: {
      email: "user@svkk.local",
      passwordHash: userHash,
      name: "Data Entry",
      roleId: userRoleId,
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
