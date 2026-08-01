import { prisma } from "../../lib/prisma.js";
import {
  classifyPolicyRenewalStatus,
  pickLatestPolicy,
  utcDayStart,
  type PolicyRenewalStatus,
} from "./renewal-pending.js";

export async function resolvePolicyRenewalStatus(
  policy: {
    id: string;
    insuredPartyId: string;
    periodYearText?: string | null;
    createdAt: Date;
    years: Array<{ policyEnd: Date | null }>;
  },
  asOf: Date = utcDayStart(new Date()),
): Promise<PolicyRenewalStatus> {
  const siblings = await prisma.policy.findMany({
    where: { deletedAt: null, insuredPartyId: policy.insuredPartyId },
    select: {
      id: true,
      periodYearText: true,
      createdAt: true,
    },
  });
  const latestId = pickLatestPolicy(siblings)?.id;
  const isLatest = policy.id === latestId;
  const ends = policy.years.map((y) => y.policyEnd).filter((d): d is Date => d != null);
  const policyEnd =
    ends.length > 0
      ? new Date(Math.max(...ends.map((d) => d.getTime())))
      : (policy.years[0]?.policyEnd ?? null);
  return classifyPolicyRenewalStatus({ isLatest, policyEnd, asOf });
}
