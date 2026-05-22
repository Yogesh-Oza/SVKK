/**
 * Roll back all entities tagged with a migration run id.
 */
import type { PrismaClient } from "@prisma/client";

export interface RollbackCounts {
  receipts: number;
  payments: number;
  cheques: number;
  members: number;
  policyYears: number;
  policies: number;
  parties: number;
}

export async function rollbackMigrationRun(
  prisma: PrismaClient,
  migrationRunId: string,
  dryRun: boolean,
): Promise<RollbackCounts> {
  const counts: RollbackCounts = {
    receipts: 0,
    payments: 0,
    cheques: 0,
    members: 0,
    policyYears: 0,
    policies: 0,
    parties: 0,
  };

  const run = await prisma.migrationRun.findUnique({ where: { id: migrationRunId } });
  if (!run) throw new Error(`Migration run not found: ${migrationRunId}`);
  if (run.status === "rolled_back") throw new Error(`Run already rolled back: ${migrationRunId}`);

  if (dryRun) {
    counts.receipts = await prisma.receipt.count({ where: { migratedRunId: migrationRunId } });
    counts.payments = await prisma.payment.count({ where: { migratedRunId: migrationRunId } });
    counts.cheques = await prisma.cheque.count({ where: { migratedRunId: migrationRunId } });
    counts.members = await prisma.member.count({ where: { migratedRunId: migrationRunId } });
    counts.policyYears = await prisma.policyYear.count({ where: { migratedRunId: migrationRunId } });
    counts.policies = await prisma.policy.count({ where: { migratedRunId: migrationRunId } });
    counts.parties = await prisma.insuredParty.count({
      where: {
        createdInMigrationRunId: migrationRunId,
        policies: { none: {} },
      },
    });
    return counts;
  }

  await prisma.$transaction(
    async (tx) => {
      const r1 = await tx.receipt.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.receipts = r1.count;

      const r2 = await tx.payment.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.payments = r2.count;

      const r3 = await tx.cheque.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.cheques = r3.count;

      const r4 = await tx.member.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.members = r4.count;

      const r5 = await tx.policyYear.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.policyYears = r5.count;

      const r6 = await tx.policy.deleteMany({ where: { migratedRunId: migrationRunId } });
      counts.policies = r6.count;

      const r7 = await tx.insuredParty.deleteMany({
        where: {
          createdInMigrationRunId: migrationRunId,
          policies: { none: {} },
        },
      });
      counts.parties = r7.count;

      await tx.migrationRun.update({
        where: { id: migrationRunId },
        data: { status: "rolled_back", isActive: false, finishedAt: new Date() },
      });
    },
    { maxWait: 60_000, timeout: 300_000 },
  );

  return counts;
}
