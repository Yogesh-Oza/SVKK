import type { Prisma } from "@prisma/client";
import { maskInsuredParty } from "../../domain/pii.js";
import { type CategoryRef } from "../../lib/category-display.js";
import { prisma } from "../../lib/prisma.js";
import { parsePolicyListOrderBy, POLICY_LIST_EXPORT_MAX_ROWS } from "./policy.list.js";
import { buildPolicyCsvExportLayout } from "./policy-csv-export-layout.js";
import {
  buildLegacyPoliciesCsv,
  buildLegacyPolicyCsvCells,
  buildPolicyCsvSample,
  csvCell,
} from "./policy-csv-format.js";

const exportInclude = {
  insuredParty: true,
  policyType: { select: { key: true, name: true } },
  category: { select: { id: true, key: true, name: true } },
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    include: {
      members: { where: { deletedAt: null }, orderBy: { name: "asc" as const } },
      payments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const },
        include: {
          cheque: {
            select: {
              number: true,
              status: true,
              bankName: true,
              accountNo: true,
              branch: true,
              nameAsPerCheque: true,
              ifsc: true,
              notOver: true,
              chequeDate: true,
              reason: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PolicyInclude;

export type PolicyExportRow = Prisma.PolicyGetPayload<{ include: typeof exportInclude }>;

export { buildPolicyCsvSample };

export function pickExportPolicyYear(
  years: PolicyExportRow["years"],
  preferredYearLabels: string[],
): PolicyExportRow["years"][number] | undefined {
  if (!years.length) return undefined;
  if (preferredYearLabels.length) {
    for (const label of preferredYearLabels) {
      const found = years.find((y) => y.yearLabel === label);
      if (found) return found;
    }
    const any = years.find((y) => preferredYearLabels.includes(y.yearLabel));
    if (any) return any;
  }
  return years[0];
}

export function buildPoliciesExportCsv(
  rows: PolicyExportRow[],
  permissions: Set<string>,
  preferredYearLabels: string[] = [],
  categoryByKey: Map<string, CategoryRef> = new Map(),
): string {
  const parties = rows.map((r) =>
    maskInsuredParty(permissions, r.insuredParty as Record<string, unknown>),
  );
  const years = rows.map((r) => pickExportPolicyYear(r.years, preferredYearLabels));
  return buildLegacyPoliciesCsv(rows, parties, years, categoryByKey);
}

/** Single-row builder exposed for tests. */
export function buildPolicyExportCsvRow(
  row: PolicyExportRow,
  permissions: Set<string>,
  preferredYearLabels: string[] = [],
  categoryByKey: Map<string, CategoryRef> = new Map(),
): string[] {
  const party = maskInsuredParty(permissions, row.insuredParty as Record<string, unknown>);
  const year = pickExportPolicyYear(row.years, preferredYearLabels);
  const layout = buildPolicyCsvExportLayout(
    year?.members?.length ?? 0,
    year?.payments?.length ?? 0,
    year ? [year] : [],
  );
  return buildLegacyPolicyCsvCells(
    row,
    party,
    year,
    categoryByKey,
    layout.headers,
    layout.paymentPlan,
  );
}

export async function queryPolicyListForExport(args: {
  where: Prisma.PolicyWhereInput;
  sort: string | undefined;
}): Promise<PolicyExportRow[]> {
  const orderBy = parsePolicyListOrderBy(args.sort);
  return prisma.policy.findMany({
    where: args.where,
    orderBy,
    take: POLICY_LIST_EXPORT_MAX_ROWS,
    include: exportInclude,
  });
}

export { csvCell };
