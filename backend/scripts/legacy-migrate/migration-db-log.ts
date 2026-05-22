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

export async function resolveFailedRows(
  prisma: PrismaClient,
  migrationRunId: string,
  refNos: string[],
  phase: MigrationPhase,
): Promise<void> {
  if (refNos.length === 0) return;
  await prisma.migrationFailedQueue.updateMany({
    where: { migrationRunId, refNo: { in: refNos }, phase },
    data: { resolvedAt: new Date() },
  });
}

type BufferedLogInput = Parameters<typeof writeMigrationLog>[2];

const statusMap: Record<LogStatus, MigrationLogStatus> = {
  SUCCESS: MigrationLogStatus.SUCCESS,
  FAILED: MigrationLogStatus.FAILED,
  SKIPPED: MigrationLogStatus.SKIPPED,
};

/** Buffers MigrationLog rows and flushes with createMany to cut per-row INSERT round trips. */
export class MigrationLogBuffer {
  private pending: BufferedLogInput[] = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly migrationRunId: string,
    private readonly flushSize = 100,
  ) {}

  queue(input: BufferedLogInput): void {
    this.pending.push(input);
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const slice = this.pending.splice(0, this.pending.length);
    await this.prisma.migrationLog.createMany({
      data: slice.map((input) => ({
        migrationRunId: this.migrationRunId,
        refNo: input.refNo,
        entity: input.entity,
        status: statusMap[input.status],
        errorType: input.errorType,
        reason: input.reason,
        warnings: input.warnings,
        rawJson: input.rawJson ?? undefined,
      })),
    });
  }

  async queueAndMaybeFlush(input: BufferedLogInput): Promise<void> {
    this.queue(input);
    if (this.pending.length >= this.flushSize) {
      await this.flush();
    }
  }
}
