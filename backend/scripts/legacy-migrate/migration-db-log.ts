import {
  MigrationLogStatus,
  MigrationPhase,
  type PrismaClient,
} from "@prisma/client";
import type { ErrorType, LogStatus } from "./types.js";

export async function writeMigrationLog(
  prisma: PrismaClient,
  migrationRunId: string,
  input: {
    refNo: string;
    entity: string;
    status: LogStatus;
    errorType: ErrorType;
    reason: string | null;
    warnings: string[];
    rawJson?: Record<string, unknown>;
  },
): Promise<void> {
  const statusMap: Record<LogStatus, MigrationLogStatus> = {
    SUCCESS: MigrationLogStatus.SUCCESS,
    FAILED: MigrationLogStatus.FAILED,
    SKIPPED: MigrationLogStatus.SKIPPED,
  };
  await prisma.migrationLog.create({
    data: {
      migrationRunId,
      refNo: input.refNo,
      entity: input.entity,
      status: statusMap[input.status],
      errorType: input.errorType,
      reason: input.reason,
      warnings: input.warnings,
      rawJson: input.rawJson ?? undefined,
    },
  });
}

export async function enqueueFailedRow(
  prisma: PrismaClient,
  migrationRunId: string,
  refNo: string,
  phase: MigrationPhase,
  errorType: string,
  reason: string,
): Promise<void> {
  await prisma.migrationFailedQueue.upsert({
    where: {
      migrationRunId_refNo_phase: { migrationRunId, refNo, phase },
    },
    create: {
      migrationRunId,
      refNo,
      phase,
      errorType,
      reason,
      attempts: 1,
      lastAttemptAt: new Date(),
    },
    update: {
      errorType,
      reason,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      resolvedAt: null,
    },
  });
}

export async function resolveFailedRow(
  prisma: PrismaClient,
  migrationRunId: string,
  refNo: string,
  phase: MigrationPhase,
): Promise<void> {
  await prisma.migrationFailedQueue.updateMany({
    where: { migrationRunId, refNo, phase },
    data: { resolvedAt: new Date() },
  });
}
