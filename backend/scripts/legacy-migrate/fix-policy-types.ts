/**
 * Re-align policy.policyTypeId on the new DB from legacy policy_table.policy_type (via referenceNo).
 *
 * Usage (from backend/):
 *   npx tsx scripts/legacy-migrate/fix-policy-types.ts           # dry-run
 *   npx tsx scripts/legacy-migrate/fix-policy-types.ts --apply   # update DB
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createLegacyPool } from "./legacy-db.js";
import { mapPolicyTypeKey } from "./transform.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const legacyUrl = process.env.DATABASE_URL_LEGACY ?? process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.error("Set DATABASE_URL_LEGACY in backend/.env");
    process.exit(1);
  }

  const pool = createLegacyPool(legacyUrl);
  const types = await prisma.policyType.findMany({ select: { id: true, key: true, name: true } });
  const typeIdByKey = new Map(types.map((t) => [t.key, t.id]));

  console.log(`\nMode: ${apply ? "APPLY (writes)" : "DRY-RUN (no writes)"}\n`);
  console.table(types.map((t) => ({ key: t.key, name: t.name })));

  const [legacyRows] = await pool.query<{ ref_no: string; policy_type: string | null }[]>(
    "SELECT ref_no, policy_type FROM policy_table WHERE ref_no IS NOT NULL AND ref_no != ''",
  );
  const legacyKeyByRef = new Map<string, string>();
  for (const row of legacyRows) {
    const key = mapPolicyTypeKey(row.policy_type);
    if (key) legacyKeyByRef.set(row.ref_no, key);
  }

  const policies = await prisma.policy.findMany({
    where: { referenceNo: { not: null }, deletedAt: null },
    select: { id: true, referenceNo: true, policyTypeId: true, policyType: { select: { key: true } } },
  });

  const idsByTargetTypeId = new Map<string, string[]>();
  let skippedOk = 0;
  let skippedUnmapped = 0;
  let skippedMissingLegacy = 0;
  let skippedMissingType = 0;
  const changes: Array<{ referenceNo: string; legacy: string; from: string; to: string }> = [];

  for (const p of policies) {
    const ref = p.referenceNo?.trim();
    if (!ref) continue;

    const expectedKey = legacyKeyByRef.get(ref);
    if (!expectedKey) {
      if (legacyRows.some((r) => r.ref_no === ref)) skippedUnmapped++;
      else skippedMissingLegacy++;
      continue;
    }

    const targetId = typeIdByKey.get(expectedKey);
    if (!targetId) {
      skippedMissingType++;
      continue;
    }

    if (p.policyTypeId === targetId) {
      skippedOk++;
      continue;
    }

    const bucket = idsByTargetTypeId.get(targetId) ?? [];
    bucket.push(p.id);
    idsByTargetTypeId.set(targetId, bucket);

    if (changes.length < 30) {
      changes.push({
        referenceNo: ref,
        legacy: expectedKey,
        from: p.policyType.key,
        to: expectedKey,
      });
    }
  }

  let updated = 0;
  if (apply) {
    for (const [targetTypeId, ids] of idsByTargetTypeId) {
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const r = await prisma.policy.updateMany({
          where: { id: { in: slice } },
          data: { policyTypeId: targetTypeId },
        });
        updated += r.count;
      }
    }
  } else {
    for (const ids of idsByTargetTypeId.values()) updated += ids.length;
  }

  console.log("\n=== Result ===\n");
  console.table({
    scanned: policies.length,
    already_correct: skippedOk,
    would_update: updated,
    legacy_row_missing: skippedMissingLegacy,
    legacy_type_unmapped: skippedUnmapped,
    target_type_missing_on_new_db: skippedMissingType,
    update_batches: idsByTargetTypeId.size,
  });

  if (changes.length > 0) {
    console.log("\nSample changes:\n");
    console.table(changes);
  }

  await pool.end();
  await prisma.$disconnect();

  if (!apply && updated > 0) {
    console.log(`\nRe-run with --apply to update ${updated} policies.\n`);
  } else if (apply && updated > 0) {
    console.log(`\n✓ Updated ${updated} policies.\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
