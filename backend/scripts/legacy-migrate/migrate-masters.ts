import type { Pool } from "mysql2/promise";
import { CategoryType, DropdownType, type PrismaClient } from "@prisma/client";
import { DropdownResolver } from "./dropdown-resolver.js";
import { saveMastersCheckpoint } from "./checkpoint.js";
import { normalizeLegacyText } from "./normalize.js";

const POLICY_DISTINCT_COLUMNS: { col: string; type: DropdownType }[] = [
  { col: "area", type: DropdownType.AREA },
  { col: "village", type: DropdownType.VILLAGE },
  { col: "city", type: DropdownType.CITY },
  { col: "relation", type: DropdownType.RELATION },
  { col: "sum_insured", type: DropdownType.SUM_INSURED },
  { col: "cheque_status", type: DropdownType.TRANSACTION_STATUS },
];

async function distinctColumn(pool: Pool, table: string, column: string): Promise<string[]> {
  const [rows] = await pool.query<{ v: string | null }[]>(
    `SELECT DISTINCT \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND TRIM(\`${column}\`) != ''`,
  );
  return rows.map((r) => String(r.v).trim()).filter(Boolean);
}

async function importLegacyMasterTable(
  pool: Pool,
  table: string,
  type: DropdownType,
  resolver: DropdownResolver,
): Promise<void> {
  try {
    const names = await distinctColumn(pool, table, "name");
    for (const name of names) {
      await resolver.resolveDropdown(type, name);
    }
  } catch {
    // Table may not exist in all legacy DBs
  }
}

export interface MigrateMastersResult {
  dropdownsCreated: number;
  distinctValuesProcessed: number;
}

export async function migrateMasters(
  prisma: PrismaClient,
  legacyPool: Pool,
  migrationRunId: string,
  dryRun: boolean,
): Promise<MigrateMastersResult> {
  const resolver = await DropdownResolver.load(prisma, migrationRunId, dryRun);
  let distinctValuesProcessed = 0;

  for (const { col, type } of POLICY_DISTINCT_COLUMNS) {
    const values = await distinctColumn(legacyPool, "policy_table", col);
    for (const v of values) {
      await resolver.resolveDropdown(type, v);
      distinctValuesProcessed += 1;
    }
  }

  const memberRelations = await distinctColumn(legacyPool, "member", "relation");
  for (const v of memberRelations) {
    await resolver.resolveRelation(v);
    distinctValuesProcessed += 1;
  }

  await importLegacyMasterTable(legacyPool, "area", DropdownType.AREA, resolver);
  await importLegacyMasterTable(legacyPool, "village", DropdownType.VILLAGE, resolver);
  await importLegacyMasterTable(legacyPool, "city", DropdownType.CITY, resolver);

  // Policy grouping names from legacy policygroup table or distinct policy_table
  try {
    const groups = await distinctColumn(legacyPool, "policygroup", "name");
    for (const g of groups) {
      const name = g.trim().toUpperCase();
      if (!dryRun && name) {
        await prisma.policyGroupingOption.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }
      distinctValuesProcessed += 1;
    }
  } catch {
    const fromPolicies = await distinctColumn(legacyPool, "policy_table", "policy_grouping");
    for (const g of fromPolicies) {
      const name = g.trim().toUpperCase();
      if (!dryRun && name) {
        await prisma.policyGroupingOption.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }
      distinctValuesProcessed += 1;
    }
  }

  // Warm categories from legacy category table
  try {
    const cats = await distinctColumn(legacyPool, "category", "name");
    for (const c of cats) {
      const key = normalizeLegacyText(c);
      if (key.length === 1 && !dryRun) {
        await prisma.category.upsert({
          where: { key },
          update: {},
          create: { key, name: `Category ${c.toUpperCase()}`, type: CategoryType.GOV },
        });
      }
      distinctValuesProcessed += 1;
    }
  } catch {
    // optional
  }

  if (!dryRun) {
    await saveMastersCheckpoint(prisma, migrationRunId);
  }

  return {
    dropdownsCreated: resolver.getDropdownsCreatedCount(),
    distinctValuesProcessed,
  };
}
