import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { stableStringify } from "../utils/stable-json.js";

const DEFAULT_TTL_H = 48;

function hashBody(body: unknown): string {
  return createHash("sha256").update(stableStringify(body)).digest("hex");
}

function expiresAt(ttlH: number): Date {
  return new Date(Date.now() + ttlH * 60 * 60 * 1000);
}

/**
 * @returns `null` if no record, or { response, httpStatus, bodyHash, conflict }.
 */
export async function resolveIdempotency(
  userId: string,
  idempotencyKey: string,
  body: unknown,
  ttlHours: number = Number(process.env.IDEMPOTENCY_TTL_HOURS) || DEFAULT_TTL_H,
): Promise<{
  hit: "miss" | "same" | "conflict";
  bodyHash: string;
  responseJson?: string;
  httpStatus?: number;
}> {
  const bodyHash = hashBody(body);
  const rec = await prisma.idempotencyRecord.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  if (!rec) {
    return { hit: "miss", bodyHash };
  }
  if (rec.bodyHash !== bodyHash) {
    return { hit: "conflict", bodyHash: rec.bodyHash };
  }
  return { hit: "same", bodyHash, responseJson: rec.responseJson, httpStatus: rec.httpStatus };
}

export function computeBodyHash(body: unknown): string {
  return hashBody(body);
}

/**
 * Prune old rows and store success response.
 */
export async function storeIdempotencyResult(
  userId: string,
  idempotencyKey: string,
  body: unknown,
  responseJson: string,
  httpStatus: number,
  ttlHours: number = Number(process.env.IDEMPOTENCY_TTL_HOURS) || DEFAULT_TTL_H,
): Promise<void> {
  const bodyHash = hashBody(body);
  const exp = expiresAt(ttlHours);
  await prisma.idempotencyRecord.upsert({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    create: {
      userId,
      idempotencyKey,
      bodyHash,
      responseJson,
      httpStatus,
      expiresAt: exp,
    },
    update: { bodyHash, responseJson, httpStatus, expiresAt: exp },
  });
}

/**
 * Best-effort cleanup of expired idempotency rows (e.g. call from cron or occasionally).
 */
export async function deleteExpiredIdempotencyRecords(): Promise<number> {
  const r = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return r.count;
}
