/**
 * Manual integration test: policy CSV v2 validate + create-only upload.
 * Usage: npx tsx scripts/test-policy-csv-upload.ts
 * Requires: backend on PORT (default 4000), DB seeded (admin@svkk.local / admin123!).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPolicyCsvSample } from "../src/modules/policy/policy-csv-format.js";
import { parseCsv } from "../src/modules/policy/policy-csv-parse.js";
import { POLICY_CSV_FLAT_HEADERS } from "../src/modules/policy/policy-csv-format.js";
import { buildPolicyCsvSampleDemoRow } from "../src/modules/policy/policy-csv-slots.js";
import { csvCell } from "../src/modules/policy/policy-csv-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV_PATH = join(__dirname, "../test-fixtures/policy-import-api-test.csv");

const BASE = process.env.API_BASE ?? "http://localhost:4000/api/v1";
const EMAIL = process.env.TEST_EMAIL ?? "admin@svkk.local";
const PASSWORD = process.env.TEST_PASSWORD ?? "admin123!";
const CSV_OUT = process.env.CSV_OUT ?? DEFAULT_CSV_PATH;

function buildUniqueTestCsv(): string {
  const suffix = `T${Date.now().toString(36).toUpperCase()}`;
  const demo = buildPolicyCsvSampleDemoRow();
  demo["SVKK ID"] = `CSV-${suffix}`;
  demo["policy no"] = `CSV-POL-${suffix}`;
  demo["ref no"] = `CSV-REF-${suffix}`;
  demo["Customer ID"] = `CSV-CUST-${suffix}`;
  demo["Primary Mobile Number"] = `9${String(Date.now()).slice(-9)}`;
  demo.whatsapp = demo["Primary Mobile Number"];
  demo.email = `csv.${suffix.toLowerCase()}@import-test.svkk.local`;

  const headerLine = POLICY_CSV_FLAT_HEADERS.map(csvCell).join(",");
  const cells = POLICY_CSV_FLAT_HEADERS.map((h) => demo[h] ?? "");
  return `\uFEFF${headerLine}\r\n${cells.map(csvCell).join(",")}\r\n`;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = (await res.json()) as { accessToken?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${body.message ?? JSON.stringify(body)}`);
  }
  if (!body.accessToken) throw new Error("Login response missing accessToken");
  return body.accessToken;
}

async function uploadCsv(
  token: string,
  csvPath: string,
  dryRun: boolean,
  force = false,
): Promise<Record<string, unknown>> {
  const file = await import("node:fs/promises").then((fs) => fs.readFile(csvPath));
  const form = new FormData();
  form.append("file", new Blob([file], { type: "text/csv" }), "policy-import-test.csv");
  form.append("updateMode", "FULL");
  form.append("dryRun", dryRun ? "true" : "false");
  form.append("mode", "CREATE_ONLY");
  form.append("force", force ? "true" : "false");

  const res = await fetch(
    `${BASE}/upload/csv?dryRun=${dryRun}&mode=CREATE_ONLY${force ? "&force=true" : ""}`,
    {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("Policy CSV bulk upload test");
  console.log(`API: ${BASE}`);

  const sample = buildPolicyCsvSample();
  const sampleRows = parseCsv(sample);
  console.log(`Sample CSV columns: ${sampleRows[0]?.length ?? 0}, data rows: ${sampleRows.length - 1}`);

  const csv = buildUniqueTestCsv();
  const csvPath = CSV_OUT;
  await mkdir(dirname(csvPath), { recursive: true });
  await writeFile(csvPath, csv, "utf8");
  console.log(`Wrote test CSV: ${csvPath}`);
  const row2 = csv.split(/\r?\n/)[1] ?? "";
  const header = csv.split(/\r?\n/)[0]?.split(",") ?? [];
  const svkkIdx = header.findIndex((h) => h.trim().toLowerCase() === "svkk id");
  const svkkId = svkkIdx >= 0 ? row2.split(",")[svkkIdx]?.trim() : "";
  if (svkkId) console.log(`Unique SVKK ID in file: ${svkkId}`);

  const token = await login();
  console.log("Login OK");

  const validate = await uploadCsv(token, csvPath, true);
  console.log("\n--- Validate (dryRun) ---");
  console.log(JSON.stringify(validate, null, 2));

  const invalid = Number(validate.invalid ?? 0);
  if (invalid > 0) {
    console.error("\nValidation failed — skipping live upload.");
    process.exit(1);
  }

  const upload = await uploadCsv(token, csvPath, false);
  console.log("\n--- Upload (CREATE_ONLY) ---");
  console.log(JSON.stringify(upload, null, 2));

  const created = Number(upload.created ?? 0);
  const failed = Number(upload.failed ?? 0);

  if (failed > 0 || created < 1) {
    console.error("\nUpload did not create a policy as expected.");
    process.exit(1);
  }

  console.log(`\nSuccess: ${created} policy row(s) created.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
