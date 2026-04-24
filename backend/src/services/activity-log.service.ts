import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const MAX_JSON_BYTES = 10_240;

function jsonByteLength(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v ?? null), "utf8");
}

/**
 * Persist audit log; spill large payloads to null in DB (Phase 1: omit S3 upload — store truncated summary in afterData).
 */
export async function writeActivityLog(input: {
  userId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Prisma.InputJsonValue | null;
  afterData?: Prisma.InputJsonValue | null;
}) {
  let beforeData = input.beforeData ?? undefined;
  let afterData = input.afterData ?? undefined;
  let beforePayloadS3Key: string | null = null;
  let afterPayloadS3Key: string | null = null;

  if (beforeData !== undefined && jsonByteLength(beforeData) > MAX_JSON_BYTES) {
    beforePayloadS3Key = "overflow:pending";
    beforeData = { _truncated: true, bytes: jsonByteLength(beforeData) };
  }
  if (afterData !== undefined && jsonByteLength(afterData) > MAX_JSON_BYTES) {
    afterPayloadS3Key = "overflow:pending";
    afterData = { _truncated: true, bytes: jsonByteLength(afterData) };
  }

  await prisma.activityLog.create({
    data: {
      userId: input.userId ?? undefined,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData,
      afterData,
      beforePayloadS3Key: beforePayloadS3Key ?? undefined,
      afterPayloadS3Key: afterPayloadS3Key ?? undefined,
    },
  });
}
