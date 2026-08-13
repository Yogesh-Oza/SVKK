/**
 * Read-only claim CSV grouping + policy-match preview.
 * Does not create/update claims.
 *
 * Usage:
 *   npx tsx scripts/dry-run-claim-csv-group.ts
 *   CLAIM_CSV_PATH="C:\Users\Yogesh\Downloads\SVKK_Claim_Sample_Tem.csv" npx tsx scripts/dry-run-claim-csv-group.ts
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { ClaimLinkMode, CsvImportMode } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { parseClaimFile, claimRowToMap } from "../src/modules/claim/claim-csv-parse.js";
import { parseClaimRow, validateClaimRow, claimEventIdentityFromRow } from "../src/modules/claim/claim-csv-import.js";
import {
  decideGroupedClaimPreview,
  groupParsedClaimRows,
  normalizeClaimNo,
} from "../src/modules/claim/claim-csv-group.js";
import { matchPolicyForClaim, buildClaimImportPolicyCache, buildClaimImportTypeCache } from "../src/modules/claim/claim-policy-match.js";
import { DEFAULT_CLAIM_STATUS_MAP } from "../src/modules/claim/claim-status-map.js";
import { normalizePolicyNo } from "../src/modules/claim/claim-csv-normalize.js";

const CSV_PATH =
  process.env.CLAIM_CSV_PATH ??
  "C:\\Users\\Yogesh\\Downloads\\SVKK_Claim_Sample_Tem.csv";

const FOCUS_CCN = "MD10022968";
const FOCUS_POLICY = "14010061252800002364";

async function main() {
  console.log("CSV:", CSV_PATH);
  console.log("Mode: READ-ONLY (no claim writes)\n");

  const buffer = await readFile(CSV_PATH);
  const { header, dataRows } = await parseClaimFile(buffer, CSV_PATH);
  const parsedRows = dataRows.map((row, i) =>
    parseClaimRow(i + 2, claimRowToMap(header, row), DEFAULT_CLAIM_STATUS_MAP),
  );
  const groups = groupParsedClaimRows(parsedRows);

  console.log("=== GROUPING (file only) ===");
  console.log("CSV rows:", parsedRows.length);
  console.log("Unique claims:", groups.length);
  console.log(
    "Same-CCN extra rows:",
    groups.reduce((n, g) => n + g.sameEventRows.length, 0),
  );
  console.log(
    "In-file different-event rows:",
    groups.reduce((n, g) => n + g.differentEventRows.length, 0),
  );

  const md = groups.find((g) => normalizeClaimNo(g.claimNo) === FOCUS_CCN);
  console.log(`\n=== ${FOCUS_CCN} ===`);
  if (!md) {
    console.log("Not found in file");
  } else {
    console.log("Source rows:", md.rows.length);
    console.log(
      "Canonical row:",
      md.canonical.rowNumber,
      md.canonical.claimType,
      md.canonical.claimAmount,
      md.canonical.policyNo,
    );
    console.log("Same-claim payment rows:", md.sameEventRows.map((r) => `${r.rowNumber}:${r.claimType}:${r.claimAmount}`));
    console.log("Different-event rows:", md.differentEventRows.map((r) => r.rowNumber));
  }

  const typeCache = await buildClaimImportTypeCache();
  const policyCache = await buildClaimImportPolicyCache();
  const matchByCanonicalRow = new Map();
  for (const group of groups) {
    matchByCanonicalRow.set(
      group.canonical.rowNumber,
      await matchPolicyForClaim(group.canonical.matchInput, typeCache, policyCache),
    );
  }

  const uniqueNos = [...new Set(groups.map((g) => normalizeClaimNo(g.canonical.claimNo)).filter(Boolean))];
  const existing = await prisma.claim.findMany({
    where: { claimNo: { in: uniqueNos } },
    select: {
      claimNo: true,
      policyId: true,
      policyNoText: true,
      admissionDate: true,
      lodgeDate: true,
      claimReceivedDate: true,
      actualLodgeType: true,
      claimType: true,
    },
  });
  const existingByNo = new Map(
    existing.map((c) => [
      c.claimNo,
      {
        claimNo: c.claimNo,
        policyId: c.policyId,
        policyNo: c.policyNoText ?? "",
        admissionDate: c.admissionDate,
        lodgeDate: c.lodgeDate,
        claimReceivedDate: c.claimReceivedDate,
        actualLodgeType: c.actualLodgeType,
        claimType: c.claimType,
      },
    ]),
  );

  const { stats, preview } = decideGroupedClaimPreview({
    groups,
    matchByCanonicalRow,
    existingByNo,
    linkMode: ClaimLinkMode.STRICT_MATCH,
    importMode: CsvImportMode.CREATE_ONLY,
    validateRow: validateClaimRow,
    identityFromRow: claimEventIdentityFromRow,
  });

  console.log("\n=== PREVIEW SUMMARY (unique claims) ===");
  console.log(stats);

  const unlinked = preview.filter(
    (p) => p.sourceRowRole === "canonical" && p.match.matchStatus === "UNLINKED",
  );
  console.log("\n=== UNLINKED unique claims ===");
  for (const p of unlinked) {
    console.log(p.row.rowNumber, p.row.claimNo, p.row.policyNo, p.row.policyHolderName);
  }

  const diffEv = preview.filter((p) => p.sourceRowRole === "different_event");
  console.log("\n=== IN-FILE DIFFERENT EVENT ROWS ===");
  for (const p of diffEv) {
    console.log(
      p.row.rowNumber,
      p.row.claimNo,
      p.row.claimType,
      p.row.admissionDate?.toISOString().slice(0, 10),
      p.row.hospitalName,
    );
  }

  const existingCount = await prisma.claim.count();
  console.log("\nExisting claims in DB (read-only):", existingCount);

  const focusPreview = preview.filter((p) => normalizeClaimNo(p.row.claimNo) === FOCUS_CCN);
  console.log(`\n=== PREVIEW ${FOCUS_CCN} ===`);
  for (const p of focusPreview) {
    console.log({
      row: p.row.rowNumber,
      role: p.sourceRowRole,
      disposition: p.decision.disposition,
      reason: p.decision.dispositionReason,
      match: p.match.matchStatus,
      matchReason: p.match.matchReason,
      amount: p.row.claimAmount,
      lodge: p.row.claimType,
    });
  }

  const live = await prisma.policy.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      policyNo: true,
      holderName: true,
      deletedAt: true,
      policyType: { select: { name: true } },
      insuredParty: { select: { svkkPublicId: true, name: true } },
    },
  });
  const hits = live.filter((p) => normalizePolicyNo(p.policyNo).includes(FOCUS_POLICY.toLowerCase()));
  console.log(`\n=== LIVE POLICIES matching ${FOCUS_POLICY} ===`);
  console.log("count:", hits.length);
  for (const p of hits) {
    console.log({
      id: p.id,
      policyNo: p.policyNo,
      holder: p.holderName ?? p.insuredParty.name,
      type: p.policyType.name,
      svkk: p.insuredParty.svkkPublicId,
    });
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
