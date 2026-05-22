/**
 * Spot-check legacy policy_table rows vs migrated Policy / InsuredParty / PolicyYear.
 *
 * Usage:
 *   npm run legacy-migrate:compare-parties
 *   npm run legacy-migrate:compare-parties -- --refs=1649,1650,1689
 *   npm run legacy-migrate:compare-parties -- --limit=500
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createLegacyPool } from "./legacy-db.js";
import { parseDecimalSafe, transformPolicyRow } from "./transform.js";

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  if (hit) return hit.slice(flag.length);
  return undefined;
}

function decimalsEqual(a: number | null, b: number | null, eps = 0.01): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= eps;
}

interface RowMismatch {
  refNo: string;
  field: string;
  legacy: string;
  migrated: string;
}

async function main() {
  const legacyUrl =
    process.env.DATABASE_URL_LEGACY ??
    process.env.LEGACY_DATABASE_URL ??
    "mysql://root:root@localhost:3306/svkk_old_db";

  const refsArg = argValue("refs");
  const limit = Number(argValue("limit") ?? "0") || undefined;

  const pool = createLegacyPool(legacyUrl);

  let sql = "SELECT * FROM policy_table";
  const params: (string | number)[] = [];
  if (refsArg) {
    const refs = refsArg.split(",").map((r) => r.trim()).filter(Boolean);
    sql += ` WHERE ref_no IN (${refs.map(() => "?").join(",")})`;
    params.push(...refs);
  }
  sql += " ORDER BY ref_no ASC";
  if (limit) sql += " LIMIT ?";
  if (limit) params.push(limit);

  const [legacyRows] = await pool.query<import("./types.js").LegacyPolicyRow[]>(sql, params);

  const mismatches: RowMismatch[] = [];
  let matched = 0;
  let missingInNew = 0;
  let svkkPartyMismatch = 0;

  for (const row of legacyRows) {
    const t = transformPolicyRow(row);
    const policy = await prisma.policy.findUnique({
      where: { referenceNo: t.refNo },
      include: {
        insuredParty: true,
        years: { where: { yearLabel: t.yearLabel }, take: 1 },
      },
    });

    if (!policy) {
      missingInNew++;
      mismatches.push({
        refNo: t.refNo,
        field: "policy",
        legacy: "exists",
        migrated: "MISSING",
      });
      continue;
    }

    const party = policy.insuredParty;
    const year = policy.years[0];
    let rowOk = true;

    const push = (field: string, legacy: string, migrated: string) => {
      rowOk = false;
      mismatches.push({ refNo: t.refNo, field, legacy, migrated });
    };

    if (party.svkkPublicId !== t.svkkPublicId) {
      svkkPartyMismatch++;
      push("svkkPublicId", t.svkkPublicId, party.svkkPublicId);
    }

    if (t.customerId && party.customerId && party.customerId !== t.customerId) {
      push("customerId", t.customerId, party.customerId);
    }

    const legacyHolder = (row.policy_holder ?? "").trim();
    if (legacyHolder && party.name.trim() !== legacyHolder) {
      push("holderName", legacyHolder, party.name);
    }

    const legacyYear = (row.year && String(row.year).trim()) || "legacy";
    if (year && year.yearLabel !== legacyYear) {
      push("yearLabel", legacyYear, year.yearLabel);
    }

    const legacyVkk = parseDecimalSafe(row.vkk_premium);
    const migratedVkk = year?.vkkPremium ? Number(year.vkkPremium) : null;
    const legacyVkkNum = legacyVkk ? Number(legacyVkk) : null;
    if (!decimalsEqual(legacyVkkNum, migratedVkk)) {
      push(
        "vkkPremium",
        legacyVkkNum != null ? String(legacyVkkNum) : "(null)",
        migratedVkk != null ? String(migratedVkk) : "(null)",
      );
    }

    if (rowOk) matched++;
  }

  const [dupSvkk] = await pool.query<
    { svvk_id: string; holders: number; refs: number }[]
  >(
    `SELECT TRIM(svvk_id) AS svvk_id,
            COUNT(DISTINCT TRIM(policy_holder)) AS holders,
            COUNT(*) AS refs
     FROM policy_table
     WHERE svvk_id IS NOT NULL AND TRIM(svvk_id) != ''
     GROUP BY TRIM(svvk_id)
     HAVING holders > 1
     ORDER BY refs DESC
     LIMIT 20`,
  );

  const policiesPerParty = await prisma.$queryRaw<
    { svkkPublicId: string; partyName: string; policyCount: bigint }[]
  >`
    SELECT ip.svkkPublicId, ip.name AS partyName, COUNT(p.id) AS policyCount
    FROM insuredparty ip
    INNER JOIN policy p ON p.insuredPartyId = ip.id AND p.deletedAt IS NULL
    GROUP BY ip.id, ip.svkkPublicId, ip.name
    HAVING COUNT(p.id) > 1
    ORDER BY policyCount DESC
    LIMIT 20
  `;

  console.log("\n=== Policy / InsuredParty spot-check ===\n");
  console.log({
    legacyRowsChecked: legacyRows.length,
    matched,
    mismatches: mismatches.length,
    missingInNew,
    svkkPartyMismatch,
  });

  if (mismatches.length > 0) {
    console.log("\n--- Mismatches (first 50) ---\n");
    console.table(mismatches.slice(0, 50));
  }

  console.log("\n--- Legacy: same svvk_id, multiple distinct holders (sample) ---\n");
  console.table(
    dupSvkk.map((r) => ({
      svvk_id: r.svvk_id,
      distinct_holders: Number(r.holders),
      policy_rows: Number(r.refs),
    })),
  );

  console.log("\n--- New DB: InsuredParties with multiple policies (sample) ---\n");
  console.table(
    policiesPerParty.map((r) => ({
      svkkPublicId: r.svkkPublicId,
      partyName: r.partyName,
      policyCount: Number(r.policyCount),
    })),
  );

  const matchRate =
    legacyRows.length > 0 ? ((matched / legacyRows.length) * 100).toFixed(2) : "n/a";
  console.log(`\nMatch rate: ${matchRate}% (${matched}/${legacyRows.length})\n`);

  await pool.end();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
