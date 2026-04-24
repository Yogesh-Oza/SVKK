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

export function formatReceiptNo(period: string, seq: number): string {
  return `REC-${period}-${String(seq).padStart(6, "0")}`;
}
