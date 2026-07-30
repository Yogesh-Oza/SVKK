import type { Prisma } from "@prisma/client";
import { loadCategoryByKeyMap, resolveCategoryRef } from "../../lib/category-display.js";
import { prisma } from "../../lib/prisma.js";
import { parsePolicyListOrderBy } from "./policy.list.js";
import {
  policyDetailForFormInclude,
  serializePolicyDetailForApi,
  stripCommissionFromPolicyYears,
} from "./policy-detail-read.js";

const BULK_LOAD_CHUNK = 25;

/** Max policies returned in one Future Premium bulk-details response. */
export const FUTURE_PREMIUM_DETAILS_MAX = 10_000;

export type FuturePremiumPolicyDetailItem = {
  id: string;
  periodYearText: string | null;
  detail: ReturnType<typeof serializePolicyDetailForApi>;
};

export async function queryFuturePremiumPolicyDetails(
  where: Prisma.PolicyWhereInput,
  sort: string | undefined,
  permissions: Set<string>,
): Promise<{ items: FuturePremiumPolicyDetailItem[]; total: number; truncated: boolean }> {
  const total = await prisma.policy.count({ where });
  const take = Math.min(total, FUTURE_PREMIUM_DETAILS_MAX);
  const listRows = await prisma.policy.findMany({
    where,
    orderBy: parsePolicyListOrderBy(sort),
    take,
    select: { id: true, periodYearText: true },
  });

  const categoryByKey = await loadCategoryByKeyMap();
  const items: FuturePremiumPolicyDetailItem[] = [];

  for (let i = 0; i < listRows.length; i += BULK_LOAD_CHUNK) {
    const chunk = listRows.slice(i, i + BULK_LOAD_CHUNK);
    const ids = chunk.map((row) => row.id);
    const policies = await prisma.policy.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: policyDetailForFormInclude,
    });
    const byId = new Map(policies.map((policy) => [policy.id, policy]));

    for (const row of chunk) {
      const policy = byId.get(row.id);
      if (!policy) continue;
      stripCommissionFromPolicyYears(policy, permissions);
      const category = resolveCategoryRef(policy.category, policy.categoryText, categoryByKey);
      items.push({
        id: row.id,
        periodYearText: row.periodYearText,
        detail: serializePolicyDetailForApi(policy, permissions, category),
      });
    }
  }

  return {
    items,
    total,
    truncated: total > FUTURE_PREMIUM_DETAILS_MAX,
  };
}
