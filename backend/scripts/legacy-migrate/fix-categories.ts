/**
 * Re-align policy.categoryId from legacy policy_table.cat (via referenceNo).
 *
 * Usage:
 *   npm run legacy-migrate:fix-categories
 *   npm run legacy-migrate:fix-categories -- --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createLegacyPool } from "./legacy-db.js";
import { mapCategoryKey } from "./transform.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const legacyUrl = process.env.DATABASE_URL_LEGACY ?? process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.error("Set DATABASE_URL_LEGACY in backend/.env");
    process.exit(1);
  }

  const pool = createLegacyPool(legacyUrl);
  const cats = await prisma.category.findMany({ select: { id: true, key: true, name: true } });
  const catIdByKey = new Map(cats.map((c) => [c.key, c.id]));

  console.log(`\nMode: ${apply ? "APPLY" : "DRY-RUN"}\n`);
  console.table(cats.map((c) => ({ key: c.key, name: c.name })));

  const [legacyRows] = await pool.query<{ ref_no: string; cat: string | null }[]>(
    "SELECT ref_no, cat FROM policy_table WHERE ref_no IS NOT NULL AND ref_no != ''",
  );
  const legacyCatByRef = new Map(legacyRows.map((r) => [r.ref_no, r.cat]));

  const policies = await prisma.policy.findMany({
    where: { referenceNo: { not: null }, deletedAt: null },
    select: { id: true, referenceNo: true, categoryId: true, category: { select: { key: true } } },
  });

  const nullIds: string[] = [];
  const idsByCategoryId = new Map<string | "NULL", string[]>();
  let skippedOk = 0;
  let skippedUnmapped = 0;
  const samples: Array<{ ref: string; legacy: string; from: string; to: string }> = [];

  for (const p of policies) {
    const ref = p.referenceNo?.trim();
    if (!ref) continue;

    const expectedKey = mapCategoryKey(legacyCatByRef.get(ref));
    if (expectedKey === null && legacyCatByRef.get(ref) != null && legacyCatByRef.get(ref) !== "") {
      skippedUnmapped++;
      continue;
    }

    const targetId = expectedKey ? (catIdByKey.get(expectedKey) ?? null) : null;
    if (expectedKey && !targetId) {
      skippedUnmapped++;
      continue;
    }

    const currentKey = p.category?.key ?? null;
    if (currentKey === expectedKey && (targetId === null ? p.categoryId === null : p.categoryId === targetId)) {
      skippedOk++;
      continue;
    }

    if (targetId === null) {
      nullIds.push(p.id);
    } else {
      const bucket = idsByCategoryId.get(targetId) ?? [];
      bucket.push(p.id);
      idsByCategoryId.set(targetId, bucket);
    }

    if (samples.length < 25) {
      samples.push({
        ref,
        legacy: String(legacyCatByRef.get(ref) ?? ""),
        from: currentKey ?? "(null)",
        to: expectedKey ?? "(null)",
      });
    }
  }

  let updated = 0;
  if (apply) {
    if (nullIds.length > 0) {
      for (let i = 0; i < nullIds.length; i += 500) {
        const r = await prisma.policy.updateMany({
          where: { id: { in: nullIds.slice(i, i + 500) } },
          data: { categoryId: null },
        });
        updated += r.count;
      }
    }
    for (const [catId, ids] of idsByCategoryId) {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await prisma.policy.updateMany({
          where: { id: { in: ids.slice(i, i + 500) } },
          data: { categoryId: catId },
        });
        updated += r.count;
      }
    }
  } else {
    updated = nullIds.length + [...idsByCategoryId.values()].reduce((s, a) => s + a.length, 0);
  }

  console.log("\n=== Result ===\n");
  console.table({
    scanned: policies.length,
    already_correct: skippedOk,
    would_update: updated,
    legacy_cat_unmapped: skippedUnmapped,
    set_to_null: nullIds.length,
    batches: idsByCategoryId.size,
  });
  if (samples.length) console.table(samples);

  if (skippedUnmapped > 0) {
    console.log("\n⚠ Some legacy cat values need new Category rows or map entries.\n");
  }

  await pool.end();
  await prisma.$disconnect();

  if (!apply && updated > 0) console.log(`\nRe-run with --apply to update ${updated} policies.\n`);
  else if (apply && updated > 0) console.log(`\n✓ Updated ${updated} policies.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
