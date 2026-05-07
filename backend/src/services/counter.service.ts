import type { CounterType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Atomically allocate next counter value for type+period (MySQL row lock).
 */
export async function allocateCounter(
  type: CounterType,
  period: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const run = async (client: Prisma.TransactionClient): Promise<number> => {
    await client.counter.upsert({
      where: { type_period: { type, period } },
      create: { type, period, currentValue: 0 },
      update: {},
    });
    await client.$executeRaw`
      SELECT id FROM Counter WHERE type = ${type} AND period = ${period} FOR UPDATE
    `;
    const updated = await client.counter.update({
      where: { type_period: { type, period } },
      data: { currentValue: { increment: 1 } },
    });
    return updated.currentValue;
  };

  if (tx) return run(tx);
  return prisma.$transaction((client) => run(client));
}

export function formatSvkkId(period: string, seq: number): string {
  return `SVKK-${period}-${String(seq).padStart(6, "0")}`;
}

export function formatPolicyPublicId(grouping: string, monthShort: string, seq: number): string {
  const g = grouping.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const m = monthShort.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 3);
  return `${g}${m}${String(seq).padStart(4, "0")}`;
}

export function formatPolicyReferenceNo(grouping: string, year4: string, monthShort: string, seq: number): string {
  const g = grouping.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const y = String(year4).replace(/\D/g, "").slice(-4);
  const m = monthShort.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 3);
  return `${g}${y}${m}${String(seq).padStart(4, "0")}`;
}

export function formatReceiptNo(period: string, seq: number): string {
  return `REC-${period}-${String(seq).padStart(6, "0")}`;
}
