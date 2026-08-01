import type { Prisma } from "@prisma/client";
import type { CategoryRef } from "../../lib/category-display.js";
import { maskInsuredParty } from "../../domain/pii.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";
import { policyYearPaymentsInclude } from "./policy.service.js";
import { overlayInsuredPartyWithPolicySnapshot } from "./policy-holder-snapshot.js";
import type { PolicyRenewalStatus } from "./renewal-pending.js";

export const policyDetailForFormInclude = {
  insuredParty: true,
  policyType: true,
  category: true,
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    include: {
      members: { where: { deletedAt: null } },
      policyChart: true,
      payments: policyYearPaymentsInclude,
      receipts: {
        orderBy: { createdAt: "asc" as const },
        take: 1,
        select: { receiptNo: true, policyDate: true, createdAt: true },
      },
    },
  },
} satisfies Prisma.PolicyInclude;

export type PolicyDetailForFormRow = Prisma.PolicyGetPayload<{
  include: typeof policyDetailForFormInclude;
}>;

function maskPolicyInsuredParty(
  permissions: Set<string>,
  policy: {
    insuredParty: {
      name: string;
      dateOfBirth?: Date | null;
      pan?: string | null;
      aadhaarNo?: string | null;
      customerId?: string | null;
      email?: string | null;
      mobile?: string | null;
    };
    holderName?: string | null;
    holderDateOfBirth?: Date | null;
    holderPan?: string | null;
    holderAadhaarNo?: string | null;
    holderCustomerId?: string | null;
    holderEmail?: string | null;
    holderMobile?: string | null;
  },
) {
  return maskInsuredParty(
    permissions,
    overlayInsuredPartyWithPolicySnapshot(policy.insuredParty, policy) ?? null,
  );
}

export function stripCommissionFromPolicyYears(
  row: PolicyDetailForFormRow,
  permissions: Set<string>,
): void {
  if (!hasPermissionInSet(permissions, "policy:commission")) {
    for (const y of row.years) {
      (y as unknown as { commissionAmount?: null }).commissionAmount = null;
      (y as unknown as { vkkCommission?: null }).vkkCommission = null;
    }
  }
}

export function serializePolicyDetailForApi(
  row: PolicyDetailForFormRow,
  permissions: Set<string>,
  category: CategoryRef | null,
  renewalStatus?: PolicyRenewalStatus,
) {
  return {
    ...row,
    category,
    insuredParty: maskPolicyInsuredParty(permissions, row),
    renewalStatus: renewalStatus ?? null,
  };
}
