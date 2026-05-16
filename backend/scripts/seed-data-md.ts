/**
 * Seed AREA and VILLAGE dropdown options from backend/data.md.
 *
 * Usage (from backend/):
 *   npm run db:seed:data-md
 *   npm run db:seed:data-md -- --dry-run
 *   npm run db:seed:data-md -- --file ./data.md
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DropdownType, PrismaClient } from "@prisma/client";
import { loadDataMdFromRepo, parseDataMd, toDropdownRow } from "./lib/parse-data-md.js";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function upsertType(
  type: DropdownType,
  names: string[],
  dryRun: boolean,
): Promise<{ created: number; updated: number }> {
  const existingRows = dryRun
    ? []
    : await prisma.dropdownOption.findMany({
        where: { type },
        select: { value: true },
      });
  const existingSet = new Set(existingRows.map((r) => r.value));

  let created = 0;
  let updated = 0;

  const ops = names.map((name, i) => {
    const row = toDropdownRow(name, i);
    if (existingSet.has(row.value)) updated++;
    else created++;

    if (dryRun) return null;

    return prisma.dropdownOption.upsert({
      where: { type_value: { type, value: row.value } },
      update: {
        label: row.label,
        sortOrder: row.sortOrder,
        isActive: true,
        isSystem: true,
      },
      create: {
        type,
        value: row.value,
        label: row.label,
        sortOrder: row.sortOrder,
        isActive: true,
        isSystem: true,
      },
    });
  });

  if (!dryRun) {
    const BATCH = 25;
    for (let i = 0; i < ops.length; i += BATCH) {
      const chunk = ops.slice(i, i + BATCH).filter(Boolean);
      if (chunk.length) await prisma.$transaction(chunk as NonNullable<(typeof ops)[number]>[]);
    }

    const all = await prisma.dropdownOption.findMany({
      where: { type, isSystem: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    const seededValues = new Set(names.map((n) => toDropdownRow(n, 0).value));
    const fromFile = all.filter((r) => seededValues.has(r.value));
    const sortOps = fromFile
      .map((row, i) =>
        row.sortOrder !== i
          ? prisma.dropdownOption.update({ where: { id: row.id }, data: { sortOrder: i } })
          : null,
      )
      .filter(Boolean);
    for (let i = 0; i < sortOps.length; i += BATCH) {
      const chunk = sortOps.slice(i, i + BATCH).filter(Boolean);
      if (chunk.length) await prisma.$transaction(chunk as NonNullable<(typeof sortOps)[number]>[]);
    }
  }

  return { created, updated };
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const fileArg = arg("file");

  let parsed;
  if (fileArg) {
    const content = readFileSync(resolve(fileArg), "utf8");
    parsed = parseDataMd(content);
  } else {
    parsed = loadDataMdFromRepo(process.cwd());
  }

  console.log(`Source: ${fileArg ?? "data.md"}`);
  console.log(`Areas: ${parsed.areas.length} | Villages: ${parsed.villages.length}`);
  if (dryRun) console.log("(dry run — no writes)\n");

  const areaStats = await upsertType(DropdownType.AREA, parsed.areas, dryRun);
  const villageStats = await upsertType(DropdownType.VILLAGE, parsed.villages, dryRun);

  console.log(
    `AREA: ${areaStats.created} new, ${areaStats.updated} updated (${parsed.areas.length} total in file)`,
  );
  console.log(
    `VILLAGE: ${villageStats.created} new, ${villageStats.updated} updated (${parsed.villages.length} total in file)`,
  );

  if (!dryRun) {
    const [areaCount, villageCount] = await Promise.all([
      prisma.dropdownOption.count({ where: { type: DropdownType.AREA, isActive: true } }),
      prisma.dropdownOption.count({ where: { type: DropdownType.VILLAGE, isActive: true } }),
    ]);
    console.log(`\nActive in DB — AREA: ${areaCount} | VILLAGE: ${villageCount}`);
  }

  console.log(dryRun ? "\nDry run complete." : "\nSeed from data.md complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
