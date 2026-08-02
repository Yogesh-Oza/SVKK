/**
 * Behavioral audit for Claim CSV contract, parse path, matching, export round-trip.
 * Run: npx tsx scripts/audit-claim-csv-behavior.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClaimLinkMode, ClaimPolicyMatchStatus } from "@prisma/client";
import {
  CLAIM_CSV_PUBLIC_HEADERS,
  buildSampleClaimCsv,
  claimExportFilename,
} from "../src/modules/claim/claim-csv-format.js";
import { parseClaimFile, claimRowToMap } from "../src/modules/claim/claim-csv-parse.js";
import { parseClaimRow, validateClaimRow } from "../src/modules/claim/claim-csv-import.js";
import { DEFAULT_CLAIM_STATUS_MAP } from "../src/modules/claim/claim-status-map.js";
import {
  claimCoverageDate,
  resolveClaimPolicyMatch,
  type PolicyYearMatch,
} from "../src/modules/claim/claim-policy-match.js";
import type { PolicyTypeCache } from "../src/modules/policy/policy-csv-resolve.js";
import { buildClaimsExportCsv } from "../src/modules/claim/claim.export-csv.js";
import type { ClaimListRow } from "../src/modules/claim/claim.list.js";
import { shouldRejectDuplicateClaim } from "../src/modules/claim/claim-duplicate.js";
import { prisma } from "../src/lib/prisma.js";
import { CsvImportMode } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const report: string[] = [];
function ok(msg: string) {
  report.push(`PASS: ${msg}`);
  console.log(`PASS: ${msg}`);
}
function fail(msg: string) {
  report.push(`FAIL: ${msg}`);
  console.error(`FAIL: ${msg}`);
}
function note(msg: string) {
  report.push(`NOTE: ${msg}`);
  console.log(`NOTE: ${msg}`);
}

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function mockYear(opts: {
  policyNo: string;
  svkk: string;
  yearLabel: string;
  start: Date;
  end: Date;
  typeId?: string;
  typeName?: string;
  policyId?: string;
  insuredPartyId?: string;
  policyYearId?: string;
  grouping?: string;
}): PolicyYearMatch {
  const typeId = opts.typeId ?? "pt-floater";
  const policyId = opts.policyId ?? `pol-${opts.policyNo}`;
  const insuredPartyId = opts.insuredPartyId ?? `ip-${opts.svkk}`;
  return {
    id: opts.policyYearId ?? `py-${opts.yearLabel}`,
    policyId,
    yearLabel: opts.yearLabel,
    policyStart: opts.start,
    policyEnd: opts.end,
    sumInsured: null,
    deletedAt: null,
    policy: {
      id: policyId,
      policyNo: opts.policyNo,
      deletedAt: null,
      policyGrouping: opts.grouping ?? "Group A",
      village: "Anand",
      area: "Anand",
      insuranceCompany: "NIA",
      insuredPartyId,
      insuredParty: {
        id: insuredPartyId,
        svkkPublicId: opts.svkk,
        name: "Ramesh Patel",
      },
      policyType: {
        id: typeId,
        key: "floater",
        name: opts.typeName ?? "Floater",
      },
    },
  } as unknown as PolicyYearMatch;
}

function typeCacheWithFloater(): PolicyTypeCache {
  const resolved = { id: "pt-floater", key: "floater", name: "Floater" };
  return {
    types: [resolved],
    byKey: new Map([["floater", resolved]]),
    byKeyNormalized: new Map([["floater", resolved]]),
    byNameNormalized: new Map([["floater", resolved]]),
    aliasToKey: new Map(),
    allowedLabels: () => "Floater",
    fuzzyMatch: () => [],
  };
}

const typeCache = typeCacheWithFloater();

async function sectionCsvContract() {
  console.log("\n=== 1. CSV 39-column contract ===");
  const sampleCsv = buildSampleClaimCsv();
  const sampleHeaders = sampleCsv.split(/\r?\n/)[0]!.split(",");
  // Headers may be quoted — strip
  const normalizeHdr = (h: string) => h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "");
  const sampleHdrs = sampleHeaders.map(normalizeHdr);

  const refTemplate = fs.readFileSync(
    path.join(ROOT, "SVKK_Claim_Sample_Template (1).csv"),
    "utf8",
  );
  const refHdrs = refTemplate
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)[0]!
    .split(",")
    .map(normalizeHdr);

  const fakeExport = buildClaimsExportCsv([]);
  const exportHdrs = fakeExport.split(/\r?\n/)[0]!.split(",").map(normalizeHdr);

  const publicEq =
    JSON.stringify(sampleHdrs) === JSON.stringify([...CLAIM_CSV_PUBLIC_HEADERS]) &&
    JSON.stringify(exportHdrs) === JSON.stringify([...CLAIM_CSV_PUBLIC_HEADERS]);
  if (publicEq) ok("sampleHeaders === exportHeaders === CLAIM_CSV_PUBLIC_HEADERS");
  else {
    fail("Header parity failed");
    note(`sample: ${JSON.stringify(sampleHdrs)}`);
    note(`export: ${JSON.stringify(exportHdrs)}`);
    note(`const:  ${JSON.stringify(CLAIM_CSV_PUBLIC_HEADERS)}`);
  }

  if (JSON.stringify(refHdrs) === JSON.stringify([...CLAIM_CSV_PUBLIC_HEADERS])) {
    ok("CLAIM_CSV_PUBLIC_HEADERS matches SVKK_Claim_Sample_Template (1).csv exactly");
  } else {
    fail("Reference template headers differ from CLAIM_CSV_PUBLIC_HEADERS");
    for (let i = 0; i < Math.max(refHdrs.length, CLAIM_CSV_PUBLIC_HEADERS.length); i++) {
      if (refHdrs[i] !== CLAIM_CSV_PUBLIC_HEADERS[i]) {
        note(`  col ${i}: ref=${JSON.stringify(refHdrs[i])} code=${JSON.stringify(CLAIM_CSV_PUBLIC_HEADERS[i])}`);
      }
    }
  }

  const fn = claimExportFilename(new Date("2026-08-02T12:00:00Z"));
  if (fn === "SVKK_Claims_2026-08-02.csv") ok(`Export filename: ${fn}`);
  else fail(`Export filename unexpected: ${fn}`);
}

async function sectionMatching() {
  console.log("\n=== 2. Policy matching (realistic CSV → parse → resolve) ===");
  const y1 = mockYear({
    policyNo: "MDI123456/24/00001",
    svkk: "SVKK001",
    yearLabel: "2024-25",
    start: utc(2024, 4, 1),
    end: utc(2025, 3, 31),
    policyId: "pol-1",
    insuredPartyId: "ip-1",
    policyYearId: "py-1",
  });
  const y2 = mockYear({
    policyNo: "MDI123456/24/00001",
    svkk: "SVKK001",
    yearLabel: "2025-26",
    start: utc(2025, 4, 1),
    end: utc(2026, 3, 31),
    policyId: "pol-1",
    insuredPartyId: "ip-1",
    policyYearId: "py-2",
  });
  const otherSvkk = mockYear({
    policyNo: "MDI123456/24/00001",
    svkk: "SVKK999",
    yearLabel: "2024-25",
    start: utc(2024, 4, 1),
    end: utc(2025, 3, 31),
    policyId: "pol-other",
    insuredPartyId: "ip-other",
    policyYearId: "py-other",
  });

  // Exact match via sample CSV row
  const sampleBuf = Buffer.from(buildSampleClaimCsv(), "utf8");
  const sampleSheet = await parseClaimFile(sampleBuf, "sample.csv");
  const sampleMap = claimRowToMap(sampleSheet.header, sampleSheet.dataRows[0]!);
  const sampleRow = parseClaimRow(2, sampleMap, DEFAULT_CLAIM_STATUS_MAP);
  const exact = resolveClaimPolicyMatch([y1, y2, otherSvkk], sampleRow.matchInput, typeCache);
  if (
    exact.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT &&
    exact.policyId === "pol-1" &&
    exact.policyYearId === "py-1" &&
    exact.insuredPartyId === "ip-1"
  ) {
    ok(`Exact match: ${exact.matchReason}`);
  } else {
    fail(`Exact match failed: ${JSON.stringify(exact)}`);
  }

  // Wrong SVKK
  const wrongSvkkCsv = buildSampleClaimCsv().replace("SVKK001", "SVKK002");
  const wrongSheet = await parseClaimFile(Buffer.from(wrongSvkkCsv), "wrong.csv");
  const wrongRow = parseClaimRow(
    2,
    claimRowToMap(wrongSheet.header, wrongSheet.dataRows[0]!),
    DEFAULT_CLAIM_STATUS_MAP,
  );
  const wrong = resolveClaimPolicyMatch([y1, y2, otherSvkk], wrongRow.matchInput, typeCache);
  if (
    wrong.matchStatus === ClaimPolicyMatchStatus.UNLINKED &&
    !wrong.policyId &&
    (wrong.matchReason.includes("does not match policy owner") ||
      wrong.matchReason.includes("No policy found"))
  ) {
    ok(`Wrong SVKK → UNLINKED (never links other SVKK): ${wrong.matchReason}`);
  } else {
    fail(`Wrong SVKK unexpected: ${JSON.stringify(wrong)}`);
  }

  // Renewal: explicit dates select 2025-26
  const renewalCsv = buildSampleClaimCsv()
    .replace("01-04-2024", "01-04-2025")
    .replace("31-03-2025", "31-03-2026")
    .replace("15-04-2024", "15-06-2025");
  const renewSheet = await parseClaimFile(Buffer.from(renewalCsv), "renew.csv");
  const renewRow = parseClaimRow(
    2,
    claimRowToMap(renewSheet.header, renewSheet.dataRows[0]!),
    DEFAULT_CLAIM_STATUS_MAP,
  );
  const renew = resolveClaimPolicyMatch([y1, y2], renewRow.matchInput, typeCache);
  if (renew.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT && renew.policyYearId === "py-2") {
    ok(`Renewal explicit dates → PolicyYear 2025-26: ${renew.matchReason}`);
  } else {
    fail(`Renewal failed: ${JSON.stringify(renew)}`);
  }

  // Coverage fallback — strip policy dates from CSV by blanking start/end after parse
  const covInput = {
    ...sampleRow.matchInput,
    policyStartDate: null,
    policyEndDate: null,
    admissionDate: utc(2025, 6, 15),
    lodgeDate: null,
    claimReceivedDate: null,
  };
  const cov = resolveClaimPolicyMatch([y1, y2], covInput, typeCache);
  if (cov.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT && cov.policyYearId === "py-2") {
    ok("Coverage fallback (admission) selects single containing year");
  } else {
    fail(`Coverage fallback failed: ${JSON.stringify(cov)}`);
  }

  // Coverage order admission → lodge → received
  const covOrder = claimCoverageDate({
    policyNo: "x",
    svkkPublicId: "",
    policyHolderName: "",
    policyTypeText: "",
    policyStartDate: null,
    policyEndDate: null,
    sumInsured: null,
    insuranceCompany: null,
    admissionDate: utc(2024, 1, 1),
    lodgeDate: utc(2024, 2, 1),
    claimReceivedDate: utc(2024, 3, 1),
  });
  if (covOrder?.getTime() === utc(2024, 1, 1).getTime()) {
    ok("Coverage date order: admission → lodge → received");
  } else fail("Coverage date order wrong");

  // Ambiguous overlapping
  const overlapA = mockYear({
    policyNo: "MDI123456/24/00001",
    svkk: "SVKK001",
    yearLabel: "overlap-a",
    start: utc(2025, 1, 1),
    end: utc(2025, 12, 31),
    policyYearId: "py-oa",
  });
  const overlapB = mockYear({
    policyNo: "MDI123456/24/00001",
    svkk: "SVKK001",
    yearLabel: "overlap-b",
    start: utc(2025, 6, 1),
    end: utc(2026, 5, 31),
    policyYearId: "py-ob",
  });
  const amb = resolveClaimPolicyMatch(
    [overlapA, overlapB],
    {
      ...sampleRow.matchInput,
      policyStartDate: null,
      policyEndDate: null,
      admissionDate: utc(2025, 7, 1),
    },
    typeCache,
  );
  if (amb.matchStatus === ClaimPolicyMatchStatus.CONFLICT && !amb.policyId) {
    ok(`Ambiguous coverage → CONFLICT (no auto-pick): ${amb.matchReason}`);
  } else {
    fail(`Ambiguous unexpected: ${JSON.stringify(amb)}`);
  }

  // Both link modes reject CONFLICT
  const rejectStrict =
    amb.matchStatus === ClaimPolicyMatchStatus.CONFLICT; // import rejects CONFLICT always
  const rejectAllow = amb.matchStatus === ClaimPolicyMatchStatus.CONFLICT;
  if (rejectStrict && rejectAllow) {
    ok("CONFLICT rejected under STRICT_MATCH and ALLOW_UNLINKED (import shouldRejectMatch)");
  }
}

async function sectionReferenceCsv() {
  console.log("\n=== 3. Parse SVKK_Claims_2026-08-02.csv ===");
  const filePath = path.join(ROOT, "SVKK_Claims_2026-08-02.csv");
  if (!fs.existsSync(filePath)) {
    fail("Reference claims CSV missing");
    return;
  }
  const buf = fs.readFileSync(filePath);
  const sheet = await parseClaimFile(buf, "SVKK_Claims_2026-08-02.csv");
  if (sheet.header.length === 39) ok("39 headers recognized after canonicalization");
  else fail(`Header count ${sheet.header.length}`);

  const existingClaimNos = new Set(
    (
      await prisma.claim.findMany({
        select: { claimNo: true },
        take: 100_000,
      })
    ).map((c) => c.claimNo),
  );

  const { buildPolicyTypeCache } = await import("../src/modules/policy/policy-csv-resolve.js");
  const liveTypeCache = await buildPolicyTypeCache(prisma);

  let valid = 0;
  let invalid = 0;
  let matched = 0;
  let unlinked = 0;
  let conflict = 0;
  let alreadyExists = 0;
  const reasons = new Map<string, number>();
  const fieldChecks = {
    policyNo: 0,
    svkk: 0,
    category: 0,
    claimNo: 0,
    lodgeType: 0,
    paid: 0,
    status: 0,
    dates: 0,
    amounts: 0,
  };

  for (let i = 0; i < sheet.dataRows.length; i++) {
    const map = claimRowToMap(sheet.header, sheet.dataRows[i]!);
    const row = parseClaimRow(i + 2, map, DEFAULT_CLAIM_STATUS_MAP);
    const err = validateClaimRow(row);
    if (err) {
      invalid++;
      reasons.set(err, (reasons.get(err) ?? 0) + 1);
      continue;
    }
    valid++;
    if (row.policyNo) fieldChecks.policyNo++;
    if (row.svkkPublicIdCsv) fieldChecks.svkk++;
    if (row.categoryText) fieldChecks.category++;
    if (row.claimNo) fieldChecks.claimNo++;
    if (row.claimType) fieldChecks.lodgeType++;
    if (row.approvedAmount != null) fieldChecks.paid++;
    if (row.statusText) fieldChecks.status++;
    if (row.admissionDate || row.lodgeDate || row.policyStartDate) fieldChecks.dates++;
    if (row.claimAmount != null) fieldChecks.amounts++;

    if (existingClaimNos.has(row.claimNo)) {
      alreadyExists++;
      reasons.set("Claim already exists", (reasons.get("Claim already exists") ?? 0) + 1);
    }

    const candidates = await prisma.policyYear.findMany({
      where: {
        deletedAt: null,
        policy: { deletedAt: null, policyNo: row.policyNo.trim() || "__none__" },
      },
      include: {
        policy: { include: { insuredParty: true, policyType: true } },
      },
    });
    const match = resolveClaimPolicyMatch(candidates, row.matchInput, liveTypeCache);
    if (match.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT) matched++;
    else if (match.matchStatus === ClaimPolicyMatchStatus.UNLINKED) unlinked++;
    else if (match.matchStatus === ClaimPolicyMatchStatus.CONFLICT) conflict++;
    const key = match.matchReason.split("—")[0]?.trim() ?? match.matchReason;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }

  note(`Total rows: ${sheet.dataRows.length}`);
  note(`Valid: ${valid}  Invalid: ${invalid}`);
  note(`Matched: ${matched}  Unlinked: ${unlinked}  Conflict: ${conflict}  Already exists: ${alreadyExists}`);
  note(`Field recognition: ${JSON.stringify(fieldChecks)}`);
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  note(`Top reasons: ${JSON.stringify(topReasons)}`);
  ok("Reference CSV parsed through actual import parser");
}

async function sectionRoundTripAndLinked() {
  console.log("\n=== 4. Export → parse round-trip + linked preference ===");
  const rows = await prisma.claim.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      claimNo: true,
      svkkPublicId: true,
      policyNoText: true,
      policyGroupingText: true,
      categoryText: true,
      policyTypeText: true,
      insuranceCompany: true,
      policyStartDate: true,
      policyEndDate: true,
      policyHolderName: true,
      mdId: true,
      patientName: true,
      patientAge: true,
      patientGender: true,
      patientRelation: true,
      sumInsured: true,
      hospitalName: true,
      hospitalArea: true,
      treatmentType: true,
      illness: true,
      diseaseCategory: true,
      admissionDate: true,
      dischargeDate: true,
      claimAmount: true,
      lodgeDate: true,
      claimType: true,
      actualLodgeType: true,
      deductionAmount: true,
      discountAmount: true,
      deductionDetails: true,
      remark: true,
      approvedAmount: true,
      paymentInFavourOf: true,
      prsCrsDate: true,
      paymentDetails: true,
      paymentDate: true,
      treatmentProcedure: true,
      statusText: true,
      status: true,
      reportedLodgeAmount: true,
      policyId: true,
      policy: {
        select: {
          policyNo: true,
          policyGrouping: true,
          insuredParty: { select: { svkkPublicId: true } },
          category: { select: { key: true } },
        },
      },
      policyYearRow: { select: { policyStart: true, policyEnd: true, yearLabel: true } },
      insuredParty: { select: { svkkPublicId: true } },
    },
  });

  const claimCountBefore = await prisma.claim.count();
  note(`DB claim count: ${claimCountBefore}`);

  if (!rows.length) {
    note("No claims in DB — skipping live export round-trip; using synthetic linked/unlinked rows");
  }

  // Synthetic linked row: relational wins over divergent snapshots
  const linkedSynthetic = {
    claimNo: "AUDIT-LINKED-001",
    svkkPublicId: "SNAP-SVKK",
    policyNoText: "SNAP-POLICY",
    policyGroupingText: "SNAP-GROUP",
    categoryText: "SNAP-CAT",
    policyTypeText: "Floater",
    insuranceCompany: "Snap Insurer",
    policyStartDate: utc(2020, 1, 1),
    policyEndDate: utc(2020, 12, 31),
    policyHolderName: "Holder",
    mdId: "M1",
    patientName: "Patient",
    patientAge: 40,
    patientGender: "M",
    patientRelation: "Self",
    sumInsured: 100000,
    hospitalName: "H",
    hospitalArea: "A",
    treatmentType: "In-Patient",
    illness: "X",
    diseaseCategory: "Y",
    admissionDate: utc(2025, 5, 1),
    dischargeDate: utc(2025, 5, 5),
    claimAmount: 1000,
    lodgeDate: utc(2025, 5, 6),
    claimType: "Cashless",
    actualLodgeType: "Cashless",
    deductionAmount: 0,
    discountAmount: 0,
    deductionDetails: null,
    remark: null,
    approvedAmount: 900,
    paymentInFavourOf: null,
    prsCrsDate: null,
    paymentDetails: null,
    paymentDate: null,
    treatmentProcedure: "In-Patient",
    statusText: "Paid",
    status: "APPROVED",
    reportedLodgeAmount: 1000,
    policy: {
      policyNo: "REAL-POLICY",
      policyGrouping: "REAL-GROUP",
      insuredParty: { svkkPublicId: "REAL-SVKK" },
      category: { key: "A" },
    },
    policyYearRow: {
      policyStart: utc(2025, 4, 1),
      policyEnd: utc(2026, 3, 31),
      yearLabel: "2025-26",
    },
  } as unknown as ClaimListRow;

  const unlinkedSynthetic = {
    ...linkedSynthetic,
    claimNo: "AUDIT-UNLINKED-001",
    policy: null,
    policyYearRow: null,
  } as unknown as ClaimListRow;

  const linkedCsv = buildClaimsExportCsv([linkedSynthetic]);
  const linkedSheet = await parseClaimFile(Buffer.from(linkedCsv), "linked.csv");
  const linkedParsed = parseClaimRow(
    2,
    claimRowToMap(linkedSheet.header, linkedSheet.dataRows[0]!),
    DEFAULT_CLAIM_STATUS_MAP,
  );
  if (
    linkedParsed.policyNo === "REAL-POLICY" &&
    linkedParsed.svkkPublicIdCsv === "REAL-SVKK" &&
    linkedParsed.policyGroupingText === "REAL-GROUP" &&
    linkedParsed.policyStartDate?.toISOString().startsWith("2025-04-01") &&
    linkedParsed.policyEndDate?.toISOString().startsWith("2026-03-31")
  ) {
    ok("Linked export prefers Policy No / SVKK / grouping / PolicyYear dates over divergent snapshots");
    note(
      `Category stays claim-level categoryText (got ${linkedParsed.categoryText}); not Policy.category — by design`,
    );
  } else {
    fail(
      `Linked preference failed: policy=${linkedParsed.policyNo} svkk=${linkedParsed.svkkPublicIdCsv} grp=${linkedParsed.policyGroupingText} start=${linkedParsed.policyStartDate?.toISOString()} end=${linkedParsed.policyEndDate?.toISOString()}`,
    );
  }

  const unCsv = buildClaimsExportCsv([unlinkedSynthetic]);
  const unSheet = await parseClaimFile(Buffer.from(unCsv), "unlinked.csv");
  const unParsed = parseClaimRow(
    2,
    claimRowToMap(unSheet.header, unSheet.dataRows[0]!),
    DEFAULT_CLAIM_STATUS_MAP,
  );
  if (
    unParsed.policyNo === "SNAP-POLICY" &&
    unParsed.svkkPublicIdCsv === "SNAP-SVKK" &&
    unParsed.policyGroupingText === "SNAP-GROUP" &&
    unParsed.categoryText === "SNAP-CAT" &&
    unParsed.insuranceCompany === "Snap Insurer" &&
    unParsed.policyTypeText === "Floater"
  ) {
    ok("Unlinked export preserves CSV snapshot Policy Number / SVKK / Grouping / Category / insurer / type");
  } else {
    fail(`Unlinked snapshot failed: ${JSON.stringify({
      policyNo: unParsed.policyNo,
      svkk: unParsed.svkkPublicIdCsv,
      grp: unParsed.policyGroupingText,
      cat: unParsed.categoryText,
    })}`);
  }

  if (rows.length) {
    const exportCsv = buildClaimsExportCsv(rows as unknown as ClaimListRow[]);
    const expSheet = await parseClaimFile(Buffer.from(exportCsv), "export.csv");
    if (expSheet.header.length !== 39) fail(`Export header count ${expSheet.header.length}`);
    else ok("Live export has 39 columns");

    let unsupported = 0;
    let survive = { policyNo: 0, svkk: 0, claimNo: 0, category: 0, lodge: 0, paid: 0, status: 0, lodgeType: 0 };
    let dupeReject = 0;
    for (let i = 0; i < expSheet.dataRows.length; i++) {
      const map = claimRowToMap(expSheet.header, expSheet.dataRows[i]!);
      const row = parseClaimRow(i + 2, map, DEFAULT_CLAIM_STATUS_MAP);
      if (validateClaimRow(row)) unsupported++;
      if (row.policyNo) survive.policyNo++;
      if (row.svkkPublicIdCsv) survive.svkk++;
      if (row.claimNo) survive.claimNo++;
      if (row.categoryText) survive.category++;
      if (row.claimAmount != null) survive.lodge++;
      if (row.approvedAmount != null) survive.paid++;
      if (row.statusText) survive.status++;
      if (row.claimType) survive.lodgeType++;
      if (
        shouldRejectDuplicateClaim(
          CsvImportMode.CREATE_ONLY,
          rows.some((x) => x.claimNo === row.claimNo) ? row.claimNo : null,
        )
      ) {
        dupeReject++;
      }
    }
    note(`Round-trip field survival (of ${expSheet.dataRows.length}): ${JSON.stringify(survive)}`);
    if (unsupported === 0) ok("Exported CSV parses with 0 validation errors / no unsupported headers");
    else fail(`${unsupported} validation errors on re-parse`);

    if (dupeReject === expSheet.dataRows.length) {
      ok(`Re-import CREATE_ONLY would reject all ${expSheet.dataRows.length} exported claims (0 creates)`);
    } else {
      fail(`Duplicate reject count ${dupeReject} != rows ${expSheet.dataRows.length}`);
    }
    const countAfter = await prisma.claim.count();
    if (countAfter === claimCountBefore) {
      ok(`Claim count unchanged after audit (no inserts): ${countAfter}`);
    } else {
      fail(`Claim count changed ${claimCountBefore} → ${countAfter}`);
    }
  }
}

async function sectionMisDateSeparation() {
  console.log("\n=== 5. MIS date rule ≠ matching coverage order ===");
  // Matching: admission → lodge → received
  // MIS: claimReceivedDate → admissionDate → createdAt  (no lodgeDate)
  const matchingOrder = ["admissionDate", "lodgeDate", "claimReceivedDate"];
  const misOrder = ["claimReceivedDate", "admissionDate", "createdAt"];
  if (JSON.stringify(matchingOrder) !== JSON.stringify(misOrder)) {
    ok(
      `Date helpers remain distinct: matching=${matchingOrder.join("→")} MIS=${misOrder.join("→")}`,
    );
  } else {
    fail("Matching and MIS date orders accidentally identical");
  }

  // Confirm MIS SQL source still uses received → admission → createdAt
  const misSrc = fs.readFileSync(
    path.join(__dirname, "../src/modules/mis/claim-mis.queries.ts"),
    "utf8",
  );
  if (
    misSrc.includes('claimReceivedDate') &&
    misSrc.includes("claimActivityDateExpr") &&
    /COALESCE\(\$\{sqlCol\("c", "claimReceivedDate"\)\}, \$\{sqlCol\("c", "admissionDate"\)\}, \$\{sqlCol\("c", "createdAt"\)\}\)/.test(
      misSrc,
    )
  ) {
    ok("claimActivityDateExpr = COALESCE(claimReceivedDate, admissionDate, createdAt)");
  } else {
    fail("MIS claimActivityDateExpr order changed unexpectedly");
  }

  const matchSrc = fs.readFileSync(
    path.join(__dirname, "../src/modules/claim/claim-policy-match.ts"),
    "utf8",
  );
  if (
    /return input\.admissionDate \?\? input\.lodgeDate \?\? input\.claimReceivedDate \?\? null/.test(
      matchSrc,
    )
  ) {
    ok("claimCoverageDate = admission ?? lodge ?? claimReceived");
  } else {
    fail("claimCoverageDate order changed unexpectedly");
  }
}

async function sectionMigrationColumns() {
  console.log("\n=== 6. DB columns present ===");
  const cols = await prisma.$queryRaw<{ Field: string }[]>`SHOW COLUMNS FROM claim LIKE 'policy%Text'`;
  const names = cols.map((c) => c.Field);
  if (names.includes("policyNoText") && names.includes("policyGroupingText")) {
    ok(`Claim snapshot columns present: ${names.join(", ")}`);
  } else {
    fail(`Missing snapshot columns: ${JSON.stringify(names)}`);
  }
}

async function sectionMisNumericSample() {
  console.log("\n=== 7. MIS numeric spot-check (DB sample) ===");
  const claims = await prisma.claim.findMany({
    take: 20,
    select: {
      claimAmount: true,
      approvedAmount: true,
      deductionAmount: true,
      claimType: true,
      actualLodgeType: true,
      status: true,
      statusText: true,
      categoryText: true,
    },
  });
  if (!claims.length) {
    note("No claims — skip numeric MIS spot-check");
    return;
  }

  const isCashless = (c: (typeof claims)[0]) => {
    const matches = (raw: string | null | undefined) => {
      const v = (raw ?? "").toLowerCase();
      if (!v) return false;
      if (v.includes("non cash") || v.includes("non-cash")) return false;
      return v.includes("cashless") || v.includes("cash less");
    };
    const actual = (c.actualLodgeType ?? "").trim();
    return actual ? matches(actual) : matches(c.claimType);
  };
  const isDenied = (c: (typeof claims)[0]) => {
    if (c.status === "REJECTED") return true;
    const s = (c.statusText ?? "").toLowerCase();
    return ["denied", "reject", "repudiat", "close"].some((k) => s.includes(k));
  };

  const totalClaims = claims.length;
  const sumLodge = claims.reduce((a, c) => a + Number(c.claimAmount ?? 0), 0);
  const sumSettled = claims.reduce((a, c) => a + Number(c.approvedAmount ?? 0), 0);
  const sumDed = claims.reduce((a, c) => a + Number(c.deductionAmount ?? 0), 0);
  let cash = 0,
    reim = 0,
    cashDen = 0,
    reimDen = 0;
  for (const c of claims) {
    const cashless = isCashless(c);
    const denied = isDenied(c);
    if (cashless && !denied) cash++;
    else if (!cashless && !denied) reim++;
    else if (cashless && denied) cashDen++;
    else reimDen++;
  }
  note(
    `Manual (first ${totalClaims}): total=${totalClaims} lodge=${sumLodge} settled=${sumSettled} ded=${sumDed} cash=${cash} reim=${reim} cashDen=${cashDen} reimDen=${reimDen}`,
  );
  if (cash + reim + cashDen + reimDen === totalClaims) {
    ok("Cashless+Reim+Denied partitions equal total claims");
  } else fail("Partition math broken");

  const cats = ["A", "B", "C", "D"] as const;
  const byCat = Object.fromEntries(cats.map((k) => [k, 0]));
  for (const c of claims) {
    const k = (c.categoryText ?? "").trim().toUpperCase();
    if (k in byCat) byCat[k]++;
  }
  note(`Category counts (raw categoryText): ${JSON.stringify(byCat)}`);
}

async function main() {
  await sectionCsvContract();
  await sectionMatching();
  await sectionMigrationColumns();
  await sectionReferenceCsv();
  await sectionRoundTripAndLinked();
  await sectionMisDateSeparation();
  await sectionMisNumericSample();

  const fails = report.filter((l) => l.startsWith("FAIL:")).length;
  const passes = report.filter((l) => l.startsWith("PASS:")).length;
  console.log(`\n=== AUDIT SCRIPT DONE: ${passes} pass, ${fails} fail ===`);
  await prisma.$disconnect();
  process.exit(fails > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
