/**
 * Upload SVKK_Claim_Sample_Template via claim CSV preview + confirm API.
 * Usage: npx tsx scripts/test-claim-csv-upload-sample.ts
 * Requires: backend on PORT (default 4000), admin@svkk.local / admin123!
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CSV_PATH =
  process.env.CLAIM_CSV_PATH ??
  join(ROOT, "SVKK_Claim_Sample_Template (1).csv");

const BASE = process.env.API_BASE ?? "http://localhost:4000/api/v1";
const EMAIL = process.env.TEST_EMAIL ?? "admin@svkk.local";
const PASSWORD = process.env.TEST_PASSWORD ?? "admin123!";

type PreviewRes = {
  previewToken: string;
  totalRows: number;
  matchStats?: Record<string, number>;
  previewRows?: Array<{
    claimNo: string;
    policyNo: string;
    matchStatus: string;
    matchReason?: string;
    alreadyExists?: boolean;
    claimAmount?: number | null;
  }>;
};

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { accessToken?: string; token?: string; message?: string };
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  const token = json.accessToken ?? json.token;
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(json).slice(0, 300)}`);
  return token;
}

async function main() {
  console.log("CSV:", CSV_PATH);
  console.log("API:", BASE);

  const before = await prisma.claim.count();
  console.log("Claim count before:", before);

  const token = await login();
  console.log("Login OK");

  const buf = await readFile(CSV_PATH);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "text/csv" }), "SVKK_Claim_Sample_Template.csv");
  form.append("linkMode", "STRICT_MATCH");
  form.append("importMode", "CREATE_ONLY");

  const previewRes = await fetch(`${BASE}/upload/claim-csv/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const previewText = await previewRes.text();
  let preview: PreviewRes;
  try {
    preview = JSON.parse(previewText) as PreviewRes;
  } catch {
    throw new Error(`Preview not JSON (${previewRes.status}): ${previewText.slice(0, 400)}`);
  }
  if (!previewRes.ok) {
    throw new Error(`Preview failed ${previewRes.status}: ${previewText.slice(0, 500)}`);
  }

  console.log("\n=== PREVIEW ===");
  console.log("totalRows:", preview.totalRows);
  console.log("matchStats:", preview.matchStats);
  console.log("previewRows:", JSON.stringify(preview.previewRows, null, 2));

  const row = preview.previewRows?.[0];
  if (!row) throw new Error("No preview rows");
  if (row.alreadyExists) {
    console.log("Claim already exists — skipping confirm (duplicate protection OK)");
  } else if (row.matchStatus !== "MATCHED_EXACT") {
    throw new Error(`Expected MATCHED_EXACT, got ${row.matchStatus}: ${row.matchReason}`);
  } else {
    const confirmRes = await fetch(`${BASE}/upload/claim-csv/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        previewToken: preview.previewToken,
        linkMode: "STRICT_MATCH",
        importMode: "CREATE_ONLY",
      }),
    });
    const confirmText = await confirmRes.text();
    console.log("\n=== CONFIRM ===");
    console.log("status:", confirmRes.status);
    console.log(confirmText.slice(0, 800));
    if (!confirmRes.ok) throw new Error(`Confirm failed: ${confirmText.slice(0, 500)}`);
  }

  const after = await prisma.claim.count();
  const created = await prisma.claim.findFirst({
    where: { claimNo: row.claimNo },
    select: {
      id: true,
      claimNo: true,
      svkkPublicId: true,
      policyId: true,
      policyYearId: true,
      insuredPartyId: true,
      matchStatus: true,
      policyNoText: true,
      policyGroupingText: true,
      categoryText: true,
      claimAmount: true,
      approvedAmount: true,
      statusText: true,
      hospitalName: true,
      policy: { select: { policyNo: true, policyGrouping: true } },
      policyYearRow: { select: { yearLabel: true, policyStart: true, policyEnd: true } },
      insuredParty: { select: { svkkPublicId: true, name: true } },
    },
  });

  console.log("\n=== VERIFY DB ===");
  console.log("Claim count after:", after, `(delta ${after - before})`);
  console.log(JSON.stringify(created, null, 2));

  if (!created) throw new Error("Claim not found in DB after upload");
  if (created.matchStatus !== "MATCHED_EXACT") {
    throw new Error(`DB matchStatus ${created.matchStatus}`);
  }
  if (created.policy?.policyNo !== "PO-14010061252800005144") {
    throw new Error(`Wrong linked policyNo: ${created.policy?.policyNo}`);
  }
  if (created.insuredParty?.svkkPublicId !== "RTYFEB0042") {
    throw new Error(`Wrong SVKK: ${created.insuredParty?.svkkPublicId}`);
  }
  if (created.policyYearRow?.yearLabel !== "2025-26") {
    throw new Error(`Wrong policy year: ${created.policyYearRow?.yearLabel}`);
  }

  console.log("\nPASS: claim uploaded, matched, and linked correctly.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
