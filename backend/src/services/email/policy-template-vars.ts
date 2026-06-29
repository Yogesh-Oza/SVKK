import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { formatDateDmy, policyDocumentLinkHtml, resolveNotificationLinks } from "../notification/policy-url.js";

export type PolicyBundle = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  policyUrl: string | null;
  policyUrl2: string | null;
  createdById?: string | null;
  insuredParty: { name: string; email: string | null; svkkPublicId: string };
  years: { yearLabel: string; policyEnd: Date | null }[];
};

export async function loadPolicyBundle(policyId: string): Promise<PolicyBundle | null> {
  return prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    select: {
      id: true,
      policyNo: true,
      referenceNo: true,
      village: true,
      policyUrl: true,
      policyUrl2: true,
      createdById: true,
      insuredParty: { select: { name: true, email: true, svkkPublicId: true } },
      years: {
        where: { deletedAt: null },
        orderBy: { yearLabel: "desc" },
        take: 1,
        select: { yearLabel: true, policyEnd: true },
      },
    },
  });
}

export function templateVarsFromPolicy(
  env: Env,
  p: PolicyBundle,
  yearLabel?: string,
  policyEnd?: Date | null,
): Record<string, string> {
  const links = resolveNotificationLinks(env, p);
  const documentUrl = links.policyDocumentUrl;
  return {
    holderName: p.insuredParty.name,
    svkkPublicId: p.insuredParty.svkkPublicId,
    referenceNo: p.referenceNo ?? "—",
    policyNo: p.policyNo ?? "—",
    village: p.village ?? "—",
    yearLabel: yearLabel ?? p.years[0]?.yearLabel ?? "—",
    policyEndDate: formatDateDmy(policyEnd ?? p.years[0]?.policyEnd),
    policyUrl: documentUrl,
    documentUrl,
    policyDocumentLink: policyDocumentLinkHtml(documentUrl || null),
    appPolicyUrl: links.appPolicyUrl,
  };
}
