import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { normalizePolicyNo } from "../src/modules/claim/claim-csv-normalize.js";
import { buildClaimImportPolicyCache, matchPolicyForClaim, buildClaimImportTypeCache } from "../src/modules/claim/claim-policy-match.js";

const TARGET = "PO- 14010061252800002364";

async function main() {
  const key = normalizePolicyNo(TARGET);
  console.log("normalized key:", key);

  const all = await prisma.policy.findMany({
    select: {
      id: true,
      policyNo: true,
      archivedPolicyNo: true,
      deletedAt: true,
      holderName: true,
      policyType: { select: { key: true, name: true } },
      insuredParty: { select: { svkkPublicId: true, name: true } },
    },
  });

  const hits = all.filter((p) => {
    const live = normalizePolicyNo(p.policyNo);
    const archived = normalizePolicyNo(p.archivedPolicyNo);
    return live === key || archived === key || live.includes("14010061252800002364") || archived.includes("14010061252800002364");
  });

  console.log("\nDB hits (live + archived + deleted):", hits.length);
  for (const p of hits) {
    console.log({
      id: p.id,
      policyNo: JSON.stringify(p.policyNo),
      archivedPolicyNo: JSON.stringify(p.archivedPolicyNo),
      deletedAt: p.deletedAt,
      holder: p.holderName ?? p.insuredParty.name,
      type: p.policyType.name,
      svkk: p.insuredParty.svkkPublicId,
      liveKey: normalizePolicyNo(p.policyNo),
    });
  }

  const cache = await buildClaimImportPolicyCache();
  const bucket = cache.byNormalizedNo.get(key) ?? [];
  console.log("\nImport cache bucket size:", bucket.length);
  for (const c of bucket) {
    console.log({ id: c.id, policyNo: c.policyNo, svkk: c.insuredParty.svkkPublicId, type: c.policyType.name, holder: c.holderName });
  }

  const typeCache = await buildClaimImportTypeCache();
  const match = await matchPolicyForClaim(
    {
      policyNo: TARGET,
      svkkPublicId: "",
      policyHolderName: "Bhanuben Pravin Chhadva",
      policyTypeText: "",
      policyStartDate: null,
      policyEndDate: null,
      sumInsured: null,
      insuranceCompany: null,
      admissionDate: new Date(Date.UTC(2025, 11, 21)),
      lodgeDate: null,
      claimReceivedDate: null,
    },
    typeCache,
    cache,
  );
  console.log("\nmatch:", match.matchStatus, match.matchReason, match.conflictDetail, match.policyId);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
