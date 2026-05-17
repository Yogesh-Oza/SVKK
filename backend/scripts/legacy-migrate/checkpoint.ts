import { MigrationPhase, type PrismaClient } from "@prisma/client";

export async function loadCheckpointRefNo(
  prisma: PrismaClient,
  migrationRunId: string,
  phase: MigrationPhase = MigrationPhase.policies,
): Promise<string | null> {
  const cp = await prisma.migrationCheckpoint.findUnique({
    where: { migrationRunId_phase: { migrationRunId, phase } },
  });
  return cp?.lastRefNo ?? null;
}

export async function saveCheckpoint(
  prisma: PrismaClient,
  migrationRunId: string,
  phase: MigrationPhase,
  lastRefNo: string,
  rowsProcessed: number,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.migrationCheckpoint.upsert({
      where: { migrationRunId_phase: { migrationRunId, phase } },
      create: { migrationRunId, phase, lastRefNo, rowsProcessed, updatedAt: now },
      update: { lastRefNo, rowsProcessed, updatedAt: now },
    }),
    prisma.migrationRun.update({
      where: { id: migrationRunId },
      data: { lastCheckpointRefNo: lastRefNo, lastHeartbeatAt: now },
    }),
  ]);
}

export async function saveMastersCheckpoint(
  prisma: PrismaClient,
  migrationRunId: string,
): Promise<void> {
  await prisma.migrationCheckpoint.upsert({
    where: { migrationRunId_phase: { migrationRunId, phase: MigrationPhase.masters } },
    create: {
      migrationRunId,
      phase: MigrationPhase.masters,
      lastRefNo: null,
      rowsProcessed: 0,
    },
    update: { updatedAt: new Date() },
  });
}
