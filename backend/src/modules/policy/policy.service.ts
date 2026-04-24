import type { PolicyChart, Prisma } from "@prisma/client";
import { CounterType, ChartMode, PolicyChartKind } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { normalizeMobile } from "../../domain/phone.js";
import { allocateCounter, formatSvkkId } from "../../services/counter.service.js";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";

export interface CreatePolicyInput {
  actorUserId: string;
  mobile: string;
  partyName: string;
  email?: string | null;
  policyTypeId: string;
  yearLabel: string;
  policyChartId: string;
  policyStart?: Date | null;
  policyEnd?: Date | null;
  sumInsured: number;
  policyNo?: string | null;
  village?: string | null;
  members: {
    name: string;
    dob: Date;
    relationship: string;
    gender: string;
    riderAmount?: number;
  }[];
}

export async function createPolicyWithYear(input: CreatePolicyInput) {
  const mobile = normalizeMobile(input.mobile);
  const period = String(new Date().getFullYear());

  const chart = await prisma.policyChart.findUnique({
    where: { id: input.policyChartId },
    include: { policyType: true },
  });
  if (!chart) {
    throw new AppError("CHART_NOT_FOUND", "policyChartId invalid", 400);
  }
  if (chart.policyTypeId !== input.policyTypeId) {
    throw new AppError("CHART_TYPE_MISMATCH", "Chart does not belong to policy type", 400);
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let party = await tx.insuredParty.findUnique({ where: { mobile } });
    if (!party) {
      const seq = await allocateCounter(CounterType.SVKK_PUBLIC_ID, period, tx);
      const svkkPublicId = formatSvkkId(period, seq);
      party = await tx.insuredParty.create({
        data: {
          mobile,
          svkkPublicId,
          name: input.partyName,
          email: input.email ?? undefined,
        },
      });
    }

    const policy = await tx.policy.create({
      data: {
        insuredPartyId: party.id,
        policyTypeId: input.policyTypeId,
        policyNo: input.policyNo ?? undefined,
        village: input.village ?? undefined,
      },
    });

    const year = await tx.policyYear.create({
      data: {
        policyId: policy.id,
        yearLabel: input.yearLabel,
        policyChartId: input.policyChartId,
        policyStart: input.policyStart ?? undefined,
        policyEnd: input.policyEnd ?? undefined,
        sumInsured: input.sumInsured,
      },
    });

    for (const m of input.members) {
      await tx.member.create({
        data: {
          policyYearId: year.id,
          name: m.name,
          dob: m.dob,
          relationship: m.relationship,
          gender: m.gender,
          riderAmount: m.riderAmount ?? 0,
        },
      });
    }

    return { party, policy, year };
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_CREATED",
    entityType: "Policy",
    entityId: result.policy.id,
    afterData: { policyId: result.policy.id, yearId: result.year.id } as unknown as Prisma.InputJsonValue,
  });

  return result;
}

export async function resolveChartsForType(
  policyTypeId: string,
  policyChartId: string,
): Promise<{ chartMode: ChartMode; holder: PolicyChart; member: PolicyChart | null }> {
  const pt = await prisma.policyType.findUnique({
    where: { id: policyTypeId },
  });
  if (!pt) throw new AppError("POLICY_TYPE_NOT_FOUND", "Invalid policy type", 400);

  const primary = await prisma.policyChart.findUnique({ where: { id: policyChartId } });
  if (!primary || primary.policyTypeId !== policyTypeId) {
    throw new AppError("CHART_NOT_FOUND", "Invalid chart for type", 400);
  }

  if (pt.chartMode === ChartMode.SINGLE) {
    return { chartMode: pt.chartMode, holder: primary, member: null };
  }

  const holder =
    primary.chartKind === PolicyChartKind.HOLDER || primary.chartKind === PolicyChartKind.COMBINED
      ? primary
      : await prisma.policyChart.findFirst({
          where: {
            policyTypeId,
            version: primary.version,
            chartKind: PolicyChartKind.HOLDER,
          },
        });
  if (!holder) throw new AppError("CHART_NOT_FOUND", "Holder chart missing", 400);

  const member =
    primary.chartKind === PolicyChartKind.MEMBER
      ? primary
      : await prisma.policyChart.findFirst({
          where: {
            policyTypeId,
            version: primary.version,
            chartKind: PolicyChartKind.MEMBER,
          },
        });

  return { chartMode: pt.chartMode, holder, member };
}
