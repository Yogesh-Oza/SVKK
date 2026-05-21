/**
 * Compare legacy policy_table.cat with new DB Category rows and migrated policies.
 *
 * Usage: npm run legacy-migrate:compare-categories
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createLegacyPool } from "./legacy-db.js";
import { mapCategoryKey } from "./transform.js";
import { CATEGORY_LETTER_MAP } from "./config/migration.js";
import { CATEGORY_TEXT_MAP } from "./config/dropdown-mappings.js";

const prisma = new PrismaClient();

async function main() {
  const legacyUrl = process.env.DATABASE_URL_LEGACY ?? process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.error("Set DATABASE_URL_LEGACY in backend/.env");
    process.exit(1);
  }

  const pool = createLegacyPool(legacyUrl);

  const [legacyCatRows] = await pool.query<{ cat: string | null; cnt: number }[]>(
    `SELECT cat, COUNT(*) AS cnt FROM policy_table GROUP BY cat ORDER BY cnt DESC`,
  );

  let legacyCategoryTable: { name: string }[] = [];
  try {
    const [rows] = await pool.query<{ name: string }[]>(
      "SELECT name FROM category ORDER BY name",
    );
    legacyCategoryTable = rows;
  } catch {
    // optional table
  }

  const newCats = await prisma.category.findMany({
    orderBy: { key: "asc" },
    select: { id: true, key: true, name: true, type: true },
  });

  console.log("\n=== New DB: category master ===\n");
  console.table(newCats);

  console.log("\n=== Legacy DB: policy_table.cat (distinct) ===\n");
  const legacyTable = legacyCatRows.map((r) => {
    const raw = r.cat ?? "(null/empty)";
    const mapped = mapCategoryKey(r.cat);
    return {
      legacy_cat: raw,
      count: Number(r.cnt),
      maps_to_key: mapped ?? "⚠ UNMAPPED (categoryId will be NULL)",
    };
  });
  console.table(legacyTable);

  const unmapped = legacyTable.filter((r) => r.maps_to_key.startsWith("⚠"));
  if (unmapped.length > 0) {
    console.log("\n⚠ Add these to CATEGORY_LETTER_MAP / CATEGORY_TEXT_MAP in config\n");
    for (const u of unmapped) console.log(`  "${u.legacy_cat}" (${u.count} policies)`);
  }

  if (legacyCategoryTable.length > 0) {
    console.log("\n=== Legacy DB: category table (name) ===\n");
    console.table(legacyCategoryTable);
  }

  console.log("\n=== CATEGORY_LETTER_MAP ===\n", CATEGORY_LETTER_MAP);
  console.log("\n=== CATEGORY_TEXT_MAP ===\n", CATEGORY_TEXT_MAP);

  const [legacyRefs] = await pool.query<{ ref_no: string; cat: string | null }[]>(
    "SELECT ref_no, cat FROM policy_table WHERE ref_no IS NOT NULL AND ref_no != ''",
  );
  const legacyCatByRef = new Map<string, string | null>();
  for (const r of legacyRefs) legacyCatByRef.set(r.ref_no, r.cat);

  const policies = await prisma.policy.findMany({
    where: { referenceNo: { not: null }, deletedAt: null },
    select: {
      referenceNo: true,
      categoryId: true,
      categoryText: true,
      category: { select: { key: true, name: true } },
    },
  });

  let match = 0;
  let mismatch = 0;
  let expectedNull = 0;
  let actualNullExpectedSet = 0;
  const mismatchByPair = new Map<string, number>();
  const samples: Array<{
    referenceNo: string;
    legacy: string;
    expected: string;
    actual: string;
    categoryText: string | null;
  }> = [];

  for (const p of policies) {
    const ref = p.referenceNo?.trim();
    if (!ref) continue;
    const legacyCat = legacyCatByRef.get(ref) ?? null;
    const expectedKey = mapCategoryKey(legacyCat);
    const actualKey = p.category?.key ?? null;

    if (expectedKey === null) {
      if (p.categoryId === null) {
        match++;
        expectedNull++;
      } else {
        mismatch++;
        const pair = `legacy "${legacyCat ?? ""}" → expected NULL, got ${actualKey}`;
        mismatchByPair.set(pair, (mismatchByPair.get(pair) ?? 0) + 1);
        if (samples.length < 20) {
          samples.push({
            referenceNo: ref,
            legacy: String(legacyCat ?? ""),
            expected: "(null)",
            actual: actualKey ?? "(null)",
            categoryText: p.categoryText,
          });
        }
      }
      continue;
    }

    if (actualKey === expectedKey) {
      match++;
    } else {
      mismatch++;
      const pair = `legacy "${legacyCat ?? ""}" → expected ${expectedKey}, got ${actualKey ?? "NULL"}`;
      mismatchByPair.set(pair, (mismatchByPair.get(pair) ?? 0) + 1);
      if (samples.length < 20) {
        samples.push({
          referenceNo: ref,
          legacy: String(legacyCat ?? ""),
          expected: expectedKey,
          actual: actualKey ?? "(null)",
          categoryText: p.categoryText,
        });
      }
    }
  }

  console.log("\n=== Migrated policies vs legacy cat ===\n");
  console.table({
    total_with_ref: policies.length,
    match,
    mismatch,
    expected_null_category: expectedNull,
  });

  if (mismatchByPair.size > 0) {
    console.log("\nMismatch patterns:\n");
    console.table(
      [...mismatchByPair.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([pattern, count]) => ({ pattern, policies: count })),
    );
  }
  if (samples.length > 0) {
    console.log("\nSamples:\n");
    console.table(samples);
  }

  const distOnNew = await prisma.policy.groupBy({
    by: ["categoryId"],
    where: { deletedAt: null, referenceNo: { not: null } },
    _count: { id: true },
  });
  const catById = new Map(newCats.map((c) => [c.id, c]));
  console.log("\n=== New DB: policies by current Category ===\n");
  console.table(
    distOnNew
      .map((g) => ({
        key: g.categoryId ? (catById.get(g.categoryId)?.key ?? g.categoryId) : "(null)",
        name: g.categoryId ? (catById.get(g.categoryId)?.name ?? "?") : "—",
        policies: g._count.id,
      }))
      .sort((a, b) => b.policies - a.policies),
  );

  await pool.end();
  await prisma.$disconnect();

  if (mismatch > 0 || unmapped.length > 0) {
    console.log("\nNext: npm run legacy-migrate:fix-categories");
    console.log("      npm run legacy-migrate:fix-categories -- --apply\n");
    process.exit(1);
  }
  console.log("\n✓ Categories align.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
