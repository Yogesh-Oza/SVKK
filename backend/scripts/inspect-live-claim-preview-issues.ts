/**
 * Read-only live checks: unlinked policy search + preview warning breakdown.
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.LIVE_API_BASE ?? "https://svkk.techui.co.in/api/v1";
const EMAIL = process.env.TEST_EMAIL ?? "admin@svkk.local";
const PASSWORD = process.env.TEST_PASSWORD ?? "admin123!";
const CSV_PATH =
  process.env.CLAIM_CSV_PATH ?? "C:\\Users\\Yogesh\\Downloads\\SVKK_Claim_Sample_Tem.csv";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { accessToken?: string; token?: string; message?: string };
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  const token = json.accessToken ?? json.token;
  if (!token) throw new Error("No token");
  return token;
}

async function main() {
  const token = await login();
  console.log("Login OK", BASE);

  for (const q of ["14010034242800004866", "Rekha Hasmukh Satra", "MDI9918783"]) {
    const url = new URL(`${BASE}/policies`);
    url.searchParams.set("search", q);
    url.searchParams.set("groupBySvkk", "false");
    url.searchParams.set("pageSize", "20");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { total?: number; items?: Array<Record<string, unknown>> };
    console.log("\nSEARCH", q, "total", json.total ?? json.items?.length);
    for (const row of json.items ?? []) {
      console.log({
        id: row.id,
        policyNo: row.policyNo,
        holder: row.holderName,
        svkk: row.svkkPublicId,
        type: (row.policyType as { name?: string } | undefined)?.name,
        village: row.village,
      });
    }
  }

  const buf = await readFile(CSV_PATH);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "text/csv" }), "SVKK_Claim_Sample_Tem.csv");
  form.append("linkMode", "STRICT_MATCH");
  form.append("importMode", "CREATE_ONLY");
  const previewRes = await fetch(`${BASE}/upload/claim-csv/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const previewText = await previewRes.text();
  if (!previewRes.ok) throw new Error(`Preview ${previewRes.status}: ${previewText.slice(0, 500)}`);
  const preview = JSON.parse(previewText) as {
    summary: Record<string, number>;
    previewRows: Array<{
      rowNumber: number;
      claimNo: string;
      policyNo: string;
      matchStatus: string;
      disposition: string;
      dispositionReason?: string;
      verificationWarnings?: string[];
      sourceRowRole?: string;
      matchReason?: string;
    }>;
  };
  console.log("\n=== SUMMARY ===");
  console.log(preview.summary);

  const warnCounts = new Map<string, number>();
  for (const row of preview.previewRows) {
    if (row.sourceRowRole && row.sourceRowRole !== "canonical") continue;
    for (const w of row.verificationWarnings ?? []) {
      warnCounts.set(w, (warnCounts.get(w) ?? 0) + 1);
    }
  }
  console.log("\n=== WARNING CODES (unique claims) ===");
  console.log([...warnCounts.entries()].sort((a, b) => b[1] - a[1]));

  console.log("\n=== REJECT / UNLINKED / CONFLICT ===");
  for (const row of preview.previewRows) {
    if (row.matchStatus === "UNLINKED" || row.matchStatus === "CONFLICT" || row.disposition === "WILL_REJECT") {
      console.log({
        row: row.rowNumber,
        ccn: row.claimNo,
        policy: row.policyNo,
        role: row.sourceRowRole,
        match: row.matchStatus,
        disp: row.disposition,
        reason: row.dispositionReason,
        why: row.matchReason,
        warnings: row.verificationWarnings,
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
