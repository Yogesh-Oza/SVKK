/**
 * Compare legacy policy_table.policy_type values with new DB PolicyType rows
 * and migrated policies (by referenceNo).
 *
 * Usage (from backend/):
 *   npx tsx scripts/legacy-migrate/compare-policy-types.ts
 *
 * Requires DATABASE_URL (new) and DATABASE_URL_LEGACY (old) in .env
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createLegacyPool } from "./legacy-db.js";
import { mapPolicyTypeKey } from "./transform.js";
import { POLICY_TYPE_MAP } from "./config/migration.js";

const prisma = new PrismaClient();

type LegacyDist = { policy_type: string | null; cnt: number };

async function main() {
  const legacyUrl = process.env.DATABASE_URL_LEGACY ?? process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.error("Set DATABASE_URL_LEGACY in backend/.env");
    process.exit(1);
  }

  const pool = createLegacyPool(legacyUrl);

  const [legacyRows] = await pool.query<LegacyDist[]>(
    `SELECT policy_type, COUNT(*) AS cnt
     FROM policy_table
     GROUP BY policy_type
     ORDER BY cnt DESC`,
  );

  const newTypes = await prisma.policyType.findMany({
    orderBy: { key: "asc" },
    select: { id: true, key: true, name: true },
  });

  console.log("\n=== New DB: PolicyType master ===\n");
  console.table(newTypes.map((t) => ({ key: t.key, name: t.name, id: t.id })));

  console.log("\n=== Legacy DB: policy_table.policy_type (distinct) ===\n");
  const legacyTable = legacyRows.map((r) => {
    const raw = r.policy_type ?? "(null/empty)";
    const mapped = mapPolicyTypeKey(r.policy_type);
    return {
      legacy_policy_type: raw,
      count: Number(r.cnt),
      maps_to_key: mapped ?? "⚠ UNMAPPED",
    };
  });
  console.table(legacyTable);

  const unmapped = legacyTable.filter((r) => r.maps_to_key === "⚠ UNMAPPED");
  if (unmapped.length > 0) {
    console.log("\n⚠ Unmapped legacy values — add to POLICY_TYPE_MAP in config/migration.ts\n");
    for (const u of unmapped) {
      console.log(`  "${u.legacy_policy_type}" (${u.count} rows)`);
    }
  }

  console.log("\n=== Configured POLICY_TYPE_MAP keys ===\n");
  console.log(Object.entries(POLICY_TYPE_MAP).map(([k, v]) => `${k} → ${v.policyTypeKey}`).join("\n"));

  const policies = await prisma.policy.findMany({
    where: { referenceNo: { not: null }, deletedAt: null },
    select: {
      id: true,
      referenceNo: true,
      policyType: { select: { key: true, name: true } },
    },
    take: 500000,
  });

  let match = 0;
  let mismatch = 0;
  let missingLegacy = 0;
  let unmappedLegacy = 0;
  const mismatchSamples: Array<{
    referenceNo: string;
    legacy: string;
    expected: string;
    actual: string;
  }> = [];

  const mismatchByPair = new Map<string, number>();

  for (const p of policies) {
    const ref = p.referenceNo?.trim();
    if (!ref) continue;

    const [legacy] = await pool.query<{ policy_type: string | null }[]>(
      "SELECT policy_type FROM policy_table WHERE ref_no = ? LIMIT 1",
      [ref],
    );
    const legacyRow = legacy[0];
    if (!legacyRow) {
      missingLegacy++;
      continue;
    }

    const expectedKey = mapPolicyTypeKey(legacyRow.policy_type);
    if (!expectedKey) {
      unmappedLegacy++;
      continue;
    }

    const actualKey = p.policyType.key;
    if (actualKey === expectedKey) {
      match++;
    } else {
      mismatch++;
      const pair = `${legacyRow.policy_type ?? ""} → expected ${expectedKey}, got ${actualKey}`;
      mismatchByPair.set(pair, (mismatchByPair.get(pair) ?? 0) + 1);
      if (mismatchSamples.length < 25) {
        mismatchSamples.push({
          referenceNo: ref,
          legacy: String(legacyRow.policy_type ?? ""),
          expected: expectedKey,
          actual: actualKey,
        });
      }
    }
  }

  console.log("\n=== Migrated policies (new DB with referenceNo) vs legacy policy_type ===\n");
  console.table({
    total_with_ref: policies.length,
    match,
    mismatch,
    missing_in_legacy: missingLegacy,
    legacy_type_unmapped: unmappedLegacy,
  });

  if (mismatchByPair.size > 0) {
    console.log("\nMismatch summary (legacy → expected vs actual on new DB):\n");
    const sorted = [...mismatchByPair.entries()].sort((a, b) => b[1] - a[1]);
    console.table(
      sorted.map(([label, count]) => ({ mismatch_pattern: label, policies: count })),
    );
  }

  if (mismatchSamples.length > 0) {
    console.log("\nSample mismatched policies (up to 25):\n");
    console.table(mismatchSamples);
  }

  const distOnNew = await prisma.policy.groupBy({
    by: ["policyTypeId"],
    where: { deletedAt: null, referenceNo: { not: null } },
    _count: { id: true },
  });
  const typeById = new Map(newTypes.map((t) => [t.id, t]));
  console.log("\n=== New DB: migrated policies by current PolicyType ===\n");
  console.table(
    distOnNew
      .map((g) => ({
        key: typeById.get(g.policyTypeId)?.key ?? g.policyTypeId,
        name: typeById.get(g.policyTypeId)?.name ?? "?",
        policies: g._count.id,
      }))
      .sort((a, b) => b.policies - a.policies),
  );

  await pool.end();
  await prisma.$disconnect();

  if (mismatch > 0 || unmapped.length > 0) {
    console.log(
      "\nNext: run fix script (dry-run): npx tsx scripts/legacy-migrate/fix-policy-types.ts",
    );
    console.log("Then apply: npx tsx scripts/legacy-migrate/fix-policy-types.ts --apply\n");
    process.exit(1);
  }
  console.log("\n✓ Policy types align between legacy and new DB.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
