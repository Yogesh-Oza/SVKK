import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { invalidateChartCache } from "../premium/chart-cache.js";

export async function deletePolicyType(id: string): Promise<void> {
  const policyType = await prisma.policyType.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!policyType) {
    throw new AppError("NOT_FOUND", "Policy type not found", 404);
  }

  const [policyCount, yearCount] = await Promise.all([
    prisma.policy.count({
      where: { policyTypeId: id, deletedAt: null },
    }),
    prisma.policyYear.count({
      where: {
        deletedAt: null,
        policyChart: { policyTypeId: id },
      },
    }),
  ]);

  if (policyCount > 0 || yearCount > 0) {
    const parts: string[] = [];
    if (policyCount > 0) {
      parts.push(`${policyCount} active polic${policyCount === 1 ? "y" : "ies"}`);
    }
    if (yearCount > 0 && yearCount !== policyCount) {
      parts.push(`${yearCount} policy year record${yearCount === 1 ? "" : "s"} linked to its charts`);
    }
    throw new AppError(
      "CONFLICT",
      `Cannot delete "${policyType.name}": ${parts.join(" and ")} still use this type. Remove or reassign those policies first.`,
      409,
    );
  }

  const charts = await prisma.policyChart.findMany({
    where: { policyTypeId: id },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.policyChart.deleteMany({ where: { policyTypeId: id } });
    await tx.policyType.delete({ where: { id } });
  });

  for (const chart of charts) {
    invalidateChartCache(chart.id);
  }
}
