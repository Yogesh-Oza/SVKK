import type { PrismaClient } from "@prisma/client";
import { CURRENT_VERSION } from "./config/migration.js";

export class MigrationGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationGuardError";
  }
}

export async function assertNoConflictingActiveRun(
  prisma: PrismaClient,
  resumeRunId: string | undefined,
  applyMode: boolean,
): Promise<void> {
  if (!applyMode) return;

  const activeRun = await prisma.migrationRun.findFirst({
    where: { status: "running", isActive: true },
    orderBy: { startedAt: "desc" },
  });

  if (activeRun && activeRun.id !== resumeRunId) {
    throw new MigrationGuardError(
      `Migration already running (runId=${activeRun.id}). ` +
        `Wait for completion or use --resume=${activeRun.id}`,
    );
  }
}

export async function assertVersionMatch(
  prisma: PrismaClient,
  runId: string,
): Promise<{ id: string; migrationVersion: string }> {
  const run = await prisma.migrationRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new MigrationGuardError(`Migration run not found: ${runId}`);
  }
  if (run.migrationVersion !== CURRENT_VERSION) {
    throw new MigrationGuardError(
      `Migration version mismatch: run=${run.migrationVersion} code=${CURRENT_VERSION}. ` +
        `Cannot resume. Roll back run ${runId} or start a new run with current code.`,
    );
  }
  return run;
}

export async function unlockStaleRuns(
  prisma: PrismaClient,
  staleMinutes: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const result = await prisma.migrationRun.updateMany({
    where: {
      status: "running",
      isActive: true,
      OR: [
        { lastHeartbeatAt: { lt: cutoff } },
        { lastHeartbeatAt: null, startedAt: { lt: cutoff } },
      ],
    },
    data: { status: "failed", isActive: false, finishedAt: new Date() },
  });
  return result.count;
}

export async function forceDeactivateRun(prisma: PrismaClient, runId: string): Promise<void> {
  await prisma.migrationRun.update({
    where: { id: runId },
    data: { isActive: false, status: "failed", finishedAt: new Date() },
  });
}
