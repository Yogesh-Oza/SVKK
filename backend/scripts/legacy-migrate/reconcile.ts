import type { Pool } from "mysql2/promise";
import type { PrismaClient } from "@prisma/client";

export interface ReconcileTotals {
  policyCount: number;
  memberCount: number;
  sumInsuredTotal: number;
  vkkPremiumTotal: number;
  paymentRowCount: number;
  distinctVillages: number;
}

export interface ReconcileReport {
  legacy: ReconcileTotals;
  migrated: ReconcileTotals;
  deltas: Partial<Record<keyof ReconcileTotals, number>>;
  passed: boolean;
}

async function legacyTotals(pool: Pool): Promise<ReconcileTotals> {
  const [policyRows] = await pool.query<
    [{ cnt: bigint; si: string | null; vkk: string | null; villages: bigint }]
  >(
    `SELECT
      COUNT(*) AS cnt,
      SUM(CAST(NULLIF(REPLACE(REPLACE(IFNULL(sum_insured,''), ',', ''), '-', ''), '') AS DECIMAL(18,2))) AS si,
      SUM(CAST(NULLIF(REPLACE(REPLACE(IFNULL(vkk_premium,''), ',', ''), '-', ''), '') AS DECIMAL(18,2))) AS vkk,
      COUNT(DISTINCT village) AS villages
     FROM policy_table`,
  );
  const [memberRows] = await pool.query<[{ cnt: bigint }]>(
    "SELECT COUNT(*) AS cnt FROM member",
  );
  const [payRows] = await pool.query<[{ cnt: bigint }]>(
    `SELECT COUNT(*) AS cnt FROM policy_table
     WHERE policy_cheque_no IS NOT NULL AND TRIM(policy_cheque_no) != ''`,
  );

  const p = policyRows[0]!;
  return {
    policyCount: Number(p.cnt ?? 0),
    memberCount: Number(memberRows[0]?.cnt ?? 0),
    sumInsuredTotal: Number(p.si ?? 0),
    vkkPremiumTotal: Number(p.vkk ?? 0),
    paymentRowCount: Number(payRows[0]?.cnt ?? 0),
    distinctVillages: Number(p.villages ?? 0),
  };
}

async function migratedTotals(
  prisma: PrismaClient,
  migrationRunId: string | null,
): Promise<ReconcileTotals> {
  const policyWhere = migrationRunId ? { migratedRunId: migrationRunId } : {};
  const policyCount = await prisma.policy.count({ where: policyWhere });

  const members = await prisma.member.count({
    where: migrationRunId
      ? { migratedRunId: migrationRunId }
      : {},
  });

  const years = await prisma.policyYear.findMany({
    where: migrationRunId ? { migratedRunId: migrationRunId } : {},
    select: { sumInsured: true, vkkPremium: true },
  });
  let sumInsuredTotal = 0;
  let vkkPremiumTotal = 0;
  for (const y of years) {
    if (y.sumInsured) sumInsuredTotal += Number(y.sumInsured);
    if (y.vkkPremium) vkkPremiumTotal += Number(y.vkkPremium);
  }

  const paymentRowCount = await prisma.payment.count({
    where: migrationRunId ? { migratedRunId: migrationRunId } : {},
  });

  const villages = await prisma.policy.findMany({
    where: policyWhere,
    select: { village: true },
    distinct: ["village"],
  });
  const distinctVillages = villages.filter((v) => v.village).length;

  return {
    policyCount,
    memberCount: members,
    sumInsuredTotal,
    vkkPremiumTotal,
    paymentRowCount,
    distinctVillages,
  };
}

export async function runReconciliation(
  prisma: PrismaClient,
  legacyPool: Pool,
  migrationRunId: string | null,
  premiumTolerancePct = 0.01,
): Promise<ReconcileReport> {
  const legacy = await legacyTotals(legacyPool);
  const migrated = await migratedTotals(prisma, migrationRunId);

  const deltas: ReconcileReport["deltas"] = {
    policyCount: migrated.policyCount - legacy.policyCount,
    memberCount: migrated.memberCount - legacy.memberCount,
    sumInsuredTotal: migrated.sumInsuredTotal - legacy.sumInsuredTotal,
    vkkPremiumTotal: migrated.vkkPremiumTotal - legacy.vkkPremiumTotal,
    paymentRowCount: migrated.paymentRowCount - legacy.paymentRowCount,
    distinctVillages: migrated.distinctVillages - legacy.distinctVillages,
  };

  const premiumOk =
    legacy.vkkPremiumTotal === 0 ||
    Math.abs(deltas.vkkPremiumTotal ?? 0) / legacy.vkkPremiumTotal <= premiumTolerancePct;

  const passed =
    deltas.policyCount === 0 &&
    deltas.memberCount === 0 &&
    premiumOk;

  return { legacy, migrated, deltas, passed };
}

export async function persistReconciliationAudit(
  prisma: PrismaClient,
  migrationRunId: string,
  report: ReconcileReport,
  counters: {
    policies: number;
    members: number;
    payments: number;
    cheques: number;
    receipts: number;
    skipped: number;
    failed: number;
    dropdownsCreated: number;
  },
): Promise<void> {
  await prisma.migrationAudit.upsert({
    where: { migrationRunId },
    create: {
      migrationRunId,
      legacyTotals: report.legacy,
      newTotals: report.migrated,
      deltas: report.deltas,
      ...counters,
    },
    update: {
      legacyTotals: report.legacy,
      newTotals: report.migrated,
      deltas: report.deltas,
      ...counters,
    },
  });
}
