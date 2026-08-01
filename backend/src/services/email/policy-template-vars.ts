import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
  resolvePolicyHolderEmail,
  resolvePolicyHolderName,
} from "../../modules/policy/policy-holder-snapshot.js";
import { formatDateDmy, policyDocumentLinkHtml, resolveNotificationLinks } from "../notification/policy-url.js";

export type PolicyBundle = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  policyUrl: string | null;
  policyUrl2: string | null;
  createdById?: string | null;
  holderName?: string | null;
  holderEmail?: string | null;
  insuredParty: { name: string; email: string | null; svkkPublicId: string };
  years: { yearLabel: string; policyEnd: Date | null }[];
};

const policyBundleSelect = {
  id: true,
  policyNo: true,
  referenceNo: true,
  village: true,
  policyUrl: true,
  policyUrl2: true,
  createdById: true,
  holderName: true,
  holderEmail: true,
  insuredParty: { select: { name: true, email: true, svkkPublicId: true } },
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    take: 1,
    select: { yearLabel: true, policyEnd: true },
  },
} as const;

export async function loadPolicyBundle(policyId: string): Promise<PolicyBundle | null> {
  return prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    select: policyBundleSelect,
  });
}

export function holderEmailFromBundle(p: PolicyBundle): string | null {
  return resolvePolicyHolderEmail(p, p.insuredParty);
}

export function holderNameFromBundle(p: PolicyBundle): string {
  return resolvePolicyHolderName(p, p.insuredParty);
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
    holderName: holderNameFromBundle(p),
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

export { policyBundleSelect };
